/* global document, Element, HTMLButtonElement, location, window */

import { renderHtml } from "./production-src/renderer.js";
import { buildScenarioState, listScenarios, scenarioOrderForSeed } from "./scenarios.js";

const $ = (id) => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing demo element: ${id}`);
  return element;
};

const scenarios = listScenarios();
const scenarioSelect = /** @type {HTMLSelectElement} */ ($("scenario-select"));
const scenarioList = $("scenario-list");
const frame = /** @type {HTMLIFrameElement} */ ($("office-preview"));
const playerStatus = $("player-status");
const viewport = /** @type {HTMLSelectElement} */ ($("viewport"));
const reducedMotion = /** @type {HTMLInputElement} */ ($("reduced-motion"));
const seedInput = /** @type {HTMLInputElement} */ ($("seed"));
let currentIndex = 0;
let order = scenarios.map((scenario) => scenario.id);
/** @type {ReturnType<typeof setInterval>|null} */
let playback = null;

for (const scenario of scenarios) {
  const option = document.createElement("option");
  option.value = scenario.id;
  option.textContent = scenario.title;
  scenarioSelect.append(option);
  const item = document.createElement("li");
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.scenario = scenario.id;
  button.setAttribute("aria-pressed", "false");
  const title = document.createElement("span");
  title.className = "scenario-name";
  title.textContent = scenario.title;
  const covers = document.createElement("span");
  covers.className = "scenario-covers";
  covers.textContent = scenario.covers.join(" · ");
  button.append(title, covers);
  item.append(button);
  scenarioList.append(item);
}

/** Inject only local production modules and an in-memory mock transport. */
function renderScenario(index) {
  const scenario = scenarios[index];
  if (!scenario) return;
  currentIndex = index;
  scenarioSelect.value = scenario.id;
  $("current-scenario").textContent = scenario.title;
  for (const button of scenarioList.querySelectorAll("button[data-scenario]")) {
    button.setAttribute("aria-pressed", button.dataset.scenario === scenario.id ? "true" : "false");
  }
  if (scenario.viewport) viewport.value = scenario.viewport;
  if (typeof scenario.reducedMotion === "boolean") reducedMotion.checked = scenario.reducedMotion;
  frame.dataset.width = viewport.value;
  playerStatus.textContent = `${scenario.title}: ${scenario.description}`;

  const state = buildScenarioState(scenario.id, seedInput.value || "42");
  const bridgeUrl = new URL("./bridge.js", import.meta.url);
  bridgeUrl.searchParams.set("scenario", scenario.id);
  bridgeUrl.searchParams.set("seed", seedInput.value || "42");
  const html = renderHtml({ instanceId: "developer-mock-demo", state })
    .replace('href="/office.css"', `href="${new URL("./production-src/office.css", import.meta.url).href}"`)
    .replace('<button id="refresh" type="button">↻ Refresh</button>', '<button id="refresh" type="button" disabled title="Provider actions are disabled in this demo">↻ Refresh · mock only</button>')
    .replace('<button id="codex" type="button">Enable local Codex</button>', '<button id="codex" type="button" disabled title="Provider actions are disabled in this demo">Codex provider action disabled</button>')
    .replace('<script type="module" src="/office-client.js"></script>', `<script type="module" src="${bridgeUrl.href}"></script><script type="module" src="${new URL("./production-src/office-client.js", import.meta.url).href}"></script>`)
    .replace("<head>", `<head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'none'; img-src data:"><link rel="stylesheet" href="${new URL("./iframe.css", import.meta.url).href}">`)
    .replace('<header class="topbar">', '<div class="demo-mock-banner" role="note">DEMO · SYNTHETIC MOCK DATA · No live provider or host activity</div><header class="topbar">');
frame.addEventListener("load", () => frame.contentWindow?.postMessage({ type: "office-demo-motion", enabled: reducedMotion.checked }, location.origin), { once: true });
frame.srcdoc = html;
}

function nextScenario() {
  const currentId = scenarios[currentIndex]?.id;
  const position = order.indexOf(currentId ?? "");
  const nextId = order[(position + 1 + order.length) % order.length];
  const nextIndex = scenarios.findIndex((scenario) => scenario.id === nextId);
  renderScenario(nextIndex >= 0 ? nextIndex : 0);
}

function stopPlayback() {
  if (playback !== null) clearInterval(playback);
  playback = null;
  $("play").removeAttribute("aria-pressed");
  $("stop").setAttribute("disabled", "");
}

function startPlayback(shuffle = false) {
  stopPlayback();
  order = shuffle ? scenarioOrderForSeed(seedInput.value || "42") : scenarios.map((scenario) => scenario.id);
  const first = order[0];
  const index = scenarios.findIndex((scenario) => scenario.id === first);
  if (index >= 0) renderScenario(index);
  playback = setInterval(nextScenario, 3500);
  $("play").setAttribute("aria-pressed", "true");
  $("stop").removeAttribute("disabled");
  if (shuffle) playerStatus.textContent += ` Seeded order: ${seedInput.value || "42"}.`;
}

scenarioSelect.addEventListener("change", () => {
  stopPlayback();
  const index = scenarios.findIndex((scenario) => scenario.id === scenarioSelect.value);
  if (index >= 0) renderScenario(index);
});
scenarioList.addEventListener("click", (event) => {
  if (!(event.target instanceof Element)) return;
  const button = event.target.closest("button[data-scenario]");
  if (!(button instanceof HTMLButtonElement)) return;
  stopPlayback();
  const index = scenarios.findIndex((scenario) => scenario.id === button.dataset.scenario);
  if (index >= 0) renderScenario(index);
});
$("next").addEventListener("click", nextScenario);
$("play").addEventListener("click", () => startPlayback());
$("random").addEventListener("click", () => startPlayback(true));
$("stop").addEventListener("click", stopPlayback);
viewport.addEventListener("change", () => { frame.dataset.width = viewport.value; });
reducedMotion.addEventListener("change", () => frame.contentWindow?.postMessage({ type: "office-demo-motion", enabled: reducedMotion.checked }, location.origin));
window.matchMedia("(prefers-reduced-motion: reduce)").addEventListener("change", (event) => {
  if (!reducedMotion.checked) frame.contentWindow?.postMessage({ type: "office-demo-motion", enabled: event.matches }, location.origin);
});
renderScenario(0);
