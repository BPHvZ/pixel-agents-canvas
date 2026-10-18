// @ts-check
import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import fs, { mkdir, open, readdir, unlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

/** @typedef {import("./product-types.js").Preferences} Preferences */
/** @typedef {import("./product-types.js").Appearance} Appearance */
/** @typedef {"INVALID_PREFERENCES" | "CORRUPT_PREFERENCES" | "PREFERENCE_IO"} PreferenceErrorCode */

/** Content-free failure that the extension can translate to a CanvasError. */
export class PreferenceError extends Error {
    /** @param {PreferenceErrorCode} code */
    constructor(code) {
        super({
            INVALID_PREFERENCES: "Invalid presentation preferences.",
            CORRUPT_PREFERENCES: "Unrecognized or corrupt presentation preferences.",
            PREFERENCE_IO: "Presentation preference storage failed.",
        }[code]);
        this.name = "PreferenceError";
        this.code = code;
    }
}

const SETTING_KEYS = ["hideTitles", "hiddenSessionTitles", "showEnded", "vignettes", "dialogue"];
const PREFERENCE_KEYS = [...SETTING_KEYS, "appearances"];
const APPEARANCE_KEYS = ["nickname", "palette", "outfit", "accessory", "deskProp"];
const MAX_RECORD_BYTES = 1_048_576;

/** @returns {Preferences} */
export function defaultPreferences() {
    return { hideTitles: false, hiddenSessionTitles: {}, showEnded: true, vignettes: true, dialogue: true, appearances: {} };
}

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
    const prototype = /** @type {unknown} */ (Object.getPrototypeOf(value));
    return (prototype === null || prototype === Object.prototype)
        && Reflect.ownKeys(value).every((key) => {
            const descriptor = Object.getOwnPropertyDescriptor(value, key);
            return typeof key === "string" && descriptor?.enumerable === true && Object.hasOwn(descriptor, "value");
        });
}

/** @returns {never} */
function invalid() {
    throw new PreferenceError("INVALID_PREFERENCES");
}

/** @param {unknown} input @param {string[]} keys @param {boolean} [partial] @returns {Record<string, unknown>} */
function objectWithKeys(input, keys, partial = false) {
    if (!isRecord(input) || Object.keys(input).some((key) => !keys.includes(key))
        || (!partial && keys.some((key) => !Object.hasOwn(input, key)))) invalid();
    return input;
}

/** Stable opaque provider/session identifiers only, never titles or paths. @param {string} key */
function validateIdentity(key) {
    if (!/^[A-Za-z0-9][A-Za-z0-9:._-]{0,255}$/.test(key) || ["__proto__", "prototype", "constructor"].includes(key)) invalid();
}

/** @param {unknown} input @returns {Appearance} */
function validateAppearance(input) {
    const value = objectWithKeys(input, APPEARANCE_KEYS);
    const { nickname, palette, outfit, accessory, deskProp } = value;
    if (typeof nickname !== "string" || nickname.length > 64 || [...nickname].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
        || typeof palette !== "string" || !/^#[0-9a-fA-F]{6}$/.test(palette)
        || (outfit !== "shirt" && outfit !== "vest" && outfit !== "overalls")
        || (accessory !== "none" && accessory !== "glasses" && accessory !== "cap")
        || (deskProp !== "none" && deskProp !== "plant" && deskProp !== "mug" && deskProp !== "book")) invalid();
    return { nickname, palette, outfit, accessory, deskProp };
}

/** @template T @param {unknown} input @param {(value: unknown) => T} validate @returns {Record<string, T>} */
function validateMap(input, validate) {
    if (!isRecord(input)) invalid();
    /** @type {Record<string, T>} */
    const result = {};
    for (const [key, value] of Object.entries(input)) {
        validateIdentity(key);
        result[key] = validate(value);
    }
    return result;
}

/** @param {unknown} value @returns {boolean} */
function validateBoolean(value) {
    if (typeof value !== "boolean") invalid();
    return value;
}

