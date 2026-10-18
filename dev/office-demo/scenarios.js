import { createOfficeWorld } from "./production-src/office-world.js";

const NOW = Date.UTC(2026, 9, 18, 12, 0, 0);

/** @param {string} value @returns {number} */
function hashSeed(value) {
  let hash = 2166136261;
  for (const point of value) hash = Math.imul(hash ^ (point.codePointAt(0) ?? 0), 16777619) >>> 0;
  return hash;
}

/** @param {number} seed @returns {() => number} */
export function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6d2b79f5) >>> 0;
    let next = value;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

/** @param {string} id @param {"Copilot"|"Codex"} provider @param {string|null} title @param {Partial<import("../../.github/extensions/pixel-agents-canvas/src/product-types.js").OfficeSession>} [overrides] */
function session(id, provider, title, overrides = {}) {
  return { id, provider, sourceId: `mock-${id}`, title, parentSessionId: null, archived: false, closed: false, endedAt: null, ...overrides };
}

/** @param {string} id @param {string} sessionId @param {"Copilot"|"Codex"} provider @param {Partial<import("../../.github/extensions/pixel-agents-canvas/src/product-types.js").OfficeAgent>} [overrides] */
function agent(id, sessionId, provider, overrides = {}) {
  return { id, sessionId, provider, sourceId: `mock-${id}`, name: `${provider} ${id}`, role: null, parentAgentId: null, state: "idle", waitingReason: null, connected: true, freshness: "fresh", observedAt: NOW, lastActivityAt: NOW - 12000, ended: false, endedAt: null, lastTurnOutcome: null, ...overrides };
}

/** @param {"Copilot"|"Codex"} id @param {import("../../.github/extensions/pixel-agents-canvas/src/types.js").ProviderAvailability} availability @param {boolean} enabled @param {string} detail */
function health(id, availability, enabled, detail) {
  return { id, source: id === "Copilot" ? "copilotcli" : "app-server", availability, enabled, detail, observedAt: enabled ? NOW : null, capabilities: { discovery: enabled ? "supported" : "unknown", agents: enabled ? "supported" : "unknown", navigation: "unsupported" } };
}

/** @param {number} id @param {"Copilot"|"Codex"} provider @param {string} sessionId @param {string} label @param {string|null} agentId */
function feed(id, provider, sessionId, label, agentId) {
  return { id, provider, sessionId, label, agentId, at: NOW - id * 15000 };
}

/** @param {Partial<import("../../.github/extensions/pixel-agents-canvas/src/product-types.js").Preferences>} [overrides] */
function preferences(overrides = {}) {
  return { hideTitles: false, hiddenSessionTitles: {}, showEnded: true, vignettes: true, dialogue: true, appearances: {}, ...overrides };
}

/** @typedef {{ id: string, title: string, description: string, covers: string[], build: () => Pick<import("../../.github/extensions/pixel-agents-canvas/src/product-types.js").OfficePageState, "snapshot"|"preferences">, viewport?: "wide"|"tablet"|"narrow", reducedMotion?: boolean }} Scenario */

