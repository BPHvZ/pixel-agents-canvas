// @ts-check
import { spawn } from "node:child_process";
import { StringDecoder } from "node:string_decoder";

/** @typedef {import("./types.js").AgentState} AgentState */
/** @typedef {import("./types.js").ChildProcessLike} ChildProcessLike */
/** @typedef {import("./types.js").CodexActivityEvent} CodexActivityEvent */
/** @typedef {import("./types.js").CodexClient} CodexClient */
/** @typedef {import("./types.js").CodexClientOptions} CodexClientOptions */
/** @typedef {import("./types.js").CodexListOptions} CodexListOptions */
/** @typedef {import("./types.js").DiscoveredCodexThread} DiscoveredCodexThread */
/** @typedef {import("./types.js").CodexMonitoringStatus} CodexMonitoringStatus */
/** @typedef {import("./types.js").CodexNotificationParams} CodexNotificationParams */
/** @typedef {import("./types.js").CodexProtocolMessage} CodexProtocolMessage */
/** @typedef {import("./types.js").CodexThreadListPage} CodexThreadListPage */
/** @typedef {import("./types.js").CodexThreadMetadata} CodexThreadMetadata */
/** @typedef {import("./types.js").CodexThreadStatus} CodexThreadStatus */
/** @typedef {import("./types.js").CodexThreadStatusType} CodexThreadStatusType */
/** @typedef {import("./types.js").CodexTurnEvent} CodexTurnEvent */
/** @typedef {import("./types.js").CodexTurnOutcome} CodexTurnOutcome */
/** @typedef {import("./types.js").Timestamp} Timestamp */

const CLIENT = { name: "pixel_agents_office", title: "Pixel Agents Office", version: "0.1.0" };
const MAX_LINE = 1_000_000;
const THREAD_LIST_LIMIT = 100;
const THREAD_RESUME_CONCURRENCY = 4;
/** @type {NonNullable<CodexClientOptions["spawnProcess"]>} */
const defaultSpawnProcess = (command, args, options) => spawn(command, args, options);

/** @param {unknown} value @returns {Record<string, unknown>} */
function objectRecord(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? /** @type {Record<string, unknown>} */ (value) : {};
}

/** @param {unknown} value @param {number} limit @returns {string | null} */
const boundedText = (value, limit) => typeof value === "string" && value.length > 0 ? value.slice(0, limit) : null;
/** @param {unknown} value @returns {Timestamp} */
const safeTimestamp = (value) => {
    if (typeof value === "string") return Number.isFinite(Date.parse(value)) ? value : null;
    return typeof value === "number" && Number.isFinite(value) ? value : null;
};
/** @param {unknown} value @returns {CodexThreadStatusType} */
function threadStatusType(value) {
    if (value === "active" || value === "idle" || value === "systemError" || value === "notLoaded") return value;
    return "unknown";
}
/** @param {unknown} value @returns {AgentState} */
function agentStateForThreadStatus(value) {
    if (!value || typeof value !== "object") return "unknown";
    const status = /** @type {Record<string, unknown>} */ (value);
    if (status.type === "active" && Array.isArray(status.activeFlags) && status.activeFlags.some((flag) => flag === "waitingOnApproval" || flag === "waitingOnUserInput")) return "waiting";
    if (status.type === "active") return "working";
    if (status.type === "idle") return "idle";
    if (status.type === "systemError") return "failed";
    return "unknown";
}
/** @param {unknown} value @returns {CodexTurnOutcome} */
function turnOutcome(value) {
    if (value === "completed" || value === "interrupted" || value === "failed" || value === "inProgress") return value;
    return "unknown";
}
/** @param {unknown} thread @param {boolean} archived @returns {CodexThreadMetadata | null} */
function metadataOnlyThread(thread, archived) {
    if (!thread || typeof thread !== "object" || Array.isArray(thread)) return null;
    const source = /** @type {import("./types.js").RawCodexThread} */ (thread);
    if (typeof source.id !== "string" || !source.id) return null;
    const rawStatus = source.status;
    const statusRecord = rawStatus && typeof rawStatus === "object" ? /** @type {Record<string, unknown>} */ (rawStatus) : null;
    /** @type {CodexThreadStatus | null} */
    const status = typeof rawStatus === "string"
        ? { type: threadStatusType(rawStatus), activeFlags: [] }
        : statusRecord
            ? {
                type: threadStatusType(statusRecord.type),
                activeFlags: Array.isArray(statusRecord.activeFlags) ? statusRecord.activeFlags.filter((flag) => typeof flag === "string").slice(0, 16).map((flag) => flag.slice(0, 80)) : [],
            }
            : null;
    return {
        id: source.id,
        title: boundedText(source.title, 160) ?? boundedText(source.name, 160),
        parentThreadId: typeof source.parentThreadId === "string" ? source.parentThreadId : null,
        status,
        createdAt: safeTimestamp(source.createdAt),
        updatedAt: safeTimestamp(source.updatedAt),
        source: boundedText(source.source, 80),
        modelProvider: boundedText(source.modelProvider, 80),
        archived,
    };
}

