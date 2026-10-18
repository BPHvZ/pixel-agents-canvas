// @ts-check
import { createOfficeWorld, deterministicAppearance, deriveMotifs } from "./office-world.js";
/** @typedef {import("./product-types.js").OfficePageState} OfficePageState */
/** @typedef {import("./product-types.js").OfficeSnapshot} OfficeSnapshot */
/** @typedef {import("./product-types.js").OfficeAgent} OfficeAgent */
/** @typedef {import("./product-types.js").OfficeSession} OfficeSession */
/** @typedef {import("./product-types.js").ProviderHealth} ProviderHealth */
/** @typedef {import("./product-types.js").Preferences} Preferences */
/** @typedef {import("./product-types.js").Appearance} Appearance */
/** @typedef {import("./types.js").AgentState} AgentState */

/** @type {Readonly<Record<AgentState, string>>} */
const statusText = { working: "Working", idle: "Idle", completed: "Completed", failed: "Issue reported", unknown: "Unknown", waiting: "Waiting" };
/** @type {Readonly<Record<AgentState, string>>} */
const statusSymbol = { working: "▣", idle: "○", completed: "✓", failed: "!", unknown: "?", waiting: "◷" };

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function record(value) { return typeof value === "object" && value !== null && !Array.isArray(value); }
/** @param {unknown} value @returns {unknown[]} */
function list(value) { return Array.isArray(value) ? value : []; }
/** @param {unknown} value @returns {string | null} */
function nullableText(value) { return typeof value === "string" ? value : null; }
/** @param {unknown} value @returns {number | null} */
function timestamp(value) { return typeof value === "number" && Number.isFinite(value) ? value : null; }
/** @param {unknown} value @returns {value is import("./types.js").ProviderName} */
function provider(value) { return value === "Codex" || value === "Copilot"; }
/** @param {unknown} value @returns {import("./types.js").CapabilitySupport} */
function capability(value) { return value === "supported" || value === "unsupported" || value === "unavailable" ? value : "unknown"; }

/** @param {unknown} value @returns {Appearance | null} */
function parseAppearance(value) {
    if (!record(value)) return null;
    return {
        nickname: typeof value.nickname === "string" ? value.nickname.slice(0, 64) : "",
        palette: typeof value.palette === "string" && /^#[0-9a-f]{6}$/i.test(value.palette) ? value.palette : "#a5b2af",
        outfit: value.outfit === "vest" || value.outfit === "overalls" ? value.outfit : "shirt",
        accessory: value.accessory === "glasses" || value.accessory === "cap" ? value.accessory : "none",
        deskProp: value.deskProp === "plant" || value.deskProp === "mug" || value.deskProp === "book" ? value.deskProp : "none",
    };
}

/** @param {unknown} value @returns {Preferences} */
export function parsePreferences(value) {
    if (!record(value)) throw new Error("Invalid office preferences");
    /** @type {[string, boolean][]} */
    const hidden = [];
    if (record(value.hiddenSessionTitles)) for (const [id, hide] of Object.entries(value.hiddenSessionTitles)) if (typeof hide === "boolean") hidden.push([id, hide]);
    /** @type {[string, Appearance][]} */
    const appearances = [];
    if (record(value.appearances)) for (const [id, raw] of Object.entries(value.appearances)) {
        const appearance = parseAppearance(raw);
        if (appearance) appearances.push([id, appearance]);
    }
    return { hideTitles: value.hideTitles === true, hiddenSessionTitles: Object.fromEntries(hidden), showEnded: value.showEnded !== false, vignettes: value.vignettes !== false, dialogue: value.dialogue !== false, appearances: Object.fromEntries(appearances) };
}

/** @param {unknown} value @param {readonly string[]} choices @returns {boolean} */
function choice(value, choices) { return choices.some((item) => item === value); }
/** @param {...unknown} values @returns {boolean} */
function strings(...values) { return values.every((value) => typeof value === "string"); }
/** @param {...unknown} values @returns {boolean} */
function nullableStrings(...values) { return values.every((value) => value === null || typeof value === "string"); }
/** @param {unknown} value @returns {boolean} */
function position(value) { return record(value) && timestamp(value.x) !== null && timestamp(value.y) !== null; }
/** @param {unknown} value @returns {boolean} */
function deskIndex(value) { return typeof value === "number" && Number.isInteger(value) && value >= 0; }
/** @param {unknown} value @param {(item: Record<string, unknown>) => boolean} validate @returns {boolean} */
function worldRecords(value, validate) { return Array.isArray(value) && list(value).every((item) => record(item) && validate(item)); }
/** @param {Record<string, unknown>} value @returns {boolean} */
function fictionalLifetime(value) { return value.fictional === true && timestamp(value.startedAt) !== null && timestamp(value.endsAt) !== null; }
/** @param {Record<string, unknown>} item @returns {boolean} */
function worldEffect(item) {
    return strings(item.id, item.clusterId, item.spaceId, item.label) &&
        choice(item.kind, ["ghost", "spider", "screen-flicker", "chair-movement"]) &&
        position(item.position) && fictionalLifetime(item);
}
/** @param {unknown} value @returns {boolean} */
function worldAppearance(value) {
    return record(value) && typeof value.nickname === "string" && value.nickname.length <= 64 &&
        typeof value.palette === "string" && /^#[0-9a-f]{6}$/i.test(value.palette) &&
        choice(value.outfit, ["shirt", "vest", "overalls"]) && choice(value.accessory, ["none", "glasses", "cap"]) &&
        choice(value.deskProp, ["none", "plant", "mug", "book"]);
}

/** Validate the complete optional server read-model; malformed supplied fiction must not spawn a local replacement.
 * @param {unknown} value @returns {value is import("./world-types.js").WorldView}
 */
