import { createOfficeWorld } from "./production-src/office-world.js";
import { createOfficeState } from "../../.github/extensions/pixel-agents-canvas/src/office-state.js";

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

/** @typedef {{ id: string, title: string, description: string, covers: string[], viewport?: "wide"|"tablet"|"narrow", reducedMotion?: boolean }} Scenario */
/** @typedef {import("./scenario-types.js").ScenarioProviderUpdate} ProviderUpdate */
/** @typedef {import("./scenario-types.js").ScenarioCodexThread} CodexThreadFixture */
/** @typedef {import("./scenario-types.js").ScenarioRawCopilotEvent} RawCopilotEvent */
/** @typedef {import("./scenario-types.js").ScenarioFrame} ScenarioFrame */
/** @typedef {import("./scenario-types.js").ScenarioFixture} ScenarioFixture */
/** @typedef {import("./scenario-types.js").ScenarioStateInput} ScenarioStateInput */
/** @typedef {import("./scenario-types.js").ScenarioStep} ScenarioStep */

/** @type {readonly string[]} */
export const SCENARIO_COVERAGE = Object.freeze([
  "unknown coverage", "empty floor", "unsupported", "unavailable", "coverage details", "connected", "confirmed empty", "Copilot only", "Codex only",
  "active session",  "working", "title motifs", "activity feed", "both providers", "multiple clusters", "waiting", "idle", "subagent", "feed",
  "waiting for approval", "waiting for input", "failed", "unknown state", "stale freshness", "disconnected agent", "partial coverage", "explicit end", "ended agent", "off-duty fiction", "show ended",
  "hidden titles", "local alias", "appearance", "motif boundary", "coverage matrix", "unknown capability", "partial metadata", "feed identity unavailable", "quiet cluster", "fiction label", "no inferred idle or end",
  "scene toggle", "dialogue toggle", "ended hidden", "preference controls", "wide viewport", "tablet viewport", "narrow viewport", "390 px viewport", "reduced motion", "responsive clusters",
  "solo-vignette", "coffee", "tea", "stretch", "plant", "tidy", "cleanup:tidy", "reading", "antics", "chat", "group-vignette",
  "off-duty-vignette", "off-duty-stroll", "off-duty-plants", "off-duty-window", "off-duty-books", "quiet:chair-movement", "quiet:ghost", "quiet:spider", "quiet:screen-flicker",
  "default-no-observation", "default-source-health", "default-copilot-empty", "default-codex-empty", "default-unmonitored-thread", "default-uncertain-agents", "default-privacy-appearance", "default-coverage-feed",
  "abandoned:chair-movement", "abandoned:ghost", "abandoned:spider", "abandoned:screen-flicker", "dialogue-visible", "dialogue-disabled", "working-pose", "approval-wait-pose",
  "input-wait-pose", "failed-pose", "unknown-pose", "idle-rest-pose", "off-duty-vignette-pose", "codex-turn-completed", "completion-pose", "reduced-motion", "wide-layout", "tablet-layout", "narrow-layout", "desk-setup",
]);