/** @type {Scenario[]} */
const definitions = [
  { id: "no-observation", title: "No source observation", description: "No provider health, session, or agent has been observed.", covers: ["unknown coverage", "empty floor"], build: () => ({ snapshot: { providers: [], sessions: [], agents: [], feed: [], now: NOW }, preferences: preferences() }) },
  { id: "source-health", title: "Unsupported and unavailable", description: "Provider coverage is known to be unsupported or temporarily unavailable.", covers: ["unsupported", "unavailable", "coverage details"], build: () => ({ snapshot: { providers: [health("Copilot", "unsupported", false, "This host does not expose the Copilot CLI source."), health("Codex", "unavailable", false, "The local Codex source is not enabled.")], sessions: [], agents: [], feed: [], now: NOW }, preferences: preferences() }) },
  { id: "copilot-empty", title: "Copilot connected · confirmed empty", description: "A connected Copilot source reports no sessions.", covers: ["connected", "confirmed empty", "Copilot only"], build: () => ({ snapshot: { providers: [health("Copilot", "empty", true, "Connected; no sessions were reported."), health("Codex", "unsupported", false, "Unsupported in this mock host.")], sessions: [], agents: [], feed: [], now: NOW }, preferences: preferences() }) },
  { id: "codex-empty", title: "Codex connected · confirmed empty", description: "A connected Codex source reports no sessions.", covers: ["confirmed empty", "Codex only"], build: () => ({ snapshot: { providers: [health("Copilot", "unavailable", false, "Copilot source is unavailable."), health("Codex", "empty", true, "Connected; no sessions were reported.")], sessions: [], agents: [], feed: [], now: NOW }, preferences: preferences() }) },
  { id: "empty-session", title: "Active session · no agents", description: "A session exists while its source has not reported any agent identities.", covers: ["empty active session", "no inferred workers"], build: () => ({ snapshot: { providers: [health("Codex", "connected", true, "Session metadata is available; no agents reported." )], sessions: [session("empty-codex", "Codex", "Review API coverage")], agents: [], feed: [], now: NOW }, preferences: preferences() }) },
  { id: "copilot-working", title: "Copilot · working", description: "One active provider-reported agent with a task title and observed event.", covers: ["active session", "working", "title motifs", "activity feed"], build: () => ({ snapshot: { providers: [health("Copilot", "connected", true, "Hosting session is connected.")], sessions: [session("copilot-ui", "Copilot", "Implement canvas accessibility")], agents: [agent("copilot-main", "copilot-ui", "Copilot", { name: "Copilot CLI", state: "working" })], feed: [feed(1, "Copilot", "copilot-ui", "Agent started working", "copilot-main")], now: NOW }, preferences: preferences() }) },
  { id: "provider-combinations", title: "Both providers · multiple clusters", description: "Independent Copilot and Codex sources, parent-linked agents, mixed active states, and several session clusters.", covers: ["both providers", "multiple clusters", "working", "waiting", "idle", "subagent", "feed"], build: () => ({ snapshot: { providers: [health("Copilot", "connected", true, "Hosting session activity observed."), health("Codex", "connected", true, "Local Codex metadata source connected.")], sessions: [session("copilot-docs", "Copilot", "Document renderer behavior"), session("codex-parent", "Codex", "Review frontend accessibility"), session("codex-child", "Codex", "Test keyboard navigation", { parentSessionId: "codex-parent" })], agents: [agent("copilot-writer", "copilot-docs", "Copilot", { name: "Documentation agent", state: "working" }), agent("codex-lead", "codex-parent", "Codex", { name: "Codex lead", state: "waiting", waitingReason: "approval" }), agent("codex-reviewer", "codex-parent", "Codex", { name: "Codex reviewer", state: "working", parentAgentId: "codex-lead" }), agent("codex-tester", "codex-child", "Codex", { name: "Codex tester", state: "idle" })], feed: [feed(1, "Copilot", "copilot-docs", "Agent started working", "copilot-writer"), feed(2, "Codex", "codex-parent", "Agent is waiting for approval", "codex-lead"), feed(3, "Codex", "codex-child", "Test run completed", "codex-tester")], now: NOW }, preferences: preferences() }) },
  { id: "attention-states", title: "Waiting and issue states", description: "Approval and input waits remain distinct; a failed state has a visible factual status.", covers: ["waiting for approval", "waiting for input", "failed", "feed"], build: () => ({ snapshot: { providers: [health("Codex", "connected", true, "Three distinct agent statuses.")], sessions: [session("attention", "Codex", "Fix failing tests")], agents: [agent("needs-approval", "attention", "Codex", { name: "Approval wait", state: "waiting", waitingReason: "approval" }), agent("needs-input", "attention", "Codex", { name: "Input wait", state: "waiting", waitingReason: "input" }), agent("reported-issue", "attention", "Codex", { name: "Issue reporter", state: "failed", lastTurnOutcome: "failed" })], feed: [feed(1, "Codex", "attention", "Waiting for approval", "needs-approval"), feed(2, "Codex", "attention", "Waiting for input", "needs-input"), feed(3, "Codex", "attention", "Agent reported an issue", "reported-issue")], now: NOW }, preferences: preferences() }) },
  { id: "uncertain-agents", title: "Unknown, stale, and disconnected", description: "Uncertainty, stale freshness, and source disconnection stay visible as separate facts.", covers: ["unknown state", "stale freshness", "disconnected agent", "partial coverage"], build: () => ({ snapshot: { providers: [health("Copilot", "stale", true, "Last complete source observation is stale."), health("Codex", "disconnected", false, "Local process is disconnected.")], sessions: [session("uncertain-copilot", "Copilot", "Investigate unknown state"), session("stale-codex", "Codex", "Refactor session freshness"), session("offline-codex", "Codex", "Inspect disconnected source")], agents: [agent("unknown-agent", "uncertain-copilot", "Copilot", { state: "unknown", freshness: "unknown" }), agent("stale-agent", "stale-codex", "Codex", { state: "working", freshness: "stale", observedAt: NOW - 180000 }), agent("offline-agent", "offline-codex", "Codex", { state: "working", connected: false })], feed: [feed(1, "Copilot", "uncertain-copilot", "Agent state is unknown", "unknown-agent")], now: NOW }, preferences: preferences() }) },
  { id: "ended-off-duty", title: "Explicitly ended · off duty", description: "Only the explicit provider close marker ends the session and moves its agent off duty.", covers: ["explicit end", "ended agent", "off-duty fiction", "show ended"], build: () => ({ snapshot: { providers: [health("Codex", "connected", true, "Session close was explicitly observed.")], sessions: [session("ended-session", "Codex", "Complete release notes", { closed: true, endedAt: NOW - 60000 })], agents: [agent("ended-agent", "ended-session", "Codex", { name: "Former release agent", state: "completed", ended: true, endedAt: NOW - 60000, lastTurnOutcome: "completed" })], feed: [feed(1, "Codex", "ended-session", "Session explicitly ended", "ended-agent")], now: NOW }, preferences: preferences({ showEnded: true }) }) },
  { id: "privacy-appearance", title: "Titles, privacy, and appearance", description: "Per-session title hiding, a local alias, and appearance settings are visible alongside a title-derived motif.", covers: ["hidden titles", "local alias", "appearance", "motif boundary"], build: () => ({ snapshot: { providers: [health("Copilot", "connected", true, "Synthetic provider titles may contain sensitive text.")], sessions: [session("private-one", "Copilot", "Security review for customer-token-redaction"), session("private-two", "Copilot", "Design the accessibility guide")], agents: [agent("privacy-agent", "private-one", "Copilot", { name: "Reported agent", state: "working" }), agent("alias-agent", "private-two", "Copilot", { name: "Second reported agent", state: "idle" })], feed: [feed(1, "Copilot", "private-one", "Agent is working", "privacy-agent")], now: NOW }, preferences: preferences({ hiddenSessionTitles: { "private-two": true }, appearances: { "privacy-agent": { nickname: "Local alias", palette: "#b87857", outfit: "vest", accessory: "glasses", deskProp: "plant" } } }) }) },
  { id: "coverage-feed", title: "Coverage and partial feed", description: "Mixed capabilities, a missing agent identity, and a generic event feed.", covers: ["coverage matrix", "unknown capability", "partial metadata", "feed identity unavailable"], build: () => ({ snapshot: { providers: [health("Copilot", "connected", true, "Only hosting-session scope is observable."), { ...health("Codex", "stale", true, "Metadata refresh is delayed."), capabilities: { discovery: "supported", agents: "unavailable", navigation: "unsupported" } }], sessions: [session("partial-session", "Copilot", "Check coverage metadata"), session("orphan-container", "Codex", "Session without agent identity")], agents: [agent("partial-agent", "partial-session", "Copilot", { name: null, role: null, state: "idle" })], feed: [feed(1, "Copilot", "partial-session", "Generic state update", "partial-agent"), feed(2, "Codex", "orphan-container", "Source status changed", null)], now: NOW }, preferences: preferences() }) },
  { id: "quiet-fiction", title: "Quiet office fiction", description: "Idle and unknown observations can receive clearly labeled fictional ambience without changing their factual status.", covers: ["quiet cluster", "fiction label", "no inferred idle or end"], build: () => ({ snapshot: { providers: [health("Copilot", "connected", true, "Quiet mock session remains observed.")], sessions: [session("quiet-session", "Copilot", "Explore canvas state"), session("quiet-unknown", "Copilot", "Investigate unknown agent")], agents: [agent("quiet-idle", "quiet-session", "Copilot", { name: "Quiet agent", state: "idle" }), agent("quiet-unknown-agent", "quiet-unknown", "Copilot", { name: "Unknown agent", state: "unknown", freshness: "unknown" })], feed: [], now: NOW }, preferences: preferences() }) },
  { id: "preferences-off", title: "Preferences turned off", description: "Presentation toggles are off and explicitly ended identities are hidden by preference.", covers: ["scene toggle", "dialogue toggle", "ended hidden", "preference controls"], build: () => ({ snapshot: { providers: [health("Codex", "connected", true, "Provider state stays factual when presentation is off.")], sessions: [session("quiet-controls", "Codex", "Review reduced motion")], agents: [agent("presentation-agent", "quiet-controls", "Codex", { state: "idle" }), agent("hidden-ended", "quiet-controls", "Codex", { state: "completed", ended: true, endedAt: NOW - 20000 })], feed: [], now: NOW }, preferences: preferences({ showEnded: false, vignettes: false, dialogue: false }) }) },
  { id: "responsive-reduced", title: "Narrow · reduced motion", description: "A narrow viewport and static motion preference exercise the responsive renderer.", covers: ["390 px viewport", "reduced motion", "responsive clusters"], viewport: "narrow", reducedMotion: true, build: () => ({ snapshot: { providers: [health("Copilot", "connected", true, "Narrow synthetic preview.")], sessions: [session("narrow-a", "Copilot", "Build responsive canvas interface"), session("narrow-b", "Copilot", "Test keyboard navigation")], agents: [agent("narrow-working", "narrow-a", "Copilot", { state: "working" }), agent("narrow-waiting", "narrow-b", "Copilot", { state: "waiting", waitingReason: "input" })], feed: [feed(1, "Copilot", "narrow-a", "Agent started working", "narrow-working")], now: NOW }, preferences: preferences({ dialogue: false }) }) },
];