function worldView(value) {
    const voices = ["curious", "dry-witted", "earnest", "calm", "upbeat"];
    return record(value) && timestamp(value.now) !== null &&
        value.fictionLabel === "Office fiction — not provider activity or collaboration" &&
        record(value.motion) && value.motion.optional === true && value.motion.reducedMotion === "static" && value.motion.flashing === false &&
        worldRecords(value.clusters, (item) => strings(item.id, item.sessionId, item.spaceId, item.titleVisibilityNote, item.statusLabel) &&
            position(item.position) && provider(item.provider) && nullableStrings(item.title) &&
            [item.titleHidden, item.abandoned, item.quiet, item.dimmed, item.visible].every((flag) => typeof flag === "boolean") &&
            (item.endedAt === null || timestamp(item.endedAt) !== null) &&
            worldRecords(item.motifs, (motif) => strings(motif.id, motif.label, motif.symbol))) &&
        worldRecords(value.characters, (item) => strings(item.id, item.agentId, item.sessionId, item.clusterId, item.spaceId, item.deskId, item.statusLabel) &&
            deskIndex(item.deskIndex) && position(item.position) && position(item.deskPosition) && provider(item.provider) &&
            nullableStrings(item.providerName, item.providerRole, item.sceneId, item.sceneLabel) &&
            choice(item.state, ["working", "idle", "waiting", "completed", "failed", "unknown"]) &&
            (item.waitingReason === null || choice(item.waitingReason, ["approval", "input"])) &&
            choice(item.freshness, ["fresh", "stale", "unknown"]) && typeof item.connected === "boolean" && typeof item.observed === "boolean" &&
            worldAppearance(item.appearance) && choice(item.voiceFlavor, voices) &&
            choice(item.pose, ["rest", "focused", "wait", "attention", "issue", "completion", "neutral", "vignette", "cleanup", "desk-setup"])) &&
        worldRecords(value.props, (item) => strings(item.id, item.spaceId) && (item.deskIndex === null || deskIndex(item.deskIndex)) &&
            choice(item.kind, ["mug", "leaves", "paper", "book", "web"]) && position(item.position) && timestamp(item.createdAt) !== null &&
            nullableStrings(item.cleanupSceneId) && item.fictional === true) &&
        worldRecords(value.scenes, (item) => strings(item.id, item.templateId, item.label) &&
            choice(item.kind, ["vignette", "cleanup", "desk-setup"]) && Array.isArray(item.participants) &&
            list(item.participants).every((id) => typeof id === "string") && fictionalLifetime(item)) &&
        worldRecords(value.dialogue, (item) => strings(item.id, item.agentId, item.label, item.text) &&
            choice(item.flavor, voices) && item.placement === "secondary" && fictionalLifetime(item)) &&
        worldRecords(value.abandonedEffects, worldEffect) &&
        worldRecords(value.quietEffects, worldEffect);
}

/** Validate the complete public page contract without collapsing provider observations into cards.
 * @param {unknown} input @returns {OfficePageState}
 */
