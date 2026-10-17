// @ts-check
/** @typedef {import("./types.js").AgentState} AgentState */
/** @typedef {import("./types.js").NormalizedAgent} NormalizedAgent */
/** @typedef {import("./types.js").NormalizedProviderStatus} NormalizedProviderStatus */
/** @typedef {import("./types.js").NormalizedSession} NormalizedSession */
/** @typedef {import("./types.js").NormalizedSnapshot} NormalizedSnapshot */
/** @typedef {import("./types.js").ProviderAvailability} ProviderAvailability */

/** @type {Readonly<Record<string, AgentState>>} */
const STATES = Object.freeze({
    active: "working",
    working: "working",
    idle: "idle",
    waiting: "waiting",
    blocked: "waiting",
    waitingOnApproval: "waiting",
    waitingOnUserInput: "waiting",
    completed: "completed",
    complete: "completed",
    failed: "failed",
    error: "failed",
    systemError: "failed",
});

/** @param {unknown} value @param {number} limit @returns {string | null} */
const textOrNull = (value, limit) => typeof value === "string" && value.length > 0 ? value.slice(0, limit) : null;
/** @param {unknown} value @returns {string | null} */
const idOrNull = (value) => typeof value === "string" && value.length > 0 ? value : null;
/** @param {unknown} value @returns {AgentState} */
const normalizedState = (value) => {
    if (value && typeof value === "object") {
        const record = /** @type {Record<string, unknown>} */ (value);
        if (record.type === "active" && Array.isArray(record.activeFlags) && record.activeFlags.some((flag) => flag === "waitingOnApproval" || flag === "waitingOnUserInput")) {
            return "waiting";
        }
        value = record.type;
    }
    return typeof value === "string" && Object.hasOwn(STATES, value) ? STATES[value] ?? "unknown" : "unknown";
};
/** @param {unknown} value @param {string} source @returns {number | null} */
const timestampOrNull = (value, source) => {
    if (typeof value === "string") {
        const parsed = Date.parse(value);
        return Number.isFinite(parsed) ? parsed : null;
    }
    if (typeof value !== "number" || !Number.isFinite(value)) return null;
    return source === "app-server" && Math.abs(value) < 100_000_000_000 ? value * 1000 : value;
};

/** @param {number | null | undefined} updatedAt @param {number} [now] @param {number} [staleAfterMs] @returns {"fresh" | "stale" | "unknown"} */
export function getFreshness(updatedAt, now = Date.now(), staleAfterMs = 45_000) {
    if (typeof updatedAt !== "number" || !Number.isFinite(updatedAt) || !Number.isFinite(now) || !Number.isFinite(staleAfterMs) || staleAfterMs < 0 || updatedAt > now) return "unknown";
    return now - updatedAt <= staleAfterMs ? "fresh" : "stale";
}

/** @type {ReadonlySet<Exclude<ProviderAvailability, "unknown">>} */
const PROVIDER_AVAILABILITY = new Set(["unsupported", "unavailable", "connected", "empty", "stale", "disconnected"]);

/** @param {string} provider @param {string} source @param {unknown} status @returns {NormalizedProviderStatus | null} */
export function normalizeProviderStatus(provider, source, status) {
    if (!provider || !source || !status || typeof status !== "object" || Array.isArray(status)) return null;
    const details = /** @type {Record<string, unknown>} */ (status);
    const availability = typeof details.availability === "string" && PROVIDER_AVAILABILITY.has(/** @type {Exclude<ProviderAvailability, "unknown">} */ (details.availability))
        ? /** @type {Exclude<ProviderAvailability, "unknown">} */ (details.availability)
        : "unknown";
    return { provider, source, availability, updatedAt: timestampOrNull(details.updatedAt, source) };
}

/** @param {string} provider @param {string} source @param {unknown} snapshot @returns {NormalizedSnapshot} */
export function normalizeSnapshot(provider, source, snapshot) {
    if (!provider || !source || !snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return { sessions: [], agents: [] };
    const snapshotRecord = /** @type {Record<string, unknown>} */ (snapshot);
    if (!Array.isArray(snapshotRecord.threads)) return { sessions: [], agents: [] };

    /** @type {Map<string, Record<string, unknown>>} */
    const threadsById = new Map();
    for (const rawThread of /** @type {unknown[]} */ (snapshotRecord.threads)) {
        if (!rawThread || typeof rawThread !== "object" || Array.isArray(rawThread)) continue;
        const thread = /** @type {Record<string, unknown>} */ (rawThread);
        const threadId = idOrNull(thread.id);
        if (!threadId) continue;
        const existing = threadsById.get(threadId);
        const nextUpdatedAt = timestampOrNull(thread.updatedAt, source);
        const existingUpdatedAt = timestampOrNull(existing?.updatedAt, source);
        if (existing && (nextUpdatedAt === null || (existingUpdatedAt !== null && nextUpdatedAt <= existingUpdatedAt))) continue;
        threadsById.set(threadId, thread);
    }

    /** @type {NormalizedSession[]} */
    const sessions = [];
    /** @type {NormalizedAgent[]} */
    const agents = [];
    /** @type {Set<string>} */
    const seenAgents = new Set();
    const now = Date.now();
    for (const [threadId, thread] of threadsById) {
        const sessionId = `${provider}:${threadId}`;
        const updatedAt = timestampOrNull(thread.updatedAt, source);
        const status = updatedAt !== null && updatedAt > now ? "unknown" : normalizedState(thread.status);
        const parentThreadId = idOrNull(thread.parentThreadId);
        const agentId = idOrNull(thread.agentId) ?? (parentThreadId ? threadId : null);
        sessions.push({
            id: sessionId,
            provider,
            source,
            sourceId: threadId,
            summary: textOrNull(thread.title ?? thread.name, 160),
            state: status,
            updatedAt,
            freshness: getFreshness(updatedAt, now),
            parentSessionId: parentThreadId ? `${provider}:${parentThreadId}` : null,
        });

        if (agentId) {
            const identity = `${sessionId}:${agentId}`;
            if (!seenAgents.has(identity)) {
                seenAgents.add(identity);
                agents.push({
                    id: `${sessionId}:agent:${agentId}`,
                    sessionId,
                    provider,
                    source,
                    sourceId: agentId,
                    name: textOrNull(thread.agentNickname ?? thread.agentRole, 80),
                    parentId: null,
                    state: status,
                });
            }
        }

        if (!Array.isArray(thread.agents)) continue;
        for (const rawAgent of /** @type {unknown[]} */ (thread.agents)) {
            if (!rawAgent || typeof rawAgent !== "object" || Array.isArray(rawAgent)) continue;
            const agent = /** @type {Record<string, unknown>} */ (rawAgent);
            const agentId = idOrNull(agent.id);
            if (!agentId) continue;
            const identity = `${sessionId}:${agentId}`;
            if (seenAgents.has(identity)) continue;
            seenAgents.add(identity);
            const parentId = idOrNull(agent.parentId);
            agents.push({
                id: `${sessionId}:agent:${agentId}`,
                sessionId,
                provider,
                source,
                sourceId: agentId,
                name: textOrNull(agent.name, 80),
                parentId: parentId ? `${sessionId}:agent:${parentId}` : null,
                state: normalizedState(agent.state),
            });
        }
    }
    return { sessions, agents };
}
