/* global document, HTMLButtonElement, MutationObserver, window */

import { buildScenarioWorld } from "./scenarios.js";

const stateElement = document.getElementById("office-state");
if (!stateElement) throw new Error("The mock office state is missing.");
let mockState = JSON.parse(stateElement.textContent || "null");
const parameters = new URL(import.meta.url).searchParams;
const scenarioId = parameters.get("scenario") || "no-observation";
const seed = parameters.get("seed") || "42";

/** @param {unknown} payload @returns {Response} */
function jsonResponse(payload) {
  return new Response(JSON.stringify(payload), { headers: { "Content-Type": "application/json" } });
}

globalThis.fetch = async (input, options = {}) => {
  const url = typeof input === "string" ? input : input.url;
  const path = new URL(url, document.baseURI).pathname;
  if (path === "/state" && (!options.method || options.method === "GET")) return jsonResponse(mockState);
  if (path === "/preferences" && options.method === "POST") {
    const patch = JSON.parse(typeof options.body === "string" ? options.body : "{}");
    const nextPreferences = {
      ...mockState.preferences,
      ...patch,
      hiddenSessionTitles: { ...mockState.preferences.hiddenSessionTitles, ...patch.hiddenSessionTitles },
      appearances: { ...mockState.preferences.appearances, ...patch.appearances },
    };
    mockState = {
      ...mockState,
      preferences: nextPreferences,
      world: buildScenarioWorld(mockState.snapshot, nextPreferences, scenarioId, seed),
    };
    return jsonResponse(mockState.preferences);
  }
  throw new TypeError("Mock-only demo blocked a non-fixture request.");
};

const labels = new Map([
  ["refresh", "Refresh disabled in demo"],
  ["codex", "Provider action disabled in demo"],
]);
const buttons = [...labels].map(([id, label]) => [document.getElementById(id), label]).filter(([button]) => button instanceof HTMLButtonElement);
function lockProviderButtons() {
  for (const [button, label] of buttons) {
    if (!(button instanceof HTMLButtonElement) || typeof label !== "string") continue;
    if (!button.disabled) button.disabled = true;
    if (button.textContent !== label) button.textContent = label;
    if (button.title !== "Provider actions are unavailable in this mock-data demo.") button.title = "Provider actions are unavailable in this mock-data demo.";
    if (button.getAttribute("aria-label") !== label) button.setAttribute("aria-label", label);
  }
}
lockProviderButtons();
const buttonObserver = new MutationObserver(lockProviderButtons);
for (const [button] of buttons) if (button instanceof HTMLButtonElement) buttonObserver.observe(button, { childList: true, subtree: true });

window.addEventListener("message", (event) => {
  if (event.data?.type === "office-demo-motion") document.documentElement.classList.toggle("demo-reduced-motion", event.data.enabled === true);
});