export function parseOfficeState(input) {
    if (!record(input) || !record(input.snapshot) || !record(input.preferences)) throw new Error("Invalid office state");
    const raw = input.snapshot;
    if (![raw.providers, raw.sessions, raw.agents, raw.feed].every(Array.isArray) || timestamp(raw.now) === null) throw new Error("Invalid office state");
    /** @type {ProviderHealth[]} */
    const providers = [];
    for (const item of list(raw.providers)) {
        if (!record(item) || !provider(item.id) || (item.source !== "copilotcli" && item.source !== "app-server")) continue;
        const availability = item.availability === "unsupported" || item.availability === "unavailable" || item.availability === "connected" || item.availability === "empty" || item.availability === "stale" || item.availability === "disconnected" ? item.availability : "unknown";
        const capabilities = record(item.capabilities) ? item.capabilities : {};
        providers.push({ id: item.id, source: item.source, availability, enabled: item.enabled === true, detail: typeof item.detail === "string" ? item.detail : "Coverage unknown", observedAt: timestamp(item.observedAt), capabilities: { discovery: capability(capabilities.discovery), agents: capability(capabilities.agents), navigation: capability(capabilities.navigation) } });
    }
    /** @type {OfficeSession[]} */
    const sessions = [];
    for (const item of list(raw.sessions)) {
        if (!record(item) || typeof item.id !== "string" || !provider(item.provider) || typeof item.sourceId !== "string") continue;
        sessions.push({ id: item.id, provider: item.provider, sourceId: item.sourceId, title: nullableText(item.title), parentSessionId: nullableText(item.parentSessionId), archived: item.archived === true, closed: item.closed === true, endedAt: timestamp(item.endedAt) });
    }
    /** @type {OfficeAgent[]} */
    const agents = [];
    for (const item of list(raw.agents)) {
        if (!record(item) || typeof item.id !== "string" || typeof item.sessionId !== "string" || !provider(item.provider) || typeof item.sourceId !== "string") continue;
        const state = item.state === "working" || item.state === "idle" || item.state === "waiting" || item.state === "completed" || item.state === "failed" ? item.state : "unknown";
        const lastTurnOutcome = item.lastTurnOutcome === "completed" || item.lastTurnOutcome === "interrupted" || item.lastTurnOutcome === "failed" || item.lastTurnOutcome === "inProgress" || item.lastTurnOutcome === "unknown" ? item.lastTurnOutcome : null;
        agents.push({ id: item.id, sessionId: item.sessionId, provider: item.provider, sourceId: item.sourceId, name: nullableText(item.name), role: nullableText(item.role), parentAgentId: nullableText(item.parentAgentId), state, waitingReason: item.waitingReason === "approval" || item.waitingReason === "input" ? item.waitingReason : null, connected: item.connected === true, freshness: item.freshness === "fresh" || item.freshness === "stale" ? item.freshness : "unknown", observedAt: timestamp(item.observedAt), lastActivityAt: timestamp(item.lastActivityAt), ended: item.ended === true, endedAt: timestamp(item.endedAt), lastTurnOutcome });
    }
    /** @type {import("./product-types.js").FeedEvent[]} */
    const feed = [];
    for (const item of list(raw.feed)) {
        if (!record(item) || typeof item.id !== "number" || !Number.isFinite(item.id) || !provider(item.provider) || typeof item.label !== "string" || timestamp(item.at) === null) continue;
        feed.push({ id: item.id, provider: item.provider, agentId: nullableText(item.agentId), sessionId: nullableText(item.sessionId), label: item.label, at: timestamp(item.at) ?? 0 });
    }
    if (input.world !== undefined && !worldView(input.world)) throw new Error("Invalid office world");
    return { snapshot: { providers, sessions, agents, feed, now: timestamp(raw.now) ?? 0 }, preferences: parsePreferences(input.preferences), ...(input.world === undefined ? {} : { world: input.world }) };
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
/** @param {number|null} at @returns {string} */
function timeText(at) { return at === null ? "Not observed" : new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }); }
/** @param {OfficeAgent} agent @returns {string} */
function stateLabel(agent) {
    return agent.ended ? "Agent ended" : agent.state === "waiting" && agent.waitingReason ? `Waiting for ${agent.waitingReason}` : statusText[agent.state];
}
/** @param {OfficeAgent} agent @returns {string} */
function freshnessLabel(agent) { return `${agent.freshness === "unknown" ? "Freshness unknown" : agent.freshness} · ${agent.connected ? "connected" : "disconnected"}`; }
/** @param {OfficeAgent} agent @returns {string} */
function reportedName(agent) { return agent.name || `${agent.provider} agent`; }
/** @param {OfficeAgent} agent @param {Preferences} preferences @returns {Appearance} */
function appearanceFor(agent, preferences) {
    return preferences.appearances[agent.id] ?? deterministicAppearance(agent.id);
}
/** @param {Appearance} look @param {string} [extra] @returns {string} */
function sprite(look, extra = "") {
    return `<span class="pixel-person ${look.outfit} ${look.accessory} ${extra}" style="--agent:${look.palette}" aria-hidden="true"><span class="hair"></span><span class="face"></span><span class="body"></span><span class="feet"></span></span>`;
}
/** @param {OfficeSession} session @param {Preferences} preferences @param {import("./world-types.js").WorldView|undefined} [world] @returns {string} */
function sessionTitle(session, preferences, world) {
    if (session.closed) return "Session ended";
    if (preferences.hideTitles || preferences.hiddenSessionTitles[session.id]) return "Session title hidden";
    if (world?.clusters.find((cluster) => cluster.sessionId === session.id)?.quiet) return "Quiet scene";
    return session.title || "Untitled session";
}
/** @param {OfficeAgent} agent @param {Preferences} preferences @param {string|null} selected @returns {string} */
function character(agent, preferences, selected) {
    const look = appearanceFor(agent, preferences);
    const name = look.nickname || reportedName(agent);
    return `<div class="desk-station ${agent.ended ? "off-duty" : ""}" data-station="${escapeHtml(agent.id)}"><div class="pixel-desk" aria-hidden="true"><span class="monitor ${agent.state}"></span><span class="keyboard"></span><span class="desk-prop ${look.deskProp}"></span></div><button type="button" class="character ${agent.state} ${agent.freshness} ${agent.connected ? "" : "disconnected"}" data-agent="${escapeHtml(agent.id)}" aria-pressed="${agent.id === selected}" aria-label="${escapeHtml(`${name}, ${agent.provider}, ${stateLabel(agent)}, ${freshnessLabel(agent)}`)}">${sprite(look)}<span class="character-name">${escapeHtml(name)}</span><span class="character-provider">${agent.provider}</span><span class="status-chip ${agent.state}">${statusSymbol[agent.state]} ${stateLabel(agent)}</span><span class="freshness">${escapeHtml(freshnessLabel(agent))}</span></button></div>`;
}
/** @param {OfficeAgent} agent @returns {number} */
function activityOrder(agent) {
    if (agent.ended) return 3;
    if (!agent.connected || agent.freshness !== "fresh") return 2;
    if (agent.state === "working" || agent.state === "waiting" || agent.state === "failed") return 0;
    return agent.state === "idle" ? 1 : 2;
}
/** @param {string} left @param {string} right @returns {number} */
function identityOrder(left, right) { return left < right ? -1 : left > right ? 1 : 0; }
/** @param {OfficeAgent} left @param {OfficeAgent} right @returns {number} */
function agentOrder(left, right) { return activityOrder(left) - activityOrder(right) || identityOrder(left.id, right.id); }
/** @param {{session: OfficeSession|null, agents: OfficeAgent[]}} group @returns {number} */
function groupOrder(group) {
    const first = group.agents[0];
    return first ? activityOrder(first) : group.session?.closed ? 3 : 2;
}

