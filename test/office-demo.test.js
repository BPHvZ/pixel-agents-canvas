import test from "node:test";
import assert from "node:assert/strict";
import { createOfficeState } from "../.github/extensions/pixel-agents-canvas/src/office-state.js";
import { parseOfficeState } from "../.github/extensions/pixel-agents-canvas/src/office-client.js";
import { buildScenarioFixture, buildScenarioState, listScenarios, scenarioOrderForSeed, SCENARIO_COVERAGE, SCENARIO_GALLERY_FRAMES, SCENARIO_LIMITATIONS } from "../dev/office-demo/scenarios.js";

function runScenarioInputThroughProductionState(input) {
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

function runScenarioThroughProductionState(fixture) {
  const step = fixture.steps.at(-1);
  if (!step) return runScenarioInputThroughProductionState(fixture);
  return runScenarioInputThroughProductionState({
    now: step.atMs,
    providerUpdates: { Copilot: step.providerUpdates?.Copilot ?? null, Codex: step.providerUpdates?.Codex ?? null },
    hostingSessionId: step.hostingSessionId ?? null,
    copilotEvents: step.copilotEvents ?? [],
    codexThreads: step.codexThreads ?? [],
    codexTurns: step.codexTurns ?? [],
    codexObservedAt: step.codexObservedAt ?? step.atMs,
  });
}

test("every catalog scenario passes through the production office-state factory", () => {
  const scenarios = listScenarios();
  assert.ok(scenarios.length >= 12);
  assert.equal(new Set(scenarios.map((scenario) => scenario.id)).size, scenarios.length);
  assert.deepEqual(scenarios.map((scenario) => scenario.id), [
    "no-observation", "source-health", "copilot-empty", "codex-empty", "empty-session", "copilot-working", "provider-combinations",
    "attention-states", "uncertain-agents", "ended-off-duty", "privacy-appearance", "coverage-feed", "quiet-fiction", "preferences-off", "responsive-reduced", "desk-setup",
  ]);
  const covered = new Set([...scenarios.flatMap((scenario) => scenario.covers), ...SCENARIO_GALLERY_FRAMES.flatMap((frame) => frame.covers), ...SCENARIO_LIMITATIONS.map((item) => item.id)]);
  assert.deepEqual(SCENARIO_COVERAGE.filter((item) => !covered.has(item)), []);
  for (const scenario of scenarios) {
    assert.ok(scenario.title.length > 0);
    assert.ok(scenario.description.length > 0);
    assert.ok(scenario.covers.length > 0);
    assert.ok(scenario.frames.length > 0, `scenario ${scenario.id} has no named capture frame`);
    if (scenario.viewport) assert.ok(["wide", "tablet", "narrow"].includes(scenario.viewport));
    const fixture = buildScenarioFixture(scenario.id, "catalog-test");
    assert.equal("snapshot" in fixture, false);
    assert.equal("world" in fixture, false);
    const snapshot = runScenarioThroughProductionState(fixture);
    const built = buildScenarioState(scenario.id, "catalog-test");
    assert.deepEqual(built.snapshot, snapshot, `scenario bypassed createOfficeState: ${scenario.id}`);
    const parsed = parseOfficeState(built);
    assert.equal(parsed.world?.fictionLabel, "Office fiction — not provider activity or collaboration");
  }
});

test("scenario source inputs are deterministic and catalog coverage inventory has no gaps", () => {
  for (const scenario of listScenarios()) {
    assert.deepEqual(buildScenarioFixture(scenario.id), buildScenarioFixture(scenario.id));
    assert.deepEqual(buildScenarioState(scenario.id), buildScenarioState(scenario.id));
    assert.equal(new Set(scenario.covers).size, scenario.covers.length, `${scenario.id} repeats a coverage label`);
    const fixture = buildScenarioFixture(scenario.id);
    const inputs = fixture.steps.length ? fixture.steps : [fixture];
    for (const input of inputs) {
      const atMs = "atMs" in input ? input.atMs : input.now;
      for (const event of input.copilotEvents ?? []) assert.ok(Date.parse(event.timestamp) <= atMs, `${scenario.id} has a future Copilot event`);
      for (const turn of input.codexTurns ?? []) assert.ok(turn.at <= atMs, `${scenario.id} has a future Codex turn`);
      if ("advanceTo" in input && input.advanceTo !== undefined) assert.ok(input.tickIntervalMs > 0, `${scenario.id} must define a positive tick interval`);
    }
  }
  assert.equal(new Set(SCENARIO_COVERAGE).size, SCENARIO_COVERAGE.length);
});

test("desk setup replays source stages through fresh production states while preserving the presentation world", () => {
  const fixture = buildScenarioFixture("desk-setup", "42");
  assert.deepEqual(fixture.steps.map((step) => step.id), ["create-prop", "close-session", "reuse-desk"]);
  const snapshots = fixture.steps.map((step) => runScenarioInputThroughProductionState({
    now: step.atMs,
    providerUpdates: { Copilot: step.providerUpdates?.Copilot ?? null, Codex: step.providerUpdates?.Codex ?? null },
    hostingSessionId: step.hostingSessionId ?? null,
    copilotEvents: step.copilotEvents ?? [],
    codexThreads: step.codexThreads ?? [],
    codexTurns: step.codexTurns ?? [],
    codexObservedAt: step.codexObservedAt ?? step.atMs,
  }));
  assert.equal(snapshots[0]?.agents[0]?.state, "idle");
  assert.equal(snapshots[1]?.sessions[0]?.closed, true);
  assert.equal(snapshots[1]?.agents[0]?.ended, true);
  assert.equal(snapshots[2]?.sessions[0]?.sourceId, "desk-setup-after");
  const world = buildScenarioState("desk-setup", "42").world;
  const setupScene = world?.scenes.find((scene) => scene.kind === "desk-setup");
  assert.ok(setupScene);
  assert.ok(setupScene && world?.props.some((prop) => prop.cleanupSceneId === setupScene.id));
});

test("named gallery frames meet their machine-readable production-world targets", () => {
  for (const frame of SCENARIO_GALLERY_FRAMES) {
    const fixture = buildScenarioFixture(frame.scenarioId, frame.seed);
    const state = buildScenarioState(frame.scenarioId, frame.seed, frame.atMs);
    const expected = frame.expected;
    assert.ok(frame.covers.length > 0, frame.id);
    if (frame.afterStepId) assert.ok(fixture.steps.some((step) => step.id === frame.afterStepId), frame.id);
    for (const templateId of expected.sceneTemplateIds ?? []) {
      const scene = state.world?.scenes.find((item) => item.templateId === templateId);
      assert.ok(scene, frame.id);
      if (scene && expected.sceneKinds) assert.ok(expected.sceneKinds.includes(scene.kind), frame.id);
      const expectedParticipants = expected.sceneParticipantCounts?.[templateId];
      if (scene && expectedParticipants !== undefined) assert.equal(scene.participants.length, expectedParticipants, frame.id);
    }
    for (const effect of expected.effectKinds ?? []) {
      const [family, kind] = effect.split(":");
      const effects = family === "quiet" ? state.world?.quietEffects : state.world?.abandonedEffects;
      assert.ok(effects?.some((item) => item.kind === kind), frame.id);
    }
    for (const pose of expected.poses ?? []) assert.ok(state.world?.characters.some((character) => character.pose === pose.pose && (!pose.agentId || character.agentId === pose.agentId)), frame.id);
    for (const agentState of expected.agentStates ?? []) {
      const agent = state.snapshot.agents.find((item) => !agentState.agentId || item.id === agentState.agentId);
      assert.equal(agent?.state, agentState.state, frame.id);
      if (agentState.lastTurnOutcome) assert.equal(agent?.lastTurnOutcome, agentState.lastTurnOutcome, frame.id);
      if (agentState.ended !== undefined) assert.equal(agent?.ended, agentState.ended, frame.id);
    }
    for (const provider of expected.providers ?? []) assert.equal(state.snapshot.providers.find((item) => item.id === provider.id)?.availability, provider.availability, frame.id);
    if (expected.sessionCount !== undefined) assert.equal(state.snapshot.sessions.length, expected.sessionCount, frame.id);
    if (expected.agentCount !== undefined) assert.equal(state.snapshot.agents.length, expected.agentCount, frame.id);
    if (expected.feedCount !== undefined) assert.equal(state.snapshot.feed.length, expected.feedCount, frame.id);
    for (const sessionId of expected.preferences?.hiddenSessionTitles ?? []) assert.equal(state.preferences.hiddenSessionTitles[sessionId], true, frame.id);
    if (expected.dialogue !== undefined) assert.equal((state.world?.dialogue.length ?? 0) > 0, expected.dialogue, frame.id);
    if (expected.viewport) assert.equal(fixture.viewport, expected.viewport, frame.id);
    if (expected.reducedMotion !== undefined) assert.equal(fixture.reducedMotion, expected.reducedMotion, frame.id);
  }
  assert.deepEqual(SCENARIO_LIMITATIONS, []);
});

test("seeded random scenario ordering is reproducible and seed-sensitive", () => {
  const first = scenarioOrderForSeed("review-42");
  assert.deepEqual(scenarioOrderForSeed("review-42"), first);
  assert.equal(new Set(first).size, listScenarios().length);
  assert.notDeepEqual(scenarioOrderForSeed("review-43"), first);
});

test("scenarios include provider, factual state, privacy, feed, fiction, and responsive examples", () => {
  const scenarios = listScenarios();
  const covers = new Set(scenarios.flatMap((scenario) => scenario.covers));
  for (const label of ["both providers", "working", "waiting", "idle", "unknown state", "stale freshness", "disconnected agent", "explicit end", "hidden titles", "coverage matrix", "activity feed", "fiction label", "390 px viewport", "reduced motion"]) {
    assert.ok(covers.has(label), `missing scenario coverage: ${label}`);
  }
});