/** @param {CodexClientOptions} [options] @returns {CodexClient} */
export function createCodexClient(options = {}) {
    const { onEvent = () => {}, onTurn = () => {}, onThreadLifecycle = () => {}, onStatus = () => {}, spawnProcess = defaultSpawnProcess, executable = "codex", timeoutMs = 12_000 } = options;
    /** @type {ChildProcessLike | undefined} */
    let child;
    let buffer = "";
    let nextId = 1;
    /** @type {StringDecoder | undefined} */
    let decoder;
    let closedByUs = false;
    /** @type {Map<number, { resolve: (value: unknown) => void, reject: (error: Error) => void, timer: ReturnType<typeof setTimeout>, method: string }>} */
    const pending = new Map();
    /** @type {Set<string>} */
    const trackedThreads = new Set();
    /** @type {Map<string, CodexMonitoringStatus>} */
    const threadMonitoring = new Map();
    /** @type {Map<string, string | undefined>} */
    const turns = new Map();

    /** @param {string} method @param {Record<string, unknown>} [params] @param {number} [requestTimeoutMs] @returns {Promise<unknown>} */
    function write(method, params = {}, requestTimeoutMs = timeoutMs) {
        const currentChild = child;
        if (!currentChild || currentChild.stdin.destroyed) return Promise.reject(new Error("Codex app-server is not running"));
        const id = nextId++;
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Codex request timed out: ${method}`)); }, requestTimeoutMs);
            pending.set(id, { resolve, reject, timer, method });
            currentChild.stdin.write(`${JSON.stringify({ method, id, params })}\n`, (err) => {
                if (err) { clearTimeout(timer); pending.delete(id); reject(err); }
            });
        });
    }
    /** @param {Error} error */
    function failPending(error) {
        for (const request of pending.values()) { clearTimeout(request.timer); request.reject(error); }
        pending.clear();
    }
    /** @param {unknown} input */
    function handle(input) {
        if (!input || typeof input !== "object" || Array.isArray(input)) return;
        const message = /** @type {Record<string, unknown>} */ (input);
        if (typeof message.id === "number" && pending.has(message.id)) {
            const request = pending.get(message.id);
            pending.delete(message.id);
            if (!request) return;
            clearTimeout(request.timer);
            if (message.error) {
                const error = objectRecord(message.error);
                request.reject(new Error(typeof error.message === "string" ? error.message : `Codex request failed: ${request.method}`));
            } else request.resolve(message.result);
            return;
        }
        if (typeof message.method !== "string" || !message.method.includes("/")) return;
        const params = objectRecord(message.params);
        const rawThread = objectRecord(params.thread);
        const rawTurn = objectRecord(params.turn);
        const rawStatus = objectRecord(params.status);
        /** @type {CodexNotificationParams} */
        const p = {
            threadId: typeof params.threadId === "string" ? params.threadId : undefined,
            thread: { id: typeof rawThread.id === "string" ? rawThread.id : undefined },
            turn: { id: typeof rawTurn.id === "string" ? rawTurn.id : undefined, status: typeof rawTurn.status === "string" ? rawTurn.status : undefined },
            status: {
                type: typeof rawStatus.type === "string" ? rawStatus.type : undefined,
                activeFlags: Array.isArray(rawStatus.activeFlags) ? rawStatus.activeFlags.filter((flag) => typeof flag === "string") : [],
            },
        };
        const threadId = p.threadId ?? p.thread?.id;
        if (threadId && !trackedThreads.has(threadId)) return;
        if (message.method === "turn/started" && threadId && trackedThreads.has(threadId)) {
            turns.set(threadId, p.turn?.id);
            const at = Date.now();
            onEvent({ provider: "codex", id: `codex:${threadId}`, state: "working", event: "turn-start", at });
            onTurn({ threadId, turnId: p.turn?.id ?? null, outcome: "inProgress", at });
        } else if (message.method === "turn/completed" && threadId && trackedThreads.has(threadId)) {
            turns.delete(threadId);
            const outcome = turnOutcome(p.turn?.status);
            onTurn({ threadId, turnId: p.turn?.id ?? null, outcome, at: Date.now() });
        } else if (message.method === "thread/status/changed" && threadId && trackedThreads.has(threadId)) {
            onEvent({ provider: "codex", id: `codex:${threadId}`, state: agentStateForThreadStatus(p.status), event: "thread-status", at: Date.now() });
        } else if (message.method === "thread/closed" && threadId && trackedThreads.has(threadId)) {
            trackedThreads.delete(threadId);
            threadMonitoring.delete(threadId);
            turns.delete(threadId);
            const at = Date.now();
            onThreadLifecycle({ threadId, event: "closed", at });
            onEvent({ provider: "codex", id: `codex:${threadId}`, state: "completed", event: "session-end", at });
        } else if ((message.method === "thread/archived" || message.method === "thread/unarchived") && threadId && trackedThreads.has(threadId)) {
            const event = message.method === "thread/archived" ? "archived" : "unarchived";
            threadMonitoring.set(threadId, event === "archived" ? "archived" : "subscribed");
            onThreadLifecycle({ threadId, event, at: Date.now() });
        } else if (message.method === "error" && threadId && trackedThreads.has(threadId)) {
            onEvent({ provider: "codex", id: `codex:${threadId}`, state: "failed", event: "error", at: Date.now() });
        }
    }
    /** @param {Uint8Array} chunk */
    function consume(chunk) {
        const currentDecoder = decoder;
        if (!currentDecoder) return;
        buffer += currentDecoder.write(chunk);
        if (buffer.length > MAX_LINE && !buffer.includes("\n")) { buffer = ""; onStatus({ availability: "unavailable", connected: false, error: "Codex sent an oversized protocol message" }); return; }
        let end;
        while ((end = buffer.indexOf("\n")) !== -1) {
            const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
            if (!line.trim()) continue;
            if (line.length > MAX_LINE) continue;
            try { handle(JSON.parse(line)); } catch { /* Ignore malformed or unrecognized server output. */ }
        }
    }
    /** @returns {Promise<void>} */
    async function start() {
        if (child) return;
        closedByUs = false; buffer = ""; decoder = new StringDecoder("utf8");
        child = spawnProcess(executable, ["app-server", "--listen", "stdio://"], { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
        child.stdout.on("data", consume);
        child.stderr.on("data", () => {});
        child.once("error", (error) => { onStatus({ availability: "unavailable", connected: false, error: error.message }); failPending(error); child = undefined; });
        child.once("exit", (code, signal) => {
            child = undefined; failPending(new Error(`Codex app-server exited (${signal ?? code ?? "unknown"})`));
            trackedThreads.clear(); threadMonitoring.clear(); turns.clear(); onStatus({ availability: closedByUs ? "unavailable" : "disconnected", connected: false, error: closedByUs ? "Stopped" : `Codex app-server exited (${signal ?? code ?? "unknown"})` });
        });
        try {
            await write("initialize", { clientInfo: CLIENT });
            onStatus({ availability: "connected", connected: true, error: "" });
        } catch (error) {
            await stop();
            onStatus({ availability: "unavailable", connected: false, error: error instanceof Error ? error.message : "Codex app-server initialization failed" });
            throw error;
        }
    }
    /** @param {CodexListOptions} [options] @returns {Promise<CodexThreadMetadata[]>} */
    async function listThreads({ archived = false, limit = THREAD_LIST_LIMIT } = {}) {
        if (!child) throw new Error("Enable the Codex provider first");
        const pageSize = Number.isSafeInteger(limit) && limit > 0 ? limit : THREAD_LIST_LIMIT;
        /** @type {Map<string, CodexThreadMetadata>} */
        const threadsById = new Map();
        /** @type {Set<string>} */
        const seenCursors = new Set();
        let cursor = null;
        while (true) {
            const params = /** @type {Record<string, unknown>} */ ({ archived: Boolean(archived), limit: pageSize, useStateDbOnly: true });
            if (cursor !== null) params.cursor = cursor;
            const response = await write("thread/list", params);
            if (!response || typeof response !== "object" || !Array.isArray(/** @type {Record<string, unknown>} */ (response).data)) throw new Error("Codex returned an invalid thread/list response");
            const result = /** @type {CodexThreadListPage} */ (response);
            for (const thread of result.data) {
                const metadata = metadataOnlyThread(thread, archived);
                if (metadata && !threadsById.has(metadata.id)) threadsById.set(metadata.id, metadata);
            }
            const nextCursor = typeof result.nextCursor === "string" && result.nextCursor.length > 0 ? result.nextCursor : null;
            if (nextCursor === null || seenCursors.has(nextCursor)) break;
            seenCursors.add(nextCursor);
            cursor = nextCursor;
        }
        return [...threadsById.values()];
    }
    /** @param {import("./types.js").CodexDiscoveryOptions} [options] @returns {Promise<DiscoveredCodexThread[]>} */
    async function discoverThreads({ includeArchived = true } = {}) {
        if (!child) throw new Error("Enable the Codex provider first");
        const activeThreads = await listThreads({ archived: false });
        const archivedThreads = includeArchived ? await listThreads({ archived: true }) : [];
        let subscriptionFailures = 0;
        const pendingThreads = activeThreads.filter((thread) => !trackedThreads.has(thread.id));
        for (const thread of activeThreads) {
            if (trackedThreads.has(thread.id)) threadMonitoring.set(thread.id, "subscribed");
        }
        let nextThreadIndex = 0;
        const workerCount = Math.min(THREAD_RESUME_CONCURRENCY, pendingThreads.length);
        await Promise.all(Array.from({ length: workerCount }, async () => {
            while (nextThreadIndex < pendingThreads.length) {
                const thread = pendingThreads[nextThreadIndex++];
                if (!thread) break;
                trackedThreads.add(thread.id);
                try {
                    await write("thread/resume", { threadId: thread.id, excludeTurns: true });
                    threadMonitoring.set(thread.id, "subscribed");
                } catch {
                    trackedThreads.delete(thread.id);
                    threadMonitoring.set(thread.id, "unavailable");
                    subscriptionFailures++;
                }
            }
        }));
        onStatus({ availability: subscriptionFailures ? "stale" : "connected", connected: true, error: subscriptionFailures ? "Some Codex sessions could not be monitored" : "" });
        return [
            ...activeThreads.map((thread) => ({ ...thread, monitoring: threadMonitoring.get(thread.id) ?? "unavailable" })),
            ...archivedThreads.map((thread) => ({ ...thread, monitoring: /** @type {const} */ ("archived") })),
        ];
    }
    /** @returns {Promise<void>} */
    async function stop() {
        if (!child) return;
        closedByUs = true;
        const current = child;
        const unsubscribeTimeoutMs = Math.min(timeoutMs, 1_000);
        await Promise.all([...trackedThreads].map((threadId) => write("thread/unsubscribe", { threadId }, unsubscribeTimeoutMs).catch(() => {})));
        if (child === current) child = undefined;
        failPending(new Error("Codex app-server stopped"));
        if (current.exitCode == null && current.signalCode == null) {
            current.kill("SIGTERM");
            await Promise.race([new Promise((resolve) => current.once("exit", resolve)), new Promise((resolve) => setTimeout(resolve, 1_500))]);
            if (current.exitCode == null && current.signalCode == null) current.kill("SIGKILL");
        }
        trackedThreads.clear(); turns.clear();
    }
    return { start, stop, listThreads, discoverThreads, get running() { return Boolean(child); } };
}
