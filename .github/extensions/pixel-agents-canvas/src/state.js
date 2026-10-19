// @ts-check
/** @typedef {import("./types.js").ActivityInput} ActivityInput */
/** @typedef {import("./types.js").ActivityRecord} ActivityRecord */
/** @typedef {import("./types.js").ActivityStore} ActivityStore */
/** @typedef {import("./types.js").AgentState} AgentState */

export const STALE_AFTER_MS = 45_000;
/** @type {ReadonlySet<AgentState>} */
export const VALID_STATES = new Set(["idle", "working", "waiting", "completed", "failed", "unknown"]);

/** @param {{ clock?: () => number, staleAfterMs?: number }} [options] @returns {ActivityStore} */
export function createStore({ clock = () => Date.now(), staleAfterMs = STALE_AFTER_MS } = {}) {
    /** @type {Map<string, ActivityRecord>} */
    const agents = new Map();
    /** @type {Set<(record: ActivityRecord) => void>} */
    const listeners = new Set();
    /** @param {ActivityRecord} agent */
    function emit(agent) {
        const safe = { ...agent };
        for (const listener of listeners) listener(safe);
    }
    return {
        /** @param {ActivityInput} input */
        upsert({ id, provider, name, state = "unknown", task = "", connected = true, at = clock() }) {
            if (typeof id !== "string" || !id || typeof provider !== "string") return null;
            const updatedAt = Number.isFinite(at) ? at : clock();
            const current = agents.get(id);
            if (current && updatedAt < current.updatedAt) return { ...current };
            /** @type {ActivityRecord} */
            const agent = {
                id, provider,
                name: typeof name === "string" ? name.slice(0, 48) : provider,
                state: VALID_STATES.has(state) ? state : "unknown",
                task: typeof task === "string" ? task.slice(0, 100) : "",
                connected: Boolean(connected),
                freshness: "fresh",
                updatedAt,
            };
            agents.set(id, agent);
            emit(agent);
            return { ...agent };
        },
        setProvider(provider, connected, detail = "") {
            const id = `provider:${provider}`;
            /** @type {ActivityRecord} */
            const agent = { id, provider, name: provider, state: connected ? "idle" : "unknown", task: detail, connected: Boolean(connected), freshness: "fresh", updatedAt: clock() };
            agents.set(id, agent);
            emit(agent);
            return { ...agent };
        },
        get(id) { const agent = agents.get(id); return agent ? { ...agent } : null; },
        list() { this.expireStale(); return [...agents.values()].map((agent) => ({ ...agent })); },
        expireStale() {
            const currentTime = clock();
            const cutoff = currentTime - staleAfterMs;
            for (const agent of agents.values()) {
                agent.freshness = agent.updatedAt > currentTime ? "unknown" : agent.updatedAt < cutoff ? "stale" : "fresh";
                if (agent.freshness !== "fresh" && agent.connected && (agent.state === "working" || agent.state === "waiting")) {
                    agent.state = "unknown"; agent.connected = false; agent.task = "No recent activity"; emit(agent);
                }
            }
        },
        /** @param {(record: ActivityRecord) => void} listener */
        subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
        clear() { agents.clear(); },
    };
}

/** @param {string} event @returns {string} */
export function genericCopilotLabel(event) {
    /** @type {Readonly<Record<string, string>>} */
    const labels = { "session-start": "Session connected", "prompt-submitted": "Working on a request", "tool-start": "Using a tool", "tool-complete": "Tool finished", "session-end": "Session ended", error: "Session encountered an error" };
    return labels[event] ?? "Activity updated";
}