/** @param {OfficePageState} state @param {string|null} selected @param {import("./world-types.js").WorldView|undefined} world @returns {string} */
function floorMarkup(state, selected, world) {
    const { snapshot, preferences } = state;
    const agents = snapshot.agents.filter((agent) => preferences.showEnded || !agent.ended).sort(agentOrder);
    const orphaned = agents.filter((agent) => !snapshot.sessions.some((session) => session.id === agent.sessionId));
    const groups = [...snapshot.sessions.map((session) => ({ session, agents: agents.filter((agent) => agent.sessionId === session.id) })),
        ...(orphaned.length ? [{ session: null, agents: orphaned }] : [])]
        .sort((left, right) => groupOrder(left) - groupOrder(right) || identityOrder(left.session?.id ?? "", right.session?.id ?? ""));
    const markup = groups.filter(({ session, agents: members }) => members.length || !session?.closed || session.endedAt !== null).map(({ session, agents: members }, index) => session === null ? `<section class="session-cluster"><header class="cluster-heading"><h3>Session unavailable</h3></header><div class="desks">${members.map((agent) => character(agent, preferences, selected)).join("")}</div></section>` : `<section class="session-cluster ${session.closed && !members.some((agent) => !agent.ended) ? "abandoned" : ""}" data-session="${escapeHtml(session.id)}" aria-label="${escapeHtml(`${session.provider} session ${String(index + 1).padStart(2, "0")}: ${sessionTitle(session, preferences, world)}`)}"><header class="cluster-heading"><span class="cluster-number" aria-hidden="true">${String(index + 1).padStart(2, "0")}</span><div><span class="provider-tag ${session.provider.toLowerCase()}">${session.provider}</span><h3>${escapeHtml(sessionTitle(session, preferences, world))}</h3><span class="cluster-meta">${session.closed ? `Explicitly ended · ${timeText(session.endedAt)}` : `${members.length} ${members.length === 1 ? "agent" : "agents"}${session.archived ? " · archived" : ""}`}</span></div>${session.closed ? "" : `<button type="button" class="title-control" data-title="${escapeHtml(session.id)}" aria-label="${preferences.hiddenSessionTitles[session.id] ? "Show" : "Hide"} title for this session" aria-pressed="${preferences.hiddenSessionTitles[session.id] === true}" ${preferences.hideTitles ? "disabled" : ""}>${preferences.hiddenSessionTitles[session.id] ? "Show title" : "Hide title"}</button>`}</header><div class="motifs" data-motifs="${escapeHtml(session.id)}" aria-label="Decorative scene motifs"></div><div class="scene-space" aria-hidden="true"></div><div class="desks">${members.length ? members.map((agent) => character(agent, preferences, selected)).join("") : `<p class="cluster-empty">${session.closed ? "Session ended" : "No agents observed"}</p>`}</div></section>`).join("");
    return markup || `<div class="empty-state"><span class="empty-symbol" aria-hidden="true">⌂</span><h3>No visible agents</h3>${snapshot.agents.some((agent) => agent.ended && !preferences.showEnded) ? '<p>Show ended agents to include ended identities.</p>' : ""}</div>`;
}
/** @param {OfficeAgent} agent @param {OfficePageState} state @param {import("./world-types.js").WorldView|undefined} world @returns {string} */
function detailsMarkup(agent, state, world) {
    const look = appearanceFor(agent, state.preferences);
    const session = state.snapshot.sessions.find((item) => item.id === agent.sessionId);
    const health = state.snapshot.providers.find((item) => item.id === agent.provider);
    const rows = [
        ["Provider name", reportedName(agent)], ["Provider role", agent.role || "Not reported"], ["Activity source", `${agent.provider} · ${health?.source ?? "unknown"}`],
        ["Source agent ID", agent.sourceId], ["Source session ID", session?.sourceId ?? "Not reported"],
        ["Parent agent", agent.parentAgentId ?? "Not reported"], ["Parent session", session?.parentSessionId ?? "Not reported"], ["Last turn outcome", agent.lastTurnOutcome ?? "Not reported"],
        ["Last observed", timeText(agent.observedAt)], ["Last activity", timeText(agent.lastActivityAt)], ["Lifecycle", agent.ended ? `Explicitly ended · ${timeText(agent.endedAt)}` : "No agent end reported"],
    ];
    /** @param {string[]} choices @param {string} selected @returns {string} */
    const options = (choices, selected) => choices.map((choice) => `<option value="${choice}" ${choice === selected ? "selected" : ""}>${choice[0]?.toUpperCase()}${choice.slice(1)}</option>`).join("");
    return `<div class="detail-heading"><h2 id="details-title" tabindex="-1">${escapeHtml(look.nickname || reportedName(agent))}</h2><button type="button" id="close-details" aria-label="Close agent details">×</button></div><div class="identity-portrait">${sprite(look)}<span class="provider-tag ${agent.provider.toLowerCase()}">${agent.provider}</span></div>${look.nickname ? `<p class="alias-note">Provider name: ${escapeHtml(reportedName(agent))}</p>` : ""}<p class="detail-session">${escapeHtml(session ? sessionTitle(session, state.preferences, world) : "Session unavailable")}</p><p class="detail-status ${agent.state}">${statusSymbol[agent.state]} ${stateLabel(agent)}</p><p class="freshness detail-freshness">${escapeHtml(freshnessLabel(agent))}</p><details class="technical-details"><summary>Technical details</summary><dl class="facts">${rows.map(([label, value]) => `<div><dt>${label}</dt><dd>${escapeHtml(value ?? "")}</dd></div>`).join("")}</dl><p class="muted tiny">Session navigation is unavailable.</p></details><details class="customization"><summary>Appearance</summary><form id="appearance-form" data-appearance="${escapeHtml(agent.id)}"><label>Local nickname<input name="nickname" maxlength="64" value="${escapeHtml(look.nickname)}" autocomplete="off" placeholder="Use provider name"></label><div class="form-pair"><label>Palette<input type="color" name="palette" value="${look.palette}"></label><label>Outfit<select name="outfit">${options(["shirt", "vest", "overalls"], look.outfit)}</select></label></div><div class="form-pair"><label>Accessory<select name="accessory">${options(["none", "glasses", "cap"], look.accessory)}</select></label><label>Desk prop<select name="deskProp">${options(["none", "plant", "mug", "book"], look.deskProp)}</select></label></div><button type="submit" class="primary">Save appearance</button><button type="button" id="reset-appearance">Use deterministic look</button></form></details>`;
}

/** @type {WeakMap<HTMLElement, string>} */
const renderedFloors = new WeakMap();

/** Keep the editor attached so polling cannot close a native picker or lose a draft/focus.
 * @param {HTMLElement} details @param {OfficeAgent} agent @param {OfficePageState} state @param {import("./world-types.js").WorldView|undefined} world
 */
function drawDetails(details, agent, state, world) {
    const editor = details.querySelector(".customization");
    const form = editor?.querySelector("form");
    if (!(editor instanceof HTMLDetailsElement) || form?.dataset.appearance !== agent.id) {
        details.innerHTML = detailsMarkup(agent, state, world);
        return;
    }
    const next = details.ownerDocument.createElement("div");
    next.innerHTML = detailsMarkup(agent, state, world);
    const nextEditor = next.querySelector(".customization");
    if (!nextEditor) return;
    if (!editor.open) {
        for (const control of editor.querySelectorAll("input, select")) {
            if (!(control instanceof HTMLInputElement || control instanceof HTMLSelectElement)) continue;
            const replacement = nextEditor.querySelector(`[name="${control.name}"]`);
            if (replacement instanceof HTMLInputElement || replacement instanceof HTMLSelectElement) control.value = replacement.value;
        }
    }
    for (const child of Array.from(details.childNodes)) if (child !== editor) child.remove();
    let afterEditor = false;
    for (const child of Array.from(next.childNodes)) {
        if (child === nextEditor) afterEditor = true;
        else if (afterEditor) details.append(child);
        else details.insertBefore(child, editor);
    }
}

