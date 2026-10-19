import test from "node:test";
import assert from "node:assert/strict";
import fs, { mkdir, readFile, readdir, rm, stat, writeFile, symlink } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID, createHash } from "node:crypto";
import path from "node:path";
import { createPreferenceStore, defaultPreferences, PreferenceError, validatePreferences } from "../src/preferences.js";

const look = { nickname: "Fern", palette: "#64d8b4", outfit: "shirt", accessory: "none", deskProp: "plant" };

async function fixture(t) {
    const directory = path.join(process.cwd(), `.preferences-test-${randomUUID()}`);
    await mkdir(directory, { mode: 0o700 });
    t.after(() => rm(directory, { recursive: true, force: true }));
    return directory;
}

function preferenceFailure(code) {
    return (error) => error instanceof PreferenceError && error.code === code;
}

test("defaults are complete, independently mutable presentation preferences", () => {
    const expected = {
        hideTitles: false,
        hiddenSessionTitles: {},
        showEnded: true,
        vignettes: true,
        dialogue: true,
        appearances: {},
    };
    assert.deepEqual(defaultPreferences(), expected);
    assert.deepEqual(validatePreferences(expected), expected);
    const first = defaultPreferences();
    first.appearances["codex:agent-1"] = {
        nickname: "Fern", palette: "#64d8b4", outfit: "shirt", accessory: "none", deskProp: "plant",
    };
    first.hiddenSessionTitles["codex:session-1"] = true;
    assert.deepEqual(defaultPreferences(), expected);
});

test("validation rejects unsafe keys, non-preferences and unbounded fields without coercion", () => {
    const valid = { ...defaultPreferences(), appearances: { "codex:agent-1": look } };
    assert.deepEqual(validatePreferences(valid), valid);
    const copy = validatePreferences(valid);
    copy.appearances["codex:agent-1"].nickname = "Changed";
    assert.equal(valid.appearances["codex:agent-1"].nickname, "Fern");
    for (const input of [
        null, [], 1, {}, { hideTitles: true },
        { ...valid, hideTitles: "false" },
        { ...valid, title: "PRIVATE-TITLE" },
        { ...valid, history: [] },
        { ...valid, promptSummaryConsent: true },
        { ...valid, hiddenSessionTitles: { "codex:session": 1 } },
        { ...valid, appearances: { "codex:agent": { ...look, role: "invented" } } },
        { ...valid, appearances: { "codex:agent": { ...look, nickname: "x".repeat(65) } } },
        { ...valid, appearances: { "codex:agent": { ...look, nickname: "line\nbreak" } } },
        { ...valid, appearances: { "codex:agent": { ...look, palette: "url(PRIVATE-PATH)" } } },
        ...["outfit", "accessory", "deskProp"].map((field) => ({ ...valid, appearances: { "codex:agent": { ...look, [field]: "other" } } })),
        { ...valid, hiddenSessionTitles: Object.fromEntries(Array.from({ length: 5000 }, (_, i) => [`codex:${i}:${"x".repeat(240)}`, true])) },
        { ...valid, [Symbol("content")]: "hidden" },
        Object.assign(Object.create({ title: "PRIVATE-TITLE" }), valid),
        { ...valid, get showEnded() { throw new Error("getter must not run"); } },
    ]) assert.throws(() => validatePreferences(input), preferenceFailure("INVALID_PREFERENCES"));
    for (const key of ["__proto__", "constructor", "prototype", "../outside", "/private/path", "a\\b", "session title", "", "a".repeat(257)]) {
        for (const field of ["appearances", "hiddenSessionTitles"]) {
            const value = field === "appearances" ? look : true;
            assert.throws(() => validatePreferences({ ...valid, [field]: { [key]: value } }), preferenceFailure("INVALID_PREFERENCES"));
        }
    }
});

