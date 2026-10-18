import test from "node:test";
import assert from "node:assert/strict";
import { parseOfficeState } from "../.github/extensions/pixel-agents-canvas/src/office-client.js";
import { buildScenarioState, listScenarios, scenarioOrderForSeed } from "../dev/office-demo/scenarios.js";

test("every named demo scenario is a valid production office state and has visible coverage labels", () => {
  const scenarios = listScenarios();
  assert.ok(scenarios.length >= 12);
  assert.equal(new Set(scenarios.map((scenario) => scenario.id)).size, scenarios.length);
  for (const scenario of scenarios) {
    assert.ok(scenario.title.length > 0);
    assert.ok(scenario.description.length > 0);
    assert.ok(scenario.covers.length > 0);
    const parsed = parseOfficeState(buildScenarioState(scenario.id));
    assert.equal(parsed.world?.fictionLabel, "Office fiction — not provider activity or collaboration");
  }
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