/** @param {Document} document @param {OfficePageState} state @param {string|null} [selected] @param {import("./world-types.js").WorldView} [world] */
export function drawOffice(document, state, selected = null, world = state.world) {
    const { snapshot, preferences } = state;
    const visible = snapshot.agents.filter((agent) => preferences.showEnded || !agent.ended).sort(agentOrder);
    const floor = element(document, "agent-layer");
    const markup = floorMarkup(state, selected, world);
    if (renderedFloors.get(floor) !== markup) {
        floor.innerHTML = markup;
        renderedFloors.set(floor, markup);
    }
    element(document, "occupancy").textContent = `${visible.length} ${visible.length === 1 ? "agent" : "agents"} · ${snapshot.sessions.filter((session) => !session.closed).length} sessions`;
    element(document, "roster-count").textContent = `${visible.length} ${visible.length === 1 ? "agent" : "agents"}`;
    element(document, "roster").innerHTML = visible.map((agent) => {
        const look = appearanceFor(agent, preferences);
        const session = snapshot.sessions.find((item) => item.id === agent.sessionId);
        return `<button type="button" class="roster-entry" data-agent="${escapeHtml(agent.id)}" aria-pressed="${selected === agent.id}">${sprite(look)}<span class="roster-identity"><strong>${escapeHtml(look.nickname || reportedName(agent))}</strong><span>${agent.provider}</span><span class="roster-session">${escapeHtml(session ? sessionTitle(session, preferences, world) : "Session unavailable")}</span></span><span class="roster-state"><span class="status-chip ${agent.state}">${statusSymbol[agent.state]} ${stateLabel(agent)}</span><span class="freshness">${freshnessLabel(agent)}</span></span></button>`;
    }).join("") || '<p class="muted roster-empty">No visible agents.</p>';
    element(document, "feed").innerHTML = [...snapshot.feed].sort((a, b) => b.at - a.at || b.id - a.id).slice(0, 60).map((entry) => {
        const agent = snapshot.agents.find((agent) => agent.id === entry.agentId && agent.provider === entry.provider);
        const name = agent ? appearanceFor(agent, preferences).nickname || reportedName(agent) : "Agent identity unavailable";
        return `<li><span class="feed-dot ${entry.provider.toLowerCase()}" aria-hidden="true"></span><div><span class="feed-provider">${entry.provider} · ${escapeHtml(name)}</span><p>${escapeHtml(entry.label)}</p></div><time>${timeText(entry.at)}</time></li>`;
    }).join("") || '<li class="muted">No observed activity yet.</li>';
    element(document, "connection").innerHTML = snapshot.providers.map((health) => `<span class="source-health"><span class="health-dot ${health.availability}" aria-hidden="true"></span><strong>${health.id}</strong> ${escapeHtml(health.availability)}${health.enabled ? "" : " · off"}</span>`).join("") || '<span class="muted">Source status unknown</span>';
    element(document, "coverage-content").innerHTML = snapshot.providers.map((health) => `<article class="coverage-card"><h3>${health.id} <span class="provider-tag">${health.source}</span></h3><p><strong>${health.availability}</strong> · ${health.enabled ? "enabled" : "disabled"} · observed ${timeText(health.observedAt)}</p><p>${escapeHtml(health.detail)}</p><dl>${Object.entries(health.capabilities).map(([key, value]) => `<div><dt>${key}</dt><dd>${value}</dd></div>`).join("")}</dl></article>`).join("") || '<p class="muted">No source health has been observed. Empty coverage is not proof that no sessions exist.</p>';
    element(document, "codex").textContent = snapshot.providers.some((health) => health.id === "Codex" && health.enabled) ? "Disable local Codex" : "Enable local Codex";
    for (const [id, checked] of [["hide-titles", preferences.hideTitles], ["show-ended", preferences.showEnded], ["vignettes", preferences.vignettes], ["dialogue", preferences.dialogue]]) {
        const control = document.getElementById(String(id));
        if (control instanceof HTMLInputElement) control.checked = checked === true;
    }
    if (selected) {
        const agent = visible.find((item) => item.id === selected);
        if (agent) drawDetails(element(document, "details"), agent, state, world);
    }
    decorateOffice(document, state, world);
}

/** @param {Document} document @param {string} selector @param {string} key @param {string|null} id */
function focusMatch(document, selector, key, id) {
    for (const node of document.querySelectorAll(selector)) {
        if (node instanceof HTMLElement && node.dataset[key] === id) { node.focus({ preventScroll: true }); return; }
    }
}

/** Render engine output strictly as labeled decoration, leaving factual controls/feed untouched.
 * @param {Document} document @param {OfficePageState} state @param {import("./world-types.js").WorldView|undefined} world
 */