/** @type {Scenario[]} */
const definitions = [
  { id: "no-observation", title: "No source observation", description: "No provider activity event has been observed.", covers: ["unknown coverage", "empty floor"] },
  { id: "source-health", title: "Unsupported and unavailable", description: "Provider coverage is known to be unsupported or temporarily unavailable.", covers: ["unsupported", "unavailable", "coverage details"] },
  { id: "copilot-empty", title: "Copilot connected · confirmed empty", description: "A connected Copilot source reports no sessions.", covers: ["connected", "confirmed empty", "Copilot only"] },
  { id: "codex-empty", title: "Codex connected · confirmed empty", description: "A connected Codex source reports no sessions.", covers: ["confirmed empty", "Codex only"] },
  { id: "empty-session", title: "Codex thread · monitoring unavailable", description: "The production state factory creates an unknown agent record for every listed Codex thread, even when monitoring is unavailable; this does not represent an empty session with no agent identities.", covers: ["unknown state", "partial coverage"] },
  { id: "copilot-working", title: "Copilot · working", description: "A raw Copilot event starts observed work.", covers: ["active session", "working", "title motifs", "activity feed", "wide viewport"], viewport: "wide", reducedMotion: false },
  { id: "provider-combinations", title: "Both providers · multiple clusters", description: "Raw Copilot events and Codex thread metadata produce independent session clusters.", covers: ["both providers", "multiple clusters", "working", "waiting", "idle", "subagent", "feed", "tablet viewport"], viewport: "tablet" },
  { id: "attention-states", title: "Waiting and issue states", description: "Codex thread statuses represent approval/input waits and system errors.", covers: ["waiting for approval", "waiting for input", "failed", "feed"] },
  { id: "uncertain-agents", title: "Unknown, stale, and disconnected", description: "Provider update time and monitoring metadata preserve uncertainty.", covers: ["unknown state", "stale freshness", "disconnected agent", "partial coverage"] },
  { id: "ended-off-duty", title: "Explicitly ended · off duty", description: "A raw Copilot shutdown event explicitly ends the hosting session.", covers: ["explicit end", "ended agent", "off-duty fiction", "show ended"] },
  { id: "privacy-appearance", title: "Titles, privacy, and appearance", description: "Synthetic Codex titles and presentation preferences remain separate inputs.", covers: ["hidden titles", "local alias", "appearance", "motif boundary"] },
  { id: "coverage-feed", title: "Coverage and partial feed", description: "Source updates and unmonitored Codex metadata show partial discovery.", covers: ["coverage matrix", "unknown capability", "partial metadata", "feed identity unavailable"] },
  { id: "quiet-fiction", title: "Quiet office fiction", description: "Explicit idle and unknown source observations can receive fictional ambience.", covers: ["quiet cluster", "fiction label", "no inferred idle or end"] },
  { id: "preferences-off", title: "Preferences turned off", description: "Vignettes and dialogue are disabled as presentation preferences.", covers: ["scene toggle", "dialogue toggle", "ended hidden", "preference controls"] },
  { id: "responsive-reduced", title: "Narrow · reduced motion", description: "Narrow layout and reduced-motion settings accompany real source inputs.", covers: ["390 px viewport", "narrow viewport", "reduced motion", "responsive clusters"], viewport: "narrow", reducedMotion: true },
  { id: "desk-setup", title: "Desk setup after space reuse", description: "Three raw-source stages create a fictional prop, explicitly close the first session, and reuse its physical space for a new hosting session while one OfficeWorld persists.", covers: ["desk-setup"] },
];

export const SCENARIO_LIMITATIONS = Object.freeze([]);

/** @param {string} id @param {string} scenarioId @param {string} seed @param {readonly string[]} covers @param {ScenarioFrame["expected"]} expected @param {string} [afterStepId] @param {number} [atMs] @returns {ScenarioFrame} */
function galleryFrame(id, scenarioId, seed, covers, expected, afterStepId, atMs = NOW + 90000) {
  return { id, scenarioId, seed, covers, expected, atMs, ...(afterStepId ? { afterStepId } : {}) };
}

