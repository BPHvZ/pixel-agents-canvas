// @ts-check
import { createOfficeState } from "./production-src/office-state.js";

/** @typedef {import("./scenario-types.js").ScenarioFixture} ScenarioFixture */
/** @typedef {import("./scenario-types.js").ScenarioStep} ScenarioStep */
/** @typedef {import("./scenario-types.js").ScenarioProviderUpdate} ScenarioProviderUpdate */
/** @typedef {import("./production-src/types.js").CodexTurnEvent} CodexTurnEvent */
/** @typedef {Partial<Record<"Copilot"|"Codex", ScenarioProviderUpdate|null>>} ProviderUpdates */
/** @typedef {{now:number,providerUpdates:ProviderUpdates,hostingSessionId?:string|null,copilotEvents:readonly unknown[],codexThreads:readonly unknown[],codexTurns:readonly CodexTurnEvent[],codexObservedAt:number}} OfficeStateInput */

/** @param {OfficeStateInput} input */
function createSnapshot(input) {
  const state = createOfficeState({ clock: () => input.now });
  if (input.hostingSessionId) state.bindHostingSession(input.hostingSessionId);
  if (input.providerUpdates.Copilot) state.setProvider("Copilot", input.providerUpdates.Copilot);
  if (input.providerUpdates.Codex) state.setProvider("Codex", input.providerUpdates.Codex);
  for (const event of input.copilotEvents) state.copilotEvent(event);
  state.applyCodex([...input.codexThreads], input.codexObservedAt);
  for (const event of input.codexTurns) state.codexTurn(event);
  return state.snapshot();
}

/** @param {ScenarioFixture} fixture */
export function createScenarioRuntime(fixture) {
  let currentSnapshot = createSnapshot(fixture);
  return {
    /** @param {ScenarioStep} step */
    applyStep: (step) => {
      currentSnapshot = createSnapshot({
        now: step.atMs,
        providerUpdates: step.providerUpdates ?? {},
        hostingSessionId: step.hostingSessionId,
        copilotEvents: step.copilotEvents ?? [],
        codexThreads: step.codexThreads ?? [],
        codexTurns: step.codexTurns ?? [],
        codexObservedAt: step.codexObservedAt ?? step.atMs,
      });
      return currentSnapshot;
    },
    controller: {
      bindHostingSession: () => {},
      copilotEvent: () => {},
      snapshot: () => structuredClone(currentSnapshot),
      enableCodex: async () => {},
      disableCodex: async () => {},
      refreshCodex: async () => {},
      stop: async () => {},
    },
  };
}