function decorateOffice(document, state, world) {
    /** @type {Map<string, {node: HTMLElement, world: import("./world-types.js").WorldCluster}>} */
    const spaces = new Map();
    for (const cluster of document.querySelectorAll(".session-cluster[data-session]")) {
        if (!(cluster instanceof HTMLElement)) continue;
        const projected = world?.clusters.find((item) => item.sessionId === cluster.dataset.session);
        if (projected?.visible) spaces.set(projected.spaceId, { node: cluster, world: projected });
    }
    /** Project world coordinates into the responsive DOM, anchoring desks to their real furniture.
     * @param {import("./world-types.js").Position} position @param {string} spaceId
     * @returns {import("./world-types.js").Position|null}
     */
    function project(position, spaceId) {
        const space = spaces.get(spaceId);
        if (!space) return null;
        const desk = world?.characters.find((item) => item.spaceId === spaceId && item.deskPosition.x === position.x && item.deskPosition.y === position.y);
        const station = Array.from(space.node.querySelectorAll("[data-station]")).find((item) => item instanceof HTMLElement && item.dataset.station === desk?.agentId);
        const furniture = station?.querySelector(".pixel-desk")?.getBoundingClientRect();
        if (furniture) return { x: furniture.left + furniture.width / 2, y: furniture.bottom };
        const stage = space.node.querySelector(".scene-space")?.getBoundingClientRect();
        if (!stage) return null;
        return {
            x: stage.left + Math.max(24, Math.min(stage.width - 24, (position.x - space.world.position.x) / 400 * stage.width)),
            y: stage.top + Math.max(26, Math.min(stage.height - 26, (position.y - space.world.position.y) / 80 * stage.height)),
        };
    }
    /** @param {import("./world-types.js").PropKind} kind @returns {string} */
    function propSymbol(kind) { return kind === "web" ? "♧" : kind === "mug" ? "☕" : kind === "leaves" ? "❧" : "▤"; }
    /** @param {import("./world-types.js").OfficeEffectKind} kind @returns {string} */
    function quietEffectSymbol(kind) { return kind === "ghost" ? "✧" : kind === "spider" ? "♧" : kind === "screen-flicker" ? "✦" : "⌁"; }
    for (const cluster of document.querySelectorAll(".session-cluster[data-session]")) {
        if (!(cluster instanceof HTMLElement)) continue;
        const session = state.snapshot.sessions.find((item) => item.id === cluster.dataset.session);
        if (!session) continue;
        const projected = world?.clusters.find((item) => item.sessionId === session.id);
        cluster.hidden = projected ? !projected.visible : session.closed && !state.preferences.showEnded;
        cluster.classList.toggle("abandoned", projected?.abandoned === true || session.closed && !state.snapshot.agents.some((agent) => agent.sessionId === session.id && !agent.ended));
        cluster.classList.toggle("quiet-cluster", projected?.quiet === true);
        const title = cluster.querySelector(".cluster-heading h3");
        if (title) title.textContent = sessionTitle(session, state.preferences, world);
        const motifs = cluster.querySelector("[data-motifs]");
        const values = session.closed || projected?.quiet ? [] : projected?.motifs ?? deriveMotifs(session.title);
        if (motifs) motifs.innerHTML = values.map((motif) => `<span class="motif">${escapeHtml(motif.symbol)} ${escapeHtml(motif.label)}</span>`).join("");
        cluster.querySelector(".abandoned-note")?.remove();
        const props = cluster.hidden ? [] : world?.props.filter((prop) => prop.spaceId === projected?.spaceId) ?? [];
        let propLayer = cluster.querySelector(".office-props");
        if (!propLayer && props.length) {
            propLayer = document.createElement("div");
            propLayer.className = "office-props";
            propLayer.setAttribute("role", "group");
            propLayer.setAttribute("aria-label", "Decorative office props");
            cluster.append(propLayer);
        }
        for (const node of propLayer?.querySelectorAll("[data-prop]") ?? []) {
            if (node instanceof HTMLElement && !props.some((prop) => prop.id === node.dataset.prop)) node.remove();
        }
        for (const prop of props) {
            let node = Array.from(propLayer?.children ?? []).find((item) => item instanceof HTMLElement && item.dataset.prop === prop.id);
            if (!node) {
                node = document.createElement("span");
                node.className = "office-prop";
                if (node instanceof HTMLElement) node.dataset.prop = prop.id;
                propLayer?.append(node);
            }
            if (!(node instanceof HTMLElement)) continue;
            node.setAttribute("role", "img");
            node.setAttribute("aria-label", `Fictional office prop: ${prop.kind}${prop.cleanupSceneId ? ", being picked up" : ""}`);
            node.textContent = `${propSymbol(prop.kind)} ${prop.kind}${prop.cleanupSceneId ? " · picking up" : ""}`;
            node.classList.toggle("being-collected", Boolean(prop.cleanupSceneId));
            const point = project(prop.position, prop.spaceId);
            const bounds = cluster.getBoundingClientRect();
            if (point) {
                node.style.left = `${point.x - bounds.left - cluster.clientLeft}px`;
                node.style.top = `${point.y - bounds.top - cluster.clientTop}px`;
            }
        }
        const effect = world?.abandonedEffects.find((item) => item.clusterId === projected?.id);
        if (effect) {
            const node = document.createElement("p");
            node.className = "abandoned-note";
            node.setAttribute("role", "img");
            node.setAttribute("aria-label", `Fictional office effect: ${effect.kind}`);
            node.textContent = `♧ ${effect.kind}`;
            cluster.append(node);
        }
        const quietEffects = projected?.quiet === true && !cluster.hidden
            ? world?.quietEffects.filter((item) => item.clusterId === projected.id) ?? []
            : [];
        for (const node of cluster.querySelectorAll("[data-quiet-effect]")) {
            if (node instanceof HTMLElement && !quietEffects.some((item) => item.id === node.dataset.quietEffect)) node.remove();
        }
        for (const quietEffect of quietEffects) {
            let node = Array.from(cluster.querySelectorAll("[data-quiet-effect]"))
                .find((item) => item instanceof HTMLElement && item.dataset.quietEffect === quietEffect.id);
            if (!node) {
                node = document.createElement("span");
                node.className = "quiet-effect";
                if (node instanceof HTMLElement) node.dataset.quietEffect = quietEffect.id;
                cluster.append(node);
            }
            if (!(node instanceof HTMLElement)) continue;
            node.setAttribute("role", "img");
            node.setAttribute("aria-label", `Fictional quiet-office ambience: ${quietEffect.kind.replaceAll("-", " ")}`);
            node.textContent = quietEffectSymbol(quietEffect.kind);
            const point = project(quietEffect.position, quietEffect.spaceId);
            const bounds = cluster.getBoundingClientRect();
            if (point) {
                node.style.left = `${point.x - bounds.left - cluster.clientLeft}px`;
                node.style.top = `${point.y - bounds.top - cluster.clientTop}px`;
            }
        }
    }
    for (const node of document.querySelectorAll("button.character")) {
        if (!(node instanceof HTMLElement)) continue;
        const character = world?.characters.find((item) => item.agentId === node.dataset.agent);
        const scene = world?.scenes.find((item) => item.id === character?.sceneId);
        node.classList.toggle("in-scene", Boolean(scene));
        node.dataset.pose = character?.pose ?? "neutral";
        node.querySelector(".scene-badge")?.remove();
        if (scene) {
            const sceneBadge = document.createElement("span");
            const sceneLabel = scene.label.replace(/^office fiction\s*[·:—-]\s*/i, "");
            sceneBadge.className = "scene-badge";
            sceneBadge.setAttribute("role", "note");
            sceneBadge.setAttribute("aria-label", `Fictional office scene: ${sceneLabel}`);
            sceneBadge.textContent = sceneLabel;
            node.append(sceneBadge);
        }
        const dialogue = world?.dialogue.find((item) => item.agentId === node.dataset.agent);
        const oldBubble = node.querySelector(".dialogue-bubble");
        if (!dialogue || !state.preferences.dialogue) oldBubble?.remove();
        else {
            /** @type {HTMLElement|null} */
            let bubble = oldBubble instanceof HTMLElement ? oldBubble : null;
            if (!bubble || bubble.dataset.dialogue !== dialogue.id) {
                bubble?.remove();
                bubble = document.createElement("span");
                bubble.className = "dialogue-bubble";
                bubble.setAttribute("role", "note");
                bubble.dataset.dialogue = dialogue.id;
                node.append(bubble);
            }
            const line = dialogue.text.replace(/\s+/g, " ").trim();
            if (bubble.textContent !== line) bubble.textContent = line;
            bubble.setAttribute("aria-label", `Fictional character dialogue: ${line}`);
            const readingTime = Math.max(3_000, Math.min(8_000, dialogue.endsAt - dialogue.startedAt));
            const elapsedTime = Math.max(0, Math.min(readingTime, (world?.now ?? dialogue.startedAt) - dialogue.startedAt));
            bubble.style.setProperty("--dialogue-duration", `${readingTime}ms`);
            bubble.style.setProperty("--dialogue-delay", `-${elapsedTime}ms`);
        }
        const person = node.querySelector(":scope > .pixel-person");
        if (!(person instanceof HTMLElement)) continue;
        const cleanup = world?.props.find((prop) => prop.cleanupSceneId === scene?.id);
        const host = world?.characters.find((item) => item.agentId === scene?.participants[0]);
        const target = character && scene ? project(character.position, cleanup?.spaceId ?? host?.spaceId ?? character.spaceId) : null;
        if (character && scene && target) {
            const bounds = node.getBoundingClientRect();
            const ordinal = scene.participants.indexOf(character.agentId);
            const offset = cleanup ? (ordinal % 2 ? 1 : -1) * (24 + Math.floor(ordinal / 2) * 36) : 0;
            const x = target.x + offset - (bounds.left + person.offsetLeft + person.offsetWidth / 2);
            const y = target.y + (cleanup ? 22 : 0) - (bounds.top + person.offsetTop + person.offsetHeight / 2);
            node.style.setProperty("--scene-x", `${x}px`);
            node.style.setProperty("--scene-y", `${y}px`);
        } else { node.style.removeProperty("--scene-x"); node.style.removeProperty("--scene-y"); }
        if (cleanup) person.dataset.carrying = propSymbol(cleanup.kind);
        else delete person.dataset.carrying;
    }
    element(document, "ambience").replaceChildren();
}

