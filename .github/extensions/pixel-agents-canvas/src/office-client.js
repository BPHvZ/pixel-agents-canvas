// @ts-check
/** @typedef {import("./types.js").OfficeAgentCard} OfficeAgentCard */
/** @typedef {import("./types.js").AgentState} AgentState */

/** @type {Readonly<Record<AgentState, string>>} */
const statusText = {
    working: "▣ Working", idle: "◌ Idle", completed: "✓ Complete", failed: "⚠ Issue", unknown: "◌ Unknown", waiting: "… Waiting",
};

/** @param {unknown} input @returns {OfficeAgentCard[]} */
export function parseOfficeState(input) {
    if (!input || typeof input !== "object" || !("agents" in input) || !Array.isArray(input.agents)) throw new Error("Invalid office state");
    /** @type {OfficeAgentCard[]} */
    const agents = [];
    for (const item of /** @type {unknown[]} */ (input.agents)) {
        if (!item || typeof item !== "object") continue;
        const card = /** @type {Record<string, unknown>} */ (item);
        if (typeof card.id !== "string" || typeof card.name !== "string" || (card.kind !== "provider" && card.kind !== "session") || (card.provider !== "Copilot" && card.provider !== "Codex")) continue;
        const state = typeof card.state === "string" && Object.hasOwn(statusText, card.state) ? /** @type {AgentState} */ (card.state) : "unknown";
        agents.push({
            id: card.id, kind: card.kind, name: card.name, provider: card.provider, state,
            role: typeof card.role === "string" ? card.role : "Unknown scope",
            task: typeof card.task === "string" ? card.task : "No observed activity",
            color: typeof card.color === "string" && /^#[0-9a-f]{6}$/i.test(card.color) ? card.color : "#a5b2af",
            connected: card.connected === true,
            updatedAt: typeof card.updatedAt === "string" ? card.updatedAt : "",
        });
    }
    return agents;
}

/** @param {string} value @returns {string} */
function escapeHtml(value) {
    /** @type {Record<string, string>} */
    const entities = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    return value.replace(/[&<>"']/g, (character) => entities[character] ?? character);
}

/** @param {Document} document @param {string} id @returns {HTMLElement} */
function element(document, id) {
    const found = document.getElementById(id);
    if (!found) throw new Error(`Missing office element: ${id}`);
    return found;
}

/** @param {Document} document @param {OfficeAgentCard[]} agents */
export function drawOffice(document, agents) {
    const providerSources = agents.filter((agent) => agent.kind === "provider");
    const sessions = agents.filter((agent) => agent.kind === "session");
    element(document, "roster").innerHTML = agents.map((agent) => `<article class="card" style="--agent:${agent.color}"><div class="cardhead"><div class="avatar"></div><div><div class="name">${escapeHtml(agent.name)}</div><div class="provider">${agent.provider} · ${escapeHtml(agent.role)}</div></div></div><div class="status">${statusText[agent.state]} · ${agent.connected ? "connected" : "disconnected"}</div><div class="task">${escapeHtml(agent.task)}</div></article>`).join("");
    const officeSessions = sessions.filter((agent) => agent.connected && agent.state !== "completed");
    element(document, "agent-layer").innerHTML = officeSessions.length ? officeSessions.map((agent) => `<div class="office-agent" role="group" aria-label="${escapeHtml(agent.name)}, ${statusText[agent.state]}"><div class="office-character" style="--agent:${agent.color}"><div class="head"></div><div class="body"></div></div><span class="office-agent-name">${escapeHtml(agent.name)}</span><span class="office-agent-state">${statusText[agent.state]}</span></div>`).join("") : '<div class="office-empty" role="status">No current provider-reported agent sessions</div>';
    const working = officeSessions.find((agent) => agent.state === "working");
    element(document, "activity").textContent = working ? `✦ ${working.task}` : officeSessions.length ? "Your team is waiting" : "No observed activity";
    const copilot = providerSources.find((agent) => agent.provider === "Copilot");
    const codex = providerSources.find((agent) => agent.provider === "Codex");
    element(document, "connection").textContent = `Copilot: ${copilot?.connected ? "connected to this session" : "waiting for activity"} · Codex: ${codex?.connected ? "connected" : "off"}`;
    element(document, "codex").textContent = codex?.connected ? "Codex enabled" : "Enable local Codex";
}

/** @param {Document} document */
function mountOffice(document) {
    const initial = /** @type {unknown} */ (JSON.parse(element(document, "office-state").textContent ?? "null"));
    drawOffice(document, parseOfficeState(initial));
    async function refreshState() {
        try {
            const response = await fetch("/state", { cache: "no-store" });
            if (response.ok) {
                const state = /** @type {unknown} */ (await response.json());
                drawOffice(document, parseOfficeState(state));
            }
        } catch {
            element(document, "connection").textContent = "Office connection unavailable; displayed activity may be stale";
        }
    }
    element(document, "codex").onclick = async () => {
        await fetch("/codex/enable", { method: "POST" });
        await refreshState();
    };
    element(document, "clock").textContent = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    setInterval(refreshState, 2_000);
}

if (typeof document !== "undefined") mountOffice(document);