/** @returns {readonly Pick<Scenario, "id"|"title"|"description"|"covers"|"viewport"|"reducedMotion">[]} */
export function listScenarios() {
  return definitions.map(({ id, title, description, covers, viewport, reducedMotion }) => ({ id, title, description, covers, viewport, reducedMotion }));
}

/** @param {string} id @param {string} [seed] @returns {import("../../.github/extensions/pixel-agents-canvas/src/product-types.js").OfficePageState} */
export function buildScenarioState(id, seed = "42") {
  const scenario = definitions.find((item) => item.id === id);
  if (!scenario) throw new Error(`Unknown demo scenario: ${id}`);
  const base = scenario.build();
  return { ...base, world: buildScenarioWorld(base.snapshot, base.preferences, id, seed) };
}

/** @param {import("../../.github/extensions/pixel-agents-canvas/src/product-types.js").OfficeSnapshot} snapshot @param {import("../../.github/extensions/pixel-agents-canvas/src/product-types.js").Preferences} preferences @param {string} id @param {string} [seed] */
export function buildScenarioWorld(snapshot, preferences, id, seed = "42") {
  let now = NOW;
  const world = createOfficeWorld({ clock: () => now, random: seededRandom(hashSeed(`${seed}:${id}`)) });
  world.update(snapshot, preferences);
  for (let step = 0; step < 3; step++) {
    now += 30000;
    world.tick();
  }
  return world.view();
}

/** @param {string} seed @returns {string[]} */
export function scenarioOrderForSeed(seed) {
  const order = definitions.map((item) => item.id);
  const random = seededRandom(hashSeed(seed));
  for (let index = order.length - 1; index > 0; index--) {
    const swap = Math.floor(random() * (index + 1));
    [order[index], order[swap]] = [order[swap], order[index]];
  }
  return order;
}
