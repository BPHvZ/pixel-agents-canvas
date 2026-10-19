// @ts-check
import { spawn } from "node:child_process";
import { StringDecoder } from "node:string_decoder";

/** @typedef {import("./types.js").AgentState} AgentState */
/** @typedef {import("./types.js").ChildProcessLike} ChildProcessLike */
/** @typedef {import("./types.js").CodexActivityEvent} CodexActivityEvent */
/** @typedef {import("./codex-extra-types.js").CodexClient} CodexClient */
/** @typedef {import("./types.js").CodexClientOptions} CodexClientOptions */
/** @typedef {import("./types.js").CodexListOptions} CodexListOptions */
/** @typedef {import("./codex-extra-types.js").DiscoveredCodexThread} DiscoveredCodexThread */
/** @typedef {import("./types.js").CodexMonitoringStatus} CodexMonitoringStatus */
/** @typedef {import("./types.js").CodexNotificationParams} CodexNotificationParams */
/** @typedef {import("./types.js").CodexProtocolMessage} CodexProtocolMessage */
/** @typedef {import("./types.js").CodexThreadListPage} CodexThreadListPage */
/** @typedef {import("./codex-extra-types.js").CodexThreadMetadata} CodexThreadMetadata */
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
    const source = objectRecord(thread);
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
        parentThreadId: boundedText(source.parentThreadId, 256),
        ...("sessionId" in source ? { sessionId: boundedText(source.sessionId, 256) } : {}),
        ...("agentNickname" in source ? { agentNickname: boundedText(source.agentNickname, 160) } : {}),
        ...("agentRole" in source ? { agentRole: boundedText(source.agentRole, 160) } : {}),
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
    /** @type {Map<string, Partial<CodexThreadMetadata>>} */
    const latestMetadata = new Map();

    /** @param {string} method @param {Record<string, unknown>} [params] @param {number} [requestTimeoutMs] @returns {Promise<unknown>} */
    function write(method, params = {}, requestTimeoutMs = timeoutMs) {
        const currentChild = child;
        if (!currentChild || currentChild.stdin.destroyed || (closedByUs && method !== "thread/unsubscribe")) return Promise.reject(new Error("Codex app-server is not running"));
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
        if (closedByUs || typeof message.method !== "string" || !message.method.includes("/")) return;
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
            const status = { type: threadStatusType(p.status?.type), activeFlags: p.status?.activeFlags ?? [] };
            latestMetadata.set(threadId, { ...latestMetadata.get(threadId), status });
            const waitingReason = status.activeFlags.includes("waitingOnApproval") ? "approval" : status.activeFlags.includes("waitingOnUserInput") ? "input" : null;
            onEvent({ provider: "codex", id: `codex:${threadId}`, state: agentStateForThreadStatus(status), waitingReason, event: "thread-status", at: Date.now() });
        } else if (message.method === "thread/closed" && threadId && trackedThreads.has(threadId)) {
            trackedThreads.delete(threadId);
            threadMonitoring.delete(threadId);
            turns.delete(threadId);
            const at = Date.now();
            onThreadLifecycle({ threadId, event: "closed", at });
            // thread/closed is app-server runtime eviction, not persisted session termination.
            latestMetadata.set(threadId, { ...latestMetadata.get(threadId), status: { type: "notLoaded", activeFlags: [] } });
            onEvent({ provider: "codex", id: `codex:${threadId}`, state: "unknown", event: "thread-status", waitingReason: null, at });
        } else if ((message.method === "thread/archived" || message.method === "thread/unarchived") && threadId && trackedThreads.has(threadId)) {
            const event = message.method === "thread/archived" ? "archived" : "unarchived";
            threadMonitoring.set(threadId, event === "archived" ? "archived" : "subscribed");
            onThreadLifecycle({ threadId, event, at: Date.now() });
        } else if (message.method === "error" && threadId && trackedThreads.has(threadId)) {
            onEvent({ provider: "codex", id: `codex:${threadId}`, state: "failed", event: "error", at: Date.now() });
        }
    }
    function failOversizedProtocol() {
        buffer = ""; decoder = undefined;
        const error = new Error("Codex sent an oversized protocol message");
        onStatus({ availability: "unavailable", connected: false, error: error.message });
        failPending(error);
        void stop();
    }
    /** @param {Uint8Array} chunk */
    function consume(chunk) {
        const currentDecoder = decoder;
        if (!currentDecoder) return;
        buffer += currentDecoder.write(chunk);
        let end;
        while ((end = buffer.indexOf("\n")) !== -1) {
            if (end > MAX_LINE) { failOversizedProtocol(); return; }
            const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
            if (!line.trim()) continue;
            try { handle(JSON.parse(line)); } catch { /* Ignore malformed or unrecognized server output. */ }
        }
        if (buffer.length > MAX_LINE) failOversizedProtocol();
    }
    /** @type {Promise<void> | undefined} */
    let starting;
    /** @type {Promise<void> | undefined} */
    let stopping;
    /** @type {Promise<void> | undefined} */
    let restarting;
    /** @returns {Promise<void>} */
    function start() {
        if (stopping) {
            restarting ??= stopping.then(() => start()).finally(() => { restarting = undefined; });
            return restarting;
        }
        if (starting) return starting;
        starting = initializeProcess().finally(() => { starting = undefined; });
        return starting;
    }
    /** @returns {Promise<void>} */
    async function initializeProcess() {
        if (child) return;
        closedByUs = false; buffer = ""; decoder = new StringDecoder("utf8");
        const current = spawnProcess(executable, ["app-server", "--listen", "stdio://"], { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
        child = current;
        current.stdout.on("data", (chunk) => { if (child === current) consume(chunk); });
        current.stderr.on("data", () => {});
        current.once("error", (error) => {
            if (child !== current) return;
            onStatus({ availability: "unavailable", connected: false, error: "Codex app-server process error" });
            failPending(error);
            void stop();
        });
        current.once("exit", (code, signal) => {
            if (child !== current) return;
            child = undefined; buffer = ""; decoder = undefined;
            failPending(new Error(`Codex app-server exited (${signal ?? code ?? "unknown"})`));
            trackedThreads.clear(); threadMonitoring.clear(); turns.clear(); latestMetadata.clear();
            onStatus({ availability: closedByUs ? "unavailable" : "disconnected", connected: false, error: closedByUs ? "Stopped" : `Codex app-server exited (${signal ?? code ?? "unknown"})` });
        });
        try {
            await write("initialize", { clientInfo: CLIENT });
            if (child !== current || closedByUs) throw new Error("Codex app-server stopped during initialization");
            onStatus({ availability: "connected", connected: true, error: "" });
        } catch (error) {
            const intentionallyStopped = closedByUs;
            if (child === current && !stopping) await stop();
            if (!intentionallyStopped && !child) onStatus({ availability: "unavailable", connected: false, error: "Codex app-server initialization failed" });
            throw error;
        }
    }
    /** @param {CodexListOptions} [options] @returns {Promise<CodexThreadMetadata[]>} */
    async function listThreads({ archived = false, limit = THREAD_LIST_LIMIT } = {}) {
        const current = child;
        if (!current || closedByUs) throw new Error("Enable the Codex provider first");
        const pageSize = Number.isSafeInteger(limit) && limit > 0 ? limit : THREAD_LIST_LIMIT;
        /** @type {Map<string, CodexThreadMetadata>} */
        const threadsById = new Map();
        /** @type {Set<string>} */
        const seenCursors = new Set();
        let cursor = null;
        while (true) {
            const params = /** @type {Record<string, unknown>} */ ({ archived: Boolean(archived), limit: pageSize, useStateDbOnly: true });
            if (cursor !== null) params.cursor = cursor;
            requireCurrent(current);
            const response = await write("thread/list", params);
            requireCurrent(current);
            if (!response || typeof response !== "object" || !Array.isArray(/** @type {Record<string, unknown>} */ (response).data)) throw new Error("Codex returned an invalid thread/list response");
            const result = /** @type {CodexThreadListPage} */ (response);
            for (const thread of result.data) {
                const metadata = metadataOnlyThread(thread, archived);
                if (!metadata) continue;
                const previous = threadsById.get(metadata.id);
                const timestamp = (/** @type {Timestamp} */ value) => typeof value === "number" ? value * 1000 : typeof value === "string" ? Date.parse(value) : -Infinity;
                if (!previous || timestamp(metadata.updatedAt) > timestamp(previous.updatedAt)) threadsById.set(metadata.id, metadata);
            }
            const nextCursor = result.nextCursor;
            if (nextCursor === null) break;
            if (typeof nextCursor !== "string" || !nextCursor.length) throw new Error("Codex returned an invalid thread/list cursor");
            if (seenCursors.has(nextCursor)) throw new Error("Codex returned a repeated thread/list cursor");
            seenCursors.add(nextCursor);
            cursor = nextCursor;
        }
        return [...threadsById.values()];
    }
    /** @type {Map<boolean, Promise<DiscoveredCodexThread[]>>} */
    const discoveries = new Map();
    /** @type {Promise<void> | undefined} */
    let discoveryQueue;
    /** @param {import("./types.js").CodexDiscoveryOptions} [options] @returns {Promise<DiscoveredCodexThread[]>} */
    function discoverThreads({ includeArchived = true } = {}) {
        const current = child;
        if (!current || closedByUs) return Promise.reject(new Error("Enable the Codex provider first"));
        const existing = discoveries.get(includeArchived);
        if (existing) return existing;
        const discovery = (discoveryQueue ?? Promise.resolve()).then(() => discover(current, includeArchived)).finally(() => {
            if (discoveries.get(includeArchived) === discovery) discoveries.delete(includeArchived);
        });
        discoveries.set(includeArchived, discovery);
        discoveryQueue = discovery.then(() => {}, () => {});
        return discovery;
    }
    /** @param {ChildProcessLike} current */
    function requireCurrent(current) {
        if (child !== current || closedByUs) throw new Error("Codex app-server stopped during discovery");
    }
    /** @param {ChildProcessLike} current @param {boolean} includeArchived @returns {Promise<DiscoveredCodexThread[]>} */
    async function discover(current, includeArchived) {
        requireCurrent(current);
        // Only in-flight notifications may override this discovery's fresh snapshots.
        latestMetadata.clear();
        const activeThreads = await listThreads({ archived: false });
        requireCurrent(current);
        const archivedThreads = includeArchived ? await listThreads({ archived: true }) : [];
        requireCurrent(current);
        let subscriptionFailures = 0;
        const pendingThreads = activeThreads.filter((thread) => !trackedThreads.has(thread.id));
        for (const thread of activeThreads) {
            if (trackedThreads.has(thread.id)) threadMonitoring.set(thread.id, "subscribed");
        }
        let nextThreadIndex = 0;
        const workerCount = Math.min(THREAD_RESUME_CONCURRENCY, pendingThreads.length);
        await Promise.all(Array.from({ length: workerCount }, async () => {
            while (nextThreadIndex < pendingThreads.length) {
                requireCurrent(current);
                const thread = pendingThreads[nextThreadIndex++];
                if (!thread) break;
                trackedThreads.add(thread.id);
                try {
                    const response = objectRecord(await write("thread/resume", { threadId: thread.id, excludeTurns: true }));
                    requireCurrent(current);
                    const fresh = metadataOnlyThread(response.thread, false);
                    if (!fresh || fresh.id !== thread.id) throw new Error("Codex returned an invalid thread/resume response");
                    Object.assign(thread, fresh);
                    threadMonitoring.set(thread.id, "subscribed");
                } catch {
                    requireCurrent(current);
                    trackedThreads.delete(thread.id);
                    threadMonitoring.set(thread.id, "unavailable");
                    subscriptionFailures++;
                }
            }
        }));
        requireCurrent(current);
        onStatus({ availability: subscriptionFailures ? "stale" : "connected", connected: true, error: subscriptionFailures ? "Some Codex sessions could not be monitored" : "" });
        return [
            ...activeThreads.map((thread) => ({ ...thread, ...latestMetadata.get(thread.id), monitoring: threadMonitoring.get(thread.id) ?? "unavailable" })),
            ...archivedThreads.map((thread) => ({ ...thread, monitoring: /** @type {const} */ ("archived") })),
        ];
    }
    /** @returns {Promise<void>} */
    function stop() {
        if (stopping) return stopping;
        if (!child) return Promise.resolve();
        closedByUs = true;
        const current = child;
        failPending(new Error("Codex app-server stopped"));
        stopping = stopProcess(current).finally(() => { stopping = undefined; });
        return stopping;
    }
    /** @param {ChildProcessLike} current @returns {Promise<void>} */
    async function stopProcess(current) {
        const unsubscribeTimeoutMs = Math.min(timeoutMs, 1_000);
        await Promise.all([...trackedThreads].map((threadId) => write("thread/unsubscribe", { threadId }, unsubscribeTimeoutMs).catch(() => {})));
        failPending(new Error("Codex app-server stopped"));
        if (current.exitCode == null && current.signalCode == null) {
            let exited = false;
            /** @type {ReturnType<typeof setTimeout> | undefined} */
            let timer;
            const exit = new Promise((resolve) => current.once("exit", () => { exited = true; resolve(undefined); }));
            const timeout = new Promise((resolve) => { timer = setTimeout(resolve, 1_500); });
            current.kill("SIGTERM");
            await Promise.race([exit, timeout]);
            clearTimeout(timer);
            if (!exited && current.exitCode == null && current.signalCode == null) current.kill("SIGKILL");
        }
        if (child === current) child = undefined;
        buffer = ""; decoder = undefined;
        trackedThreads.clear(); threadMonitoring.clear(); turns.clear(); latestMetadata.clear();
    }
    return { start, stop, listThreads, discoverThreads, get running() { return Boolean(child); } };
}