/**
 * Validate a complete Preferences value, rejecting unknown fields (including content/history).
 * Returns a detached copy. Identities: 1–256 ASCII identifier characters; settings record: at most 1 MiB.
 * Nicknames: at most 64 UTF-16 code units, no controls; palette: #RRGGBB. No coercion/truncation.
 * @param {unknown} input @returns {Preferences}
 */
export function validatePreferences(input) {
    const value = objectWithKeys(input, PREFERENCE_KEYS);
    const result = {
        hideTitles: validateBoolean(value.hideTitles),
        hiddenSessionTitles: validateMap(value.hiddenSessionTitles, validateBoolean),
        showEnded: validateBoolean(value.showEnded),
        vignettes: validateBoolean(value.vignettes),
        dialogue: validateBoolean(value.dialogue),
        appearances: validateMap(value.appearances, validateAppearance),
    };
    if (Buffer.byteLength(JSON.stringify({ version: 1, kind: "settings", settings: settings(result) }), "utf8") > MAX_RECORD_BYTES) invalid();
    return result;
}

/** @param {string} value @returns {string} */
const hash = (value) => createHash("sha256").update(value).digest("hex");
const SETTINGS_FILE = `${hash("settings")}.json`;
/** @param {string} identity @returns {string} */
const appearanceFile = (identity) => `${hash(`appearance:${identity}`)}.json`;

/** @param {unknown} error @param {string} code @returns {boolean} */
function hasCode(error, code) {
    return error instanceof Error && "code" in error && error.code === code;
}

/** @param {Preferences} preferences @returns {Omit<Preferences, "appearances">} */
function settings(preferences) {
    return {
        hideTitles: preferences.hideTitles,
        hiddenSessionTitles: preferences.hiddenSessionTitles,
        showEnded: preferences.showEnded,
        vignettes: preferences.vignettes,
        dialogue: preferences.dialogue,
    };
}

/** @param {string} filename @returns {Promise<unknown>} */
async function readRecord(filename) {
    const file = await open(filename, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
        const info = await file.stat();
        if (!info.isFile() || info.size > MAX_RECORD_BYTES) throw new PreferenceError("CORRUPT_PREFERENCES");
        const text = await file.readFile("utf8");
        try {
            const parsed = /** @type {unknown} */ (JSON.parse(text));
            return parsed;
        } catch {
            throw new PreferenceError("CORRUPT_PREFERENCES");
        }
    } finally {
        await file.close();
    }
}

/** @param {string} directory @param {string} filename @param {object} record */
async function replaceRecord(directory, filename, record) {
    const temporary = path.join(directory, `.${randomUUID()}.tmp`);
    let created = false;
    try {
        const file = await open(temporary, "wx", 0o600);
        created = true;
        try {
            await file.writeFile(JSON.stringify(record), "utf8");
            await file.sync();
        } finally {
            await file.close();
        }
        await fs.rename(temporary, path.join(directory, filename));
    } catch (error) {
        if (created) {
            try {
                await unlink(temporary);
            } catch (cleanupError) {
                if (!hasCode(cleanupError, "ENOENT")) throw cleanupError;
            }
        }
        throw error;
    }
}

/**
 * Private workspace-scoped presentation storage (ADRs 0002/0004/0008); no SDK dependency.
 * `directory` overrides the final storage directory, including workspace scoping.
 * Otherwise use COPILOT_HOME verbatim when nonempty, or ~/.copilot, then
 * extension-data/pixel-agents-canvas/SHA256(workspaceId ?? process.cwd()).
 *
 * read(): fresh validated snapshot, defaults if absent; corruption/I/O throws PreferenceError.
 * write(unknown): full Preferences or top-level patch, validated before any mutation.
 * Omitted settings stay unchanged; hiddenSessionTitles replaces that entire map.
 * Appearances are complete per-identity upserts, not replacements/deletions; {} is a no-op.
 * Each record is atomically replaced; different appearance identities cannot clobber each other.
 * Settings and same-identity writes are last-writer-wins, not a cross-record transaction;
 * a later record failure may leave earlier records committed. A successful write returns read().
 * Corrupt/unrecognized records block writes and are never repaired/overwritten automatically.
 * @param {{ directory?: string, workspaceId?: string }} [options]
 * @returns {{ read(): Promise<Preferences>, write(input: unknown): Promise<Preferences> }}
 */