test("override directory persists full preferences and patches with appearance upserts", async (t) => {
    const directory = path.join(await fixture(t), "private");
    const store = createPreferenceStore({ directory, workspaceId: "ignored-by-override" });
    assert.deepEqual(await store.read(), defaultPreferences());
    const full = { ...defaultPreferences(), hideTitles: true, hiddenSessionTitles: { "codex:session-1": true }, appearances: { "codex:agent-1": look } };
    assert.deepEqual(await store.write(full), full);
    const reopened = createPreferenceStore({ directory, workspaceId: "different-workspace" });
    assert.deepEqual(await reopened.read(), full);
    const secondLook = { ...look, nickname: "Ash", outfit: "vest" };
    const updated = { ...full, dialogue: false, hiddenSessionTitles: {}, appearances: { ...full.appearances, "copilot:agent-2": secondLook } };
    assert.deepEqual(await reopened.write({ dialogue: false, hiddenSessionTitles: {}, appearances: { "copilot:agent-2": secondLook } }), updated);
    assert.deepEqual(await store.write({ appearances: {} }), updated);
    assert.deepEqual(await store.write({}), updated);
    assert.deepEqual(await store.read(), updated);
    assert.equal((await stat(directory)).mode & 0o777, 0o700);
    for (const file of await readdir(directory)) {
        assert.match(file, /^[a-f0-9]{64}\.json$/);
        assert.equal((await stat(path.join(directory, file))).mode & 0o777, 0o600);
    }
});

test("default storage honors a nonempty Copilot home verbatim and isolates workspace hashes", async (t) => {
    const scratch = await fixture(t);
    const original = process.env.COPILOT_HOME;
    t.after(() => {
        if (original === undefined) delete process.env.COPILOT_HOME;
        else process.env.COPILOT_HOME = original;
    });
    process.env.COPILOT_HOME = path.relative(process.cwd(), path.join(scratch, " home "));
    const workspaceId = "workspace:one";
    const store = createPreferenceStore({ workspaceId });
    await store.write({ hideTitles: true });
    const expectedDirectory = path.join(process.env.COPILOT_HOME, "extension-data", "pixel-agents-canvas", createHash("sha256").update(workspaceId).digest("hex"));
    assert.equal((await readdir(expectedDirectory)).length, 1);
    assert.equal((await createPreferenceStore({ workspaceId }).read()).hideTitles, true);
    assert.deepEqual(await createPreferenceStore({ workspaceId: "workspace:two" }).read(), defaultPreferences());
    await createPreferenceStore().write({ showEnded: true });
    assert.equal((await readdir(path.join(process.env.COPILOT_HOME, "extension-data", "pixel-agents-canvas", createHash("sha256").update(process.cwd()).digest("hex")))).length, 1);
});

test("each read validates stored format, version and shape; corrupt data blocks writes without overwrite", async (t) => {
    const directory = await fixture(t);
    const store = createPreferenceStore({ directory });
    await store.write({ hideTitles: true, appearances: { "codex:agent-1": look } });
    const records = await Promise.all((await readdir(directory)).map(async (file) => ({ file, bytes: await readFile(path.join(directory, file), "utf8") })));
    const setting = records.find((record) => JSON.parse(record.bytes).kind === "settings");
    const appearance = records.find((record) => JSON.parse(record.bytes).kind === "appearance");
    const settingsRecord = JSON.parse(setting.bytes);
    const appearanceRecord = JSON.parse(appearance.bytes);
    for (const [target, text] of [
        [setting, "{PRIVATE-BROKEN-JSON"],
        [setting, "null"],
        [setting, "[]"],
        [setting, JSON.stringify({ ...settingsRecord, version: 2 })],
        [setting, JSON.stringify({ ...settingsRecord, version: "1" })],
        [setting, JSON.stringify({ kind: "settings", settings: settingsRecord.settings })],
        [setting, JSON.stringify({ ...settingsRecord, kind: "history" })],
        [setting, JSON.stringify({ ...settingsRecord, title: "PRIVATE-TITLE" })],
        [setting, JSON.stringify({ ...settingsRecord, settings: { ...settingsRecord.settings, showEnded: 1 } })],
        [setting, JSON.stringify({ ...settingsRecord, settings: { hideTitles: true } })],
        [appearance, JSON.stringify({ ...appearanceRecord, identity: "codex:other" })],
        [appearance, JSON.stringify({ ...appearanceRecord, identity: "../PRIVATE-PATH" })],
        [appearance, JSON.stringify({ ...appearanceRecord, appearance: { ...look, nickname: "x".repeat(65) } })],
        [appearance, JSON.stringify({ ...appearanceRecord, appearance: { ...look, activity: "PRIVATE-ACTIVITY" } })],
        [appearance, JSON.stringify({ ...appearanceRecord, version: 0 })],
        [appearance, " ".repeat(1_048_577)],
    ]) {
        const filename = path.join(directory, target.file);
        await writeFile(filename, text);
        await assert.rejects(store.read(), preferenceFailure("CORRUPT_PREFERENCES"));
        await assert.rejects(store.write({ hideTitles: false, appearances: { "codex:agent-1": { ...look, nickname: "Replacement" } } }), preferenceFailure("CORRUPT_PREFERENCES"));
        assert.equal(await readFile(filename, "utf8"), text);
        assert.deepEqual((await readdir(directory)).sort(), records.map((record) => record.file).sort());
        await writeFile(filename, target.bytes);
    }
    assert.equal((await store.read()).hideTitles, true);
    const extra = path.join(directory, "unexpected.json");
    await writeFile(extra, "{}");
    await assert.rejects(store.read(), preferenceFailure("CORRUPT_PREFERENCES"));
    await assert.rejects(store.write({ dialogue: false }), preferenceFailure("CORRUPT_PREFERENCES"));
    assert.equal(await readFile(extra, "utf8"), "{}");
});