/** @param {Document} document */
export function mountOffice(document) {
    /** @type {OfficePageState} */
    let state;
    try { state = parseOfficeState(/** @type {unknown} */ (JSON.parse(element(document, "office-state").textContent ?? "null"))); }
    catch {
        element(document, "notice").hidden = false;
        element(document, "notice").textContent = "Office state could not be read. Reload this panel to try again.";
        return;
    }
    /** @type {string|null} */
    let selected = null;
    let stopped = false;
    let refreshing = false;
    let saving = false;
    let actionPending = false;
    let offline = false;
    let preferenceRevision = 0;
    let lifecycleRevision = 0;
    /** @type {Set<AbortController>} */
    const requestControllers = new Set();
    const emptyDetails = element(document, "details").innerHTML;
    /** @type {import("./world-types.js").OfficeWorld|null} */
    let localWorld = null;
    /** @returns {import("./world-types.js").WorldView} */
    function currentWorld() {
        if (state.world) return state.world;
        localWorld ??= createOfficeWorld();
        localWorld.update(state.snapshot, state.preferences);
        return localWorld.view();
    }

    /** @param {string} message @param {boolean} [error] */
    function notice(message, error = false) {
        const target = element(document, "notice");
        target.hidden = !message;
        target.textContent = message;
        target.classList.toggle("error", error);
    }
    function redraw() {
        const focused = document.activeElement;
        const focusedAgent = focused instanceof HTMLElement ? focused.dataset.agent : undefined;
        const focusedTitle = focused instanceof HTMLElement ? focused.dataset.title : undefined;
        if (selected && !state.snapshot.agents.some((agent) => agent.id === selected && (state.preferences.showEnded || !agent.ended))) {
            selected = null;
            element(document, "details").innerHTML = emptyDetails;
        }
        const focusedDetailId = focused instanceof HTMLElement && element(document, "details").contains(focused) ? focused.id : "";
        drawOffice(document, state, selected, currentWorld());
        if (focusedDetailId && !focused?.isConnected) document.getElementById(focusedDetailId)?.focus({ preventScroll: true });
        if (focusedAgent) focusMatch(document, focused?.classList.contains("character") ? "button.character" : "button.roster-entry", "agent", focusedAgent);
        if (focusedTitle) focusMatch(document, "[data-title]", "title", focusedTitle);
        document.documentElement.classList.toggle("source-offline", offline);
    }
    /** @param {string} path @param {RequestInit} [options] @returns {Promise<unknown>} */
    async function request(path, options = {}) {
        const controller = new AbortController();
        requestControllers.add(controller);
        const timeout = setTimeout(() => controller.abort(), 12_000);
        try {
            const response = await fetch(path, { cache: "no-store", ...options, signal: controller.signal });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            if (path !== "/state" && path !== "/preferences") return null;
            /** @type {unknown} */
            const payload = await response.json();
            return payload;
        } finally { clearTimeout(timeout); requestControllers.delete(controller); }
    }
    async function refreshState() {
        if (refreshing || saving || actionPending || stopped) return;
        refreshing = true;
        const revision = preferenceRevision;
        const lifecycle = lifecycleRevision;
        try {
            const next = parseOfficeState(await request("/state"));
            if (stopped || lifecycle !== lifecycleRevision) return;
            state = { ...next, preferences: revision === preferenceRevision && !saving ? next.preferences : state.preferences };
            offline = false;
            notice("");
            redraw();
        } catch {
            if (stopped || lifecycle !== lifecycleRevision) return;
            offline = true;
            notice("Office connection unavailable. Displayed observations may be stale; no activity is inferred.", true);
            document.documentElement.classList.add("source-offline");
        } finally { if (lifecycle === lifecycleRevision) refreshing = false; }
    }
    /** @param {Partial<Preferences>} preferences */
    async function savePreferences(preferences) {
        if (saving || stopped) return;
        saving = true;
        const lifecycle = lifecycleRevision;
        element(document, "preference-status").textContent = "Saving preferences…";
        try {
            const response = parsePreferences(await request("/preferences", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(preferences) }));
            if (stopped || lifecycle !== lifecycleRevision) return;
            preferenceRevision++;
            state = { ...state, preferences: response };
            redraw();
            element(document, "preference-status").textContent = "Preferences saved locally.";
        } catch {
            if (stopped || lifecycle !== lifecycleRevision) return;
            element(document, "preference-status").textContent = "Preferences were not saved. Try again; stored settings were not changed.";
            redraw();
        } finally { if (lifecycle === lifecycleRevision) saving = false; }
    }
    /** @param {string} path */
    async function sourceAction(path) {
        if (actionPending || stopped) return;
        actionPending = true;
        const lifecycle = lifecycleRevision;
        element(document, "codex").setAttribute("disabled", "");
        element(document, "refresh").setAttribute("disabled", "");
        notice("Updating local source coverage…");
        try {
            await request(path, { method: "POST" });
            if (!stopped && lifecycle === lifecycleRevision) notice("");
        } catch {
            if (!stopped && lifecycle === lifecycleRevision) notice("Local source action failed. Existing observations are unchanged; check coverage and retry.", true);
        } finally {
            if (lifecycle === lifecycleRevision) {
                actionPending = false;
                element(document, "codex").removeAttribute("disabled");
                element(document, "refresh").removeAttribute("disabled");
            }
        }
        if (!stopped && lifecycle === lifecycleRevision) await refreshState();
    }
    /** @param {string|null} id @param {boolean} [focusDetails] */
    function select(id, focusDetails = false) {
        selected = id;
        element(document, "details").innerHTML = emptyDetails;
        redraw();
        if (focusDetails && id) element(document, "details-title").focus({ preventScroll: true });
    }
    document.addEventListener("click", (event) => {
        if (!(event.target instanceof Element)) return;
        const target = event.target.closest("button");
        if (!(target instanceof HTMLButtonElement) || target.disabled) return;
        if (target.dataset.agent) select(target.dataset.agent, true);
        if (target.dataset.title) {
            const id = target.dataset.title;
            void savePreferences({ hiddenSessionTitles: { ...state.preferences.hiddenSessionTitles, [id]: !state.preferences.hiddenSessionTitles[id] } });
        }
        if (target.id === "close-details") {
            const id = selected;
            select(null);
            focusMatch(document, "button.character", "agent", id);
        }
        if (target.id === "codex") void sourceAction(state.snapshot.providers.some((health) => health.id === "Codex" && health.enabled) ? "/codex/disable" : "/codex/enable");
        if (target.id === "refresh") {
            if (state.snapshot.providers.some((health) => health.id === "Codex" && health.enabled)) void sourceAction("/codex/refresh");
            else void refreshState();
        }
        if (target.id === "reset-appearance" && selected) {
            const appearances = { [selected]: deterministicAppearance(selected) };
            const editor = document.querySelector(".customization");
            if (editor instanceof HTMLDetailsElement) {
                editor.open = false;
                editor.querySelector("summary")?.focus({ preventScroll: true });
            }
            void savePreferences({ appearances });
        }
    });
    document.addEventListener("change", (event) => {
        const target = event.target;
        if (!(target instanceof HTMLInputElement)) return;
        const key = target.id === "hide-titles" ? "hideTitles" : target.id === "show-ended" ? "showEnded" : target.id === "vignettes" ? "vignettes" : target.id === "dialogue" ? "dialogue" : null;
        if (key) void savePreferences({ [key]: target.checked });
    });
    document.addEventListener("submit", (event) => {
        if (!(event.target instanceof HTMLFormElement) || event.target.id !== "appearance-form" || !selected) return;
        event.preventDefault();
        const values = new FormData(event.target);
        const appearance = parseAppearance(Object.fromEntries(values.entries()));
        if (appearance) {
            const editor = document.querySelector(".customization");
            if (editor instanceof HTMLDetailsElement) {
                editor.open = false;
                editor.querySelector("summary")?.focus({ preventScroll: true });
            }
            void savePreferences({ appearances: { [selected]: appearance } });
        }
    });
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && selected) {
            const id = selected;
            select(null);
            focusMatch(document, "button.character", "agent", id);
        }
    });
    redraw();
    element(document, "clock").textContent = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    /** @type {ReturnType<typeof setInterval>|null} */
    let ambience = null;
    /** @type {ReturnType<typeof setInterval>|null} */
    let poll = null;
    const resize = () => decorateOffice(document, state, currentWorld());
    function startTimers() {
        if (poll !== null) return;
        ambience = setInterval(() => {
            if (!stopped && !document.hidden && !state.world) {
                localWorld?.tick();
                decorateOffice(document, state, currentWorld());
            }
        }, 1_000);
        poll = setInterval(() => { if (!document.hidden) void refreshState(); }, 2_000);
        document.defaultView?.addEventListener("resize", resize);
    }
    startTimers();
    document.defaultView?.addEventListener("pagehide", () => {
        stopped = true;
        lifecycleRevision++;
        if (poll !== null) clearInterval(poll);
        if (ambience !== null) clearInterval(ambience);
        poll = ambience = null;
        document.defaultView?.removeEventListener("resize", resize);
        for (const controller of requestControllers) controller.abort();
        requestControllers.clear();
        refreshing = saving = actionPending = false;
    });
    document.defaultView?.addEventListener("pageshow", (event) => {
        if (!event.persisted || !stopped) return;
        stopped = false;
        element(document, "codex").removeAttribute("disabled");
        element(document, "refresh").removeAttribute("disabled");
        element(document, "preference-status").textContent = "";
        startTimers();
        void refreshState();
    });
}

if (typeof document !== "undefined") mountOffice(document);