/** @type {readonly ScenarioFrame[]} */
export const SCENARIO_GALLERY_FRAMES = Object.freeze([
  galleryFrame("default-no-observation", "no-observation", "42", ["default-no-observation"], { providers: [{ id: "Copilot", availability: "unavailable" }, { id: "Codex", availability: "unavailable" }], sessionCount: 0, agentCount: 0 }),
  galleryFrame("default-source-health", "source-health", "42", ["default-source-health"], { providers: [{ id: "Copilot", availability: "unsupported" }, { id: "Codex", availability: "unavailable" }], sessionCount: 0, agentCount: 0 }),
  galleryFrame("default-copilot-empty", "copilot-empty", "42", ["default-copilot-empty"], { providers: [{ id: "Copilot", availability: "empty" }, { id: "Codex", availability: "unsupported" }], sessionCount: 0, agentCount: 0 }),
  galleryFrame("default-codex-empty", "codex-empty", "42", ["default-codex-empty"], { providers: [{ id: "Copilot", availability: "unavailable" }, { id: "Codex", availability: "empty" }], sessionCount: 0, agentCount: 0 }),
  galleryFrame("default-unmonitored-thread", "empty-session", "42", ["default-unmonitored-thread"], { providers: [{ id: "Codex", availability: "connected" }], sessionCount: 1, agentCount: 1, agentStates: [{ agentId: "codex:empty-codex:agent:empty-codex", state: "unknown", ended: false }] }),
  galleryFrame("default-uncertain-agents", "uncertain-agents", "42", ["default-uncertain-agents"], { providers: [{ id: "Copilot", availability: "stale" }, { id: "Codex", availability: "disconnected" }], sessionCount: 2, agentCount: 2, agentStates: [{ agentId: "copilot:scenario-uncertain:agent:main", state: "unknown" }, { agentId: "codex:offline:agent:offline", state: "unknown" }] }),
  galleryFrame("default-privacy-appearance", "privacy-appearance", "42", ["default-privacy-appearance"], { providers: [{ id: "Codex", availability: "connected" }], sessionCount: 2, agentCount: 2, preferences: { hiddenSessionTitles: ["codex:private-two"] } }),
  galleryFrame("default-coverage-feed", "coverage-feed", "42", ["default-coverage-feed"], { providers: [{ id: "Copilot", availability: "connected" }, { id: "Codex", availability: "stale" }], sessionCount: 2, agentCount: 2, agentStates: [{ agentId: "copilot:scenario-coverage:agent:main", state: "working" }, { agentId: "codex:orphan-container:agent:orphan-container", state: "unknown" }] }),
  ...[["coffee", "187"], ["tea", "195"], ["stretch", "199"], ["plant", "197"], ["tidy", "428"], ["reading", "198"], ["antics", "190"], ["chat", "192"]].map(([templateId, seed]) => galleryFrame(`solo-${templateId}`, "quiet-fiction", seed, ["solo-vignette", templateId], { sceneTemplateIds: [templateId], sceneKinds: ["vignette"], poses: [{ pose: "vignette" }] })),
  galleryFrame("cleanup-tidy", "quiet-fiction", "193", ["cleanup:tidy"], { sceneTemplateIds: ["tidy"], sceneKinds: ["cleanup"], poses: [{ pose: "cleanup" }] }),
  galleryFrame("group-vignette", "provider-combinations", "0", ["group-vignette", "reading"], { sceneTemplateIds: ["reading"], sceneKinds: ["vignette"], sceneParticipantCounts: { reading: 2 } }),
  ...[["off-duty-stroll", "195"], ["off-duty-plants", "198"], ["off-duty-window", "199"], ["off-duty-books", "191"]].map(([templateId, seed]) => galleryFrame(templateId, "ended-off-duty", seed, ["off-duty-vignette", templateId], { sceneTemplateIds: [templateId], sceneKinds: ["vignette"], sceneParticipantCounts: { [templateId]: 1 } })),
  ...[["chair-movement", "0"], ["ghost", "1"], ["spider", "2"], ["screen-flicker", "10"]].map(([kind, seed]) => galleryFrame(`quiet-${kind}`, "quiet-fiction", seed, [`quiet:${kind}`], { effectKinds: [`quiet:${kind}`] })),
  ...[["chair-movement", "0"], ["ghost", "1"], ["spider", "7"], ["screen-flicker", "4"]].map(([kind, seed]) => galleryFrame(`abandoned-${kind}`, "ended-off-duty", seed, [`abandoned:${kind}`], { effectKinds: [`abandoned:${kind}`] })),
  galleryFrame("dialogue-visible", "quiet-fiction", "0", ["dialogue-visible"], { dialogue: true }),
  galleryFrame("dialogue-disabled", "preferences-off", "42", ["dialogue-disabled"], { dialogue: false }),
  galleryFrame("working-pose", "copilot-working", "42", ["working-pose"], { poses: [{ agentId: "copilot:scenario-copilot-working:agent:main", pose: "focused" }] }),
  galleryFrame("approval-wait-pose", "attention-states", "42", ["approval-wait-pose"], { poses: [{ agentId: "codex:approval:agent:approval", pose: "attention" }] }),
  galleryFrame("input-wait-pose", "attention-states", "42", ["input-wait-pose"], { poses: [{ agentId: "codex:input:agent:input", pose: "wait" }] }),
  galleryFrame("failed-pose", "attention-states", "42", ["failed-pose"], { poses: [{ agentId: "codex:failed:agent:failed", pose: "issue" }] }),
  galleryFrame("unknown-pose", "preferences-off", "42", ["unknown-pose"], { poses: [{ agentId: "codex:quiet-unknown:agent:quiet-unknown", pose: "neutral" }] }),
  galleryFrame("idle-rest-pose", "preferences-off", "42", ["idle-rest-pose"], { poses: [{ agentId: "codex:quiet-controls:agent:quiet-controls", pose: "rest" }] }),
  galleryFrame("off-duty-vignette-pose", "ended-off-duty", "42", ["off-duty-vignette-pose"], { poses: [{ agentId: "copilot:scenario-ended:agent:main", pose: "vignette" }] }),
  galleryFrame("codex-turn-completed", "provider-combinations", "42", ["codex-turn-completed", "completion-pose"], { agentStates: [{ agentId: "codex:tests:agent:tests", state: "idle", lastTurnOutcome: "completed", ended: false }], poses: [{ agentId: "codex:tests:agent:tests", pose: "completion" }] }, undefined, NOW),
  galleryFrame("reduced-motion", "responsive-reduced", "42", ["reduced-motion"], { reducedMotion: true }),
  galleryFrame("wide-layout", "copilot-working", "42", ["wide-layout"], { viewport: "wide" }),
  galleryFrame("tablet-layout", "provider-combinations", "0", ["tablet-layout"], { viewport: "tablet" }),
  galleryFrame("narrow-layout", "responsive-reduced", "42", ["narrow-layout"], { viewport: "narrow" }),
  galleryFrame("desk-setup", "desk-setup", "42", ["desk-setup"], { sceneTemplateIds: ["desk-setup"], sceneKinds: ["desk-setup"], sceneParticipantCounts: { "desk-setup": 1 } }, "reuse-desk", NOW + 120001),
]);