export function createPreferenceStore({ directory, workspaceId = process.cwd() } = {}) {
    if (typeof workspaceId !== "string" || !workspaceId || (directory !== undefined && (typeof directory !== "string" || !directory))) invalid();
    const home = process.env.COPILOT_HOME;
    const location = directory ?? path.join(home !== undefined && home.length > 0 ? home : path.join(os.homedir(), ".copilot"), "extension-data", "pixel-agents-canvas", hash(workspaceId));

    /** @returns {Promise<Preferences>} */
    async function read() {
        try {
            /** @type {string[]} */
            let filenames;
            try {
                filenames = await readdir(location);
            } catch (error) {
                if (hasCode(error, "ENOENT")) return defaultPreferences();
                throw error;
            }
            let result = defaultPreferences();
            for (const filename of filenames) {
                if (/^\.[0-9a-f-]{36}\.tmp$/.test(filename)) continue;
                if (!/^[0-9a-f]{64}\.json$/.test(filename)) throw new PreferenceError("CORRUPT_PREFERENCES");
                const input = await readRecord(path.join(location, filename));
                if (!isRecord(input) || input.version !== 1) throw new PreferenceError("CORRUPT_PREFERENCES");
                try {
                    if (input.kind === "settings" && filename === SETTINGS_FILE) {
                        const record = objectWithKeys(input, ["version", "kind", "settings"]);
                        const value = objectWithKeys(record.settings, SETTING_KEYS);
                        result = { ...validatePreferences({ ...value, appearances: {} }), appearances: result.appearances };
                    } else if (input.kind === "appearance" && typeof input.identity === "string" && filename === appearanceFile(input.identity)) {
                        const record = objectWithKeys(input, ["version", "kind", "identity", "appearance"]);
                        validateIdentity(input.identity);
                        result.appearances[input.identity] = validateAppearance(record.appearance);
                    } else throw new PreferenceError("CORRUPT_PREFERENCES");
                } catch {
                    throw new PreferenceError("CORRUPT_PREFERENCES");
                }
            }
            return validatePreferences(result);
        } catch (error) {
            if (error instanceof PreferenceError) {
                if (error.code === "INVALID_PREFERENCES") throw new PreferenceError("CORRUPT_PREFERENCES");
                throw error;
            }
            throw new PreferenceError("PREFERENCE_IO");
        }
    }

    /** @param {unknown} input @returns {Promise<Preferences>} */
    async function write(input) {
        const patch = objectWithKeys(input, PREFERENCE_KEYS, true);
        const validated = validatePreferences({ ...defaultPreferences(), ...patch });
        const current = await read();
        const next = validatePreferences({
            ...current,
            ...patch,
            appearances: { ...current.appearances, ...validated.appearances },
        });
        try {
            if (Object.keys(patch).length === 0) return current;
            await mkdir(location, { recursive: true, mode: 0o700 });
            for (const [identity, appearance] of Object.entries(validated.appearances)) {
                await replaceRecord(location, appearanceFile(identity), { version: 1, kind: "appearance", identity, appearance });
            }
            if (SETTING_KEYS.some((key) => Object.hasOwn(patch, key))) {
                await replaceRecord(location, SETTINGS_FILE, { version: 1, kind: "settings", settings: settings(next) });
            }
            return await read();
        } catch (error) {
            if (error instanceof PreferenceError) throw error;
            throw new PreferenceError("PREFERENCE_IO");
        }
    }
    return { read, write };
}
