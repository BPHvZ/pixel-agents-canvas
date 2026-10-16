export const STALE_AFTER_MS = 45_000;
export const VALID_STATES = new Set(["idle", "working", "waiting", "completed", "failed", "unknown"]);

export function createStore({ clock = () => Date.now(), staleAfterMs = STALE_AFTER_MS } = {}) {
    const agents = new Map();
    const listeners = new Set();
    function emit(agent) {
        const safe = { ...agent };
        for (const listener of listeners) listener(safe);
    }
    return {
        upsert({ id, provider, name, state = "unknown", task = "", connected = true, at = clock() }) {
            if (typeof id !== "string" || !id || typeof provider !== "string") return null;
            const agent = {
                id, provider,
                name: typeof name === "string" ? name.slice(0, 48) : provider,
                state: VALID_STATES.has(state) ? state : "unknown",
                task: typeof task === "string" ? task.slice(0, 100) : "",
                connected: Boolean(connected),
                updatedAt: Number.isFinite(at) ? at : clock(),
            };
            agents.set(id, agent);
            emit(agent);
            return { ...agent };
        },
        setProvider(provider, connected, detail = "") {
            const id = `provider:${provider}`;
            const agent = { id, provider, name: provider, state: connected ? "idle" : "unknown", task: detail, connected: Boolean(connected), updatedAt: clock() };
            agents.set(id, agent);
            emit(agent);
            return { ...agent };
        },
        get(id) { const agent = agents.get(id); return agent ? { ...agent } : null; },
        list() { this.expireStale(); return [...agents.values()].map((agent) => ({ ...agent })); },
        expireStale() {
            const cutoff = clock() - staleAfterMs;
            for (const agent of agents.values()) {
                if (agent.connected && agent.state !== "idle" && agent.updatedAt < cutoff) {
                    agent.state = "unknown"; agent.connected = false; agent.task = "No recent activity"; emit(agent);
                }
            }
        },
        subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
        clear() { agents.clear(); },
    };
}

export function genericCopilotLabel(event) {
    return ({ "session-start": "Session connected", "prompt-submitted": "Working on a request", "tool-start": "Using a tool", "tool-complete": "Tool finished", "session-end": "Session ended", error: "Session encountered an error" })[event] ?? "Activity updated";
}