test("failed atomic replacement keeps previous data, cleans its own temporary file, and leaks no paths/content", async (t) => {
    const directory = await fixture(t);
    const store = createPreferenceStore({ directory });
    await store.write({ appearances: { "codex:agent-1": look } });
    const before = await readdir(directory);
    const bytes = await readFile(path.join(directory, before[0]), "utf8");
    const abandoned = `.${randomUUID()}.tmp`;
    await writeFile(path.join(directory, abandoned), "PRIVATE-ABANDONED-RECORD");
    let temporaryCount;
    let observed;
    t.mock.method(fs, "rename", async () => {
        temporaryCount = (await readdir(directory)).filter((file) => file.endsWith(".tmp")).length;
        observed = await store.read();
        throw Object.assign(new Error(`PRIVATE-CONTENT ${directory}`), { code: "EIO" });
    });
    await assert.rejects(store.write({ appearances: { "codex:agent-1": { ...look, nickname: "Replacement" } } }), (error) => {
        assert.ok(preferenceFailure("PREFERENCE_IO")(error));
        assert.equal(error.cause, undefined);
        assert.doesNotMatch(error.message, /PRIVATE|preferences-test/);
        return true;
    });
    assert.equal(temporaryCount, 2);
    assert.deepEqual(observed.appearances, { "codex:agent-1": look });
    assert.deepEqual((await readdir(directory)).sort(), [...before, abandoned].sort());
    assert.equal(await readFile(path.join(directory, before[0]), "utf8"), bytes);
    assert.equal(await readFile(path.join(directory, abandoned), "utf8"), "PRIVATE-ABANDONED-RECORD");
});

test("independent processes concurrently upsert different appearance identities without lost updates", async (t) => {
    const directory = await fixture(t);
    const run = promisify(execFile);
    const moduleUrl = new URL("../src/preferences.js", import.meta.url).href;
    await Promise.all(Array.from({ length: 8 }, (_, index) => run(process.execPath, ["--input-type=module", "--eval", `
        import { createPreferenceStore } from ${JSON.stringify(moduleUrl)};
        const store = createPreferenceStore({ directory: process.argv[1] });
        await store.write({ appearances: { [process.argv[2]]: ${JSON.stringify(look)} } });
    `, directory, `codex:agent-${index}`])));
    const persisted = await createPreferenceStore({ directory }).read();
    assert.deepEqual(persisted.appearances, Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`codex:agent-${i}`, look])));
    assert.equal((await readdir(directory)).length, 8);
});