/** @param {Partial<import("../../.github/extensions/pixel-agents-canvas/src/product-types.js").Preferences>} [overrides] */
function preferences(overrides = {}) {
  return { hideTitles: false, hiddenSessionTitles: {}, showEnded: true, vignettes: true, dialogue: true, appearances: {}, ...overrides };
}

/** @param {string} id @param {string} [seed] @returns {ScenarioFixture} */
export function buildScenarioFixture(id, seed = "42") {
  const scenario = definitions.find((item) => item.id === id);
  if (!scenario) throw new Error(`Unknown demo scenario: ${id}`);
  /** @type {ScenarioFixture} */
  const fixture = {
    id,
    title: scenario.title,
    providerUpdates: { Copilot: null, Codex: null },
    hostingSessionId: null,
    copilotEvents: [],
    codexThreads: [],
    codexTurns: [],
    codexObservedAt: NOW,
    now: NOW,
    steps: [],
    preferences: preferences(),
    viewport: scenario.viewport ?? "wide",
    reducedMotion: scenario.reducedMotion ?? false,
    seed,
    frames: SCENARIO_GALLERY_FRAMES.filter((frame) => frame.scenarioId === id),
  };
  /** @param {import("../../.github/extensions/pixel-agents-canvas/src/types.js").ProviderAvailability} availability @param {boolean} enabled @param {string} detail @param {number} [observedAt] @returns {ProviderUpdate} */
  const update = (availability, enabled, detail, observedAt = NOW) => ({ availability, enabled, detail, observedAt });
  /** @param {string} eventId @param {RawCopilotEvent["type"]} type @param {number} [at] @param {Record<string, unknown>} [data] @returns {RawCopilotEvent} */
  const event = (eventId, type, at = NOW, data = {}) => ({ id: eventId, type, timestamp: new Date(at).toISOString(), data });
  /** @param {string} threadId @param {string} title @param {CodexThreadFixture["status"]} [status] @param {Partial<CodexThreadFixture>} [options] @returns {CodexThreadFixture} */
  const thread = (threadId, title, status = { type: "active" }, options = {}) => ({ id: threadId, title, status, updatedAt: NOW, monitoring: "subscribed", ...options });
  const connectedCodex = update("connected", true, "Synthetic Codex metadata source connected.");
  switch (id) {
    case "source-health":
      fixture.providerUpdates = { Copilot: update("unsupported", false, "Synthetic unsupported source."), Codex: update("unavailable", false, "Synthetic unavailable source.") };
      break;
    case "copilot-empty":
      fixture.providerUpdates = { Copilot: update("empty", true, "Connected; no sessions were reported."), Codex: update("unsupported", false, "Unsupported in this mock host.") };
      break;
    case "codex-empty":
      fixture.providerUpdates = { Copilot: update("unavailable", false, "Copilot source is unavailable."), Codex: update("empty", true, "Connected; no sessions were reported.") };
      break;
    case "empty-session":
      fixture.providerUpdates.Codex = connectedCodex;
      fixture.codexThreads = [thread("empty-codex", "Review API coverage", { type: "active" }, { monitoring: "unavailable" })];
      break;
    case "copilot-working":
      fixture.hostingSessionId = "scenario-copilot-working";
      fixture.copilotEvents = [event("working", "assistant.turn_start")];
      break;
    case "provider-combinations":
      fixture.hostingSessionId = "scenario-provider-combinations";
      fixture.copilotEvents = [event("copilot-work", "assistant.turn_start"), event("copilot-child", "subagent.started", NOW, { toolCallId: "writer", agentName: "Documentation agent", agentType: "task" })];
      fixture.providerUpdates.Codex = connectedCodex;
      fixture.codexThreads = [thread("review", "Review frontend accessibility", { type: "active", activeFlags: ["waitingOnApproval"] }), thread("reviewer", "Review frontend accessibility", { type: "active" }, { parentThreadId: "review", agentRole: "reviewer" }), thread("tests", "Test keyboard navigation", { type: "idle" }), thread("docs", "Document browser behavior", { type: "idle" })];
      fixture.codexTurns = [{ threadId: "tests", turnId: null, outcome: "completed", at: NOW }];
      break;
    case "attention-states":
      fixture.providerUpdates.Codex = connectedCodex;
      fixture.codexThreads = [thread("approval", "Fix failing tests", { type: "active", activeFlags: ["waitingOnApproval"] }), thread("input", "Fix failing tests", { type: "active", activeFlags: ["waitingOnUserInput"] }), thread("failed", "Fix failing tests", { type: "systemError" })];
      break;
    case "uncertain-agents":
      fixture.providerUpdates = { Copilot: update("stale", true, "Last complete source observation is stale.", NOW - 180000), Codex: update("disconnected", false, "Synthetic local process is disconnected.") };
      fixture.hostingSessionId = "scenario-uncertain";
      fixture.copilotEvents = [event("old-work", "assistant.turn_start", NOW - 180000)];
      fixture.providerUpdates.Codex = update("disconnected", false, "Synthetic local process is disconnected.");
      fixture.codexThreads = [thread("offline", "Inspect disconnected source", { type: "active" }, { monitoring: "unavailable" })];
      fixture.codexObservedAt = NOW - 180000;
      break;
    case "ended-off-duty":
      fixture.hostingSessionId = "scenario-ended";
      fixture.copilotEvents = [event("shutdown", "session.shutdown")];
      break;
    case "privacy-appearance":
      fixture.providerUpdates.Codex = connectedCodex;
      fixture.codexThreads = [thread("private-one", "Security review for customer-token-redaction", { type: "active" }), thread("private-two", "Design the accessibility guide", { type: "idle" })];
      fixture.preferences = preferences({ hiddenSessionTitles: { "codex:private-two": true }, appearances: { "codex:private-one:agent:private-one": { nickname: "Local alias", palette: "#b87857", outfit: "vest", accessory: "glasses", deskProp: "plant" } } });
      break;
    case "coverage-feed":
      fixture.hostingSessionId = "scenario-coverage";
      fixture.copilotEvents = [event("generic-update", "assistant.turn_start")];
      fixture.providerUpdates.Codex = update("stale", true, "Metadata refresh is delayed.", NOW - 90000);
      fixture.codexThreads = [thread("orphan-container", "Session without monitored subscription", { type: "active" }, { monitoring: "unavailable" })];
      fixture.codexObservedAt = NOW - 90000;
      break;
    case "quiet-fiction":
      fixture.hostingSessionId = "scenario-quiet";
      fixture.copilotEvents = [event("idle", "session.idle")];
      fixture.providerUpdates.Codex = connectedCodex;
      fixture.codexThreads = [thread("quiet-unknown", "Investigate unknown agent", { type: "active" }, { monitoring: "unavailable" })];
      break;
    case "preferences-off":
      fixture.providerUpdates.Codex = connectedCodex;
      fixture.codexThreads = [thread("quiet-controls", "Review reduced motion", { type: "idle" }), thread("quiet-unknown", "Unknown status", { type: "active" }, { monitoring: "unavailable" })];
      fixture.preferences = preferences({ showEnded: false, vignettes: false, dialogue: false });
      break;
    case "responsive-reduced":
      fixture.hostingSessionId = "scenario-responsive";
      fixture.copilotEvents = [event("working", "assistant.turn_start")];
      fixture.providerUpdates.Codex = connectedCodex;
      fixture.codexThreads = [thread("narrow-waiting", "Test keyboard navigation", { type: "active", activeFlags: ["waitingOnUserInput"] })];
      fixture.preferences = preferences({ dialogue: false });
      break;
    case "desk-setup": {
      /** @param {string} stepId @param {number} atMs @param {string} sessionId @param {RawCopilotEvent[]} copilotEvents @param {number} [advanceTo] @returns {ScenarioStep} */
      const step = (stepId, atMs, sessionId, copilotEvents, advanceTo) => ({ id: stepId, atMs, hostingSessionId: sessionId, copilotEvents, ...(advanceTo === undefined ? {} : { advanceTo, tickIntervalMs: 1000 }) });
      const firstSession = "desk-setup-before";
      fixture.steps = [
        step("create-prop", NOW, firstSession, [event("desk-idle", "session.idle")], NOW + 120000),
        step("close-session", NOW + 120000, firstSession, [event("desk-close", "session.shutdown", NOW + 120000)]),
        step("reuse-desk", NOW + 120001, "desk-setup-after", [event("desk-return", "session.idle", NOW + 120001)]),
      ];
      break;
    }
  }
  return structuredClone(fixture);
}