test("unknown provider payloads and invalid writes never reach storage", async (t) => {
    const directory = await fixture(t);
    const store = createPreferenceStore({ directory });
    await store.write({ hideTitles: true });
    const before = await readdir(directory);
    const bytes = await readFile(path.join(directory, before[0]), "utf8");
    for (const input of [
        { title: "PRIVATE-TITLE", prompt: "PRIVATE-PROMPT", preview: "PRIVATE-PREVIEW" },
        { appearances: { "codex:agent": { ...look, toolPayload: "PRIVATE-TOOL" } } },
        { hiddenSessionTitles: { "PRIVATE SESSION TITLE": true } },
        { activity: [{ state: "working" }] },
        { appearances: { "../PRIVATE-PATH": look } },
        { hideTitles: undefined },
        null,
        Object.defineProperty({}, "title", { value: "PRIVATE-NONENUMERABLE" }),
    ]) await assert.rejects(store.write(input), preferenceFailure("INVALID_PREFERENCES"));
    assert.deepEqual(await readdir(directory), before);
    assert.equal(await readFile(path.join(directory, before[0]), "utf8"), bytes);
    assert.doesNotMatch(bytes, /PRIVATE|title"|prompt|preview|toolPayload|activity|history/);
    assert.doesNotMatch(before.join(""), /codex|agent|session|workspace/);
});

test("filesystem failures are content-free errors, not defaults or silent resets", async (t) => {
    const directory = await fixture(t);
    const blocked = path.join(directory, "PRIVATE-PATH");
    await writeFile(blocked, "PRIVATE-CONTENT");
    const store = createPreferenceStore({ directory: blocked });
    await assert.rejects(store.read(), preferenceFailure("PREFERENCE_IO"));
    await assert.rejects(store.write({ hideTitles: true }), preferenceFailure("PREFERENCE_IO"));
    assert.equal(await readFile(blocked, "utf8"), "PRIVATE-CONTENT");
    const privateRecord = path.join(directory, "private-record");
    await writeFile(privateRecord, "PRIVATE-CONTENT");
    const storeDirectory = path.join(directory, "store");
    await mkdir(storeDirectory);
    await symlink(privateRecord, path.join(storeDirectory, `${"a".repeat(64)}.json`));
    await assert.rejects(createPreferenceStore({ directory: storeDirectory }).read(), PreferenceError);
    await assert.rejects(createPreferenceStore({ directory: storeDirectory }).write({ hideTitles: true }), PreferenceError);
    assert.equal(await readFile(privateRecord, "utf8"), "PRIVATE-CONTENT");
});

test("empty and unset Copilot home use ~/.copilot without writing to the real home", async (t) => {
    const directory = await fixture(t);
    const moduleUrl = new URL("../src/preferences.js", import.meta.url).href;
    const run = promisify(execFile);
    for (const value of ["", undefined]) {
        const home = path.join(directory, value === "" ? "empty" : "unset");
        const env = { ...process.env, HOME: home };
        if (value === undefined) delete env.COPILOT_HOME;
        else env.COPILOT_HOME = value;
        await run(process.execPath, ["--input-type=module", "--eval", `
            import { createPreferenceStore } from ${JSON.stringify(moduleUrl)};
            await createPreferenceStore({ workspaceId: "test-workspace" }).write({ hideTitles: true });
        `], { env });
        const expected = path.join(home, ".copilot", "extension-data", "pixel-agents-canvas", createHash("sha256").update("test-workspace").digest("hex"));
        assert.equal((await readdir(expected)).length, 1);
    }
});

test("non-file records are corrupt; separate appearance records do not impose an arbitrary identity cap", async (t) => {
    const directory = await fixture(t);
    const store = createPreferenceStore({ directory });
    const settingName = `${createHash("sha256").update("settings").digest("hex")}.json`;
    await mkdir(path.join(directory, settingName));
    await assert.rejects(store.read(), preferenceFailure("CORRUPT_PREFERENCES"));
    await assert.rejects(store.write({ hideTitles: true }), preferenceFailure("CORRUPT_PREFERENCES"));
    await rm(path.join(directory, settingName), { recursive: true });
    const records = Array.from({ length: 1025 }, (_, index) => {
        const identity = `codex:agent-${index}`;
        const name = `${createHash("sha256").update(`appearance:${identity}`).digest("hex")}.json`;
        return writeFile(path.join(directory, name), JSON.stringify({ version: 1, kind: "appearance", identity, appearance: look }));
    });
    await Promise.all(records);
    assert.equal(Object.keys((await store.read()).appearances).length, 1025);
    await store.write({ appearances: { "codex:new-agent": look } });
    assert.equal(Object.keys((await store.read()).appearances).length, 1026);
    assert.equal((await readdir(directory)).length, 1026);
});