/** @returns {readonly (Pick<Scenario, "id"|"title"|"description"|"covers"|"viewport"|"reducedMotion"> & {frames: typeof SCENARIO_GALLERY_FRAMES})[]} */
export function listScenarios() {
  return definitions.map(({ id, title, description, covers, viewport, reducedMotion }) => ({ id, title, description, covers, viewport, reducedMotion, frames: SCENARIO_GALLERY_FRAMES.filter((frame) => frame.scenarioId === id) }));
}

/** @param {ScenarioStateInput} input @returns {import("../../.github/extensions/pixel-agents-canvas/src/product-types.js").OfficeSnapshot} */
function buildScenarioSnapshot(input) {
  const state = createOfficeState({ clock: () => input.now });
  if (input.hostingSessionId) state.bindHostingSession(input.hostingSessionId);
  for (const provider of ["Copilot", "Codex"]) {
    const update = input.providerUpdates[provider];
    if (update) state.setProvider(provider, update);
  }
  for (const event of input.copilotEvents) state.copilotEvent(event);
  if (input.codexThreads.length) state.applyCodex(input.codexThreads, input.codexObservedAt);
  for (const turn of input.codexTurns) state.codexTurn(turn);
  return state.snapshot();
}

/** @param {string} id @param {string} [seed] @param {number} [atMs] @returns {import("../../.github/extensions/pixel-agents-canvas/src/product-types.js").OfficePageState} */
export function buildScenarioState(id, seed = "42", atMs = NOW + 90000) {
  const fixture = buildScenarioFixture(id, seed);
  if (!fixture.steps.length) {
    const snapshot = buildScenarioSnapshot(fixture);
    return { snapshot, preferences: fixture.preferences, world: buildScenarioWorld(snapshot, fixture.preferences, id, seed, atMs) };
  }
  let now = fixture.now;
  let snapshot = buildScenarioSnapshot(fixture);
  const world = createOfficeWorld({ clock: () => now, random: seededRandom(hashSeed(`${seed}:${id}`)) });
  for (const step of fixture.steps) {
    now = step.atMs;
    const input = {
      now,
      providerUpdates: { Copilot: step.providerUpdates?.Copilot ?? null, Codex: step.providerUpdates?.Codex ?? null },
      hostingSessionId: step.hostingSessionId ?? null,
      copilotEvents: step.copilotEvents ?? [],
      codexThreads: step.codexThreads ?? [],
      codexTurns: step.codexTurns ?? [],
      codexObservedAt: step.codexObservedAt ?? now,
    };
    snapshot = buildScenarioSnapshot(input);
    world.update(snapshot, fixture.preferences);
    if (step.advanceTo !== undefined) {
      while (now < step.advanceTo) {
        now = Math.min(now + step.tickIntervalMs, step.advanceTo);
        world.tick();
      }
    }
  }
  return { snapshot, preferences: fixture.preferences, world: world.view() };
}

/** @param {import("../../.github/extensions/pixel-agents-canvas/src/product-types.js").OfficeSnapshot} snapshot @param {import("../../.github/extensions/pixel-agents-canvas/src/product-types.js").Preferences} preferences @param {string} id @param {string} [seed] @param {number} [atMs] */
export function buildScenarioWorld(snapshot, preferences, id, seed = "42", atMs = NOW + 90000) {
  let now = NOW;
  const world = createOfficeWorld({ clock: () => now, random: seededRandom(hashSeed(`${seed}:${id}`)) });
  world.update(snapshot, preferences);
  while (now < atMs) {
    now = Math.min(now + 30000, atMs);
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
