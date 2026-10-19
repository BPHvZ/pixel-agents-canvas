/* global document, HTMLButtonElement, HTMLAnchorElement, Element, history, location, window */

const $ = (id) => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing demo element: ${id}`);
  return element;
};
const select = /** @type {HTMLSelectElement} */ ($("scenario-select"));
const frameSelect = /** @type {HTMLSelectElement} */ ($("frame-select"));
const list = $("scenario-list");
const frameList = $("frame-list");
const frame = /** @type {HTMLIFrameElement} */ ($("office-preview"));
const framePrevious = /** @type {HTMLButtonElement} */ ($("frame-previous"));
const frameNext = /** @type {HTMLButtonElement} */ ($("frame-next"));
const playFrames = /** @type {HTMLButtonElement} */ ($("play-frames"));
const viewport = /** @type {HTMLSelectElement} */ ($("viewport"));
let scenarios = [];
let selected = 0;
let playbackToken = 0;
const frameDelayMs = 1500;

function stopPlayback() {
  playbackToken += 1;
  playFrames.textContent = "Play frames";
  playFrames.setAttribute("aria-pressed", "false");
}

function updateFrameNavigation(scenario, frameIndex) {
  const hasFrames = scenario.frames.length > 0;
  framePrevious.disabled = !hasFrames || frameIndex <= 0;
  frameNext.disabled = !hasFrames || frameIndex >= scenario.frames.length - 1;
  playFrames.disabled = scenario.frames.length < 2;
  frameList.replaceChildren();
  scenario.frames.forEach((namedFrame, index) => {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.frame = namedFrame.id;
    button.textContent = `${index + 1}. ${namedFrame.id} · ${namedFrame.covers.join(" / ")}`;
    if (index === frameIndex) {
      button.setAttribute("aria-current", "step");
    }
    item.append(button);
    frameList.append(item);
  });
}

async function loadScenarios() {
  const response = await fetch("/api/scenarios");
  if (!response.ok) throw new Error("Scenario catalog unavailable");
  scenarios = await response.json();
  for (const scenario of scenarios) {
    const option = document.createElement("option");
    option.value = scenario.id;
    option.textContent = scenario.title;
    select.append(option);
    const item = document.createElement("li");
    const link = document.createElement("a");
    const firstFrame = scenario.frames[0];
    link.href = firstFrame
      ? `/?scenario=${encodeURIComponent(scenario.id)}&frame=${encodeURIComponent(firstFrame.id)}`
      : `/?scenario=${encodeURIComponent(scenario.id)}`;
    link.dataset.scenario = scenario.id;
    const title = document.createElement("span");
    title.className = "scenario-name";
    title.textContent = scenario.title;
    const coverage = document.createElement("span");
    coverage.className = "scenario-covers";
    coverage.textContent = scenario.covers.join(" · ");
    link.append(title, coverage);
    item.append(link);
    list.append(item);
  }
  const parameters = new URL(location.href).searchParams;
  const requested = parameters.get("scenario");
  const initial = scenarios.findIndex((scenario) => scenario.id === requested);
  await showScenario(initial >= 0 ? initial : 0, parameters.get("frame") ?? undefined);
}

async function showScenario(index, frameId) {
  const scenario = scenarios[index];
  if (!scenario) return;
  selected = index;
  select.value = scenario.id;
  frameSelect.replaceChildren();
  if (scenario.frames.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "Default scenario state";
    frameSelect.append(option);
  } else {
    for (const frame of scenario.frames) {
      const option = document.createElement("option");
      option.value = frame.id;
      option.textContent = `${frame.id} · ${frame.atMs} ms · ${frame.covers.join(" / ")}`;
      frameSelect.append(option);
    }
  }
  const namedFrame = scenario.frames.find((entry) => entry.id === frameId) ?? scenario.frames[0];
  const frameIndex = namedFrame ? scenario.frames.indexOf(namedFrame) : -1;
  frameSelect.value = namedFrame?.id ?? "";
  updateFrameNavigation(scenario, frameIndex);
  $("current-scenario").textContent = `${scenario.id} · ${scenario.title}${namedFrame ? ` · ${namedFrame.id}` : " · default state"}`;
  for (const link of list.querySelectorAll("a[data-scenario]")) {
    if (link instanceof Element) link.setAttribute("aria-current", link.dataset.scenario === scenario.id ? "page" : "false");
  }
  const targetViewport = namedFrame?.expected.viewport ?? scenario.viewport;
  const requestedWidth = targetViewport === "narrow" ? "390" : targetViewport === "tablet" ? "820" : targetViewport === "wide" ? "1100" : viewport.value;
  viewport.value = requestedWidth;
  frame.style.width = `${requestedWidth}px`;
  const previewUrl = new URL(location.href);
  const parameters = new URLSearchParams({ scenario: scenario.id });
  if (namedFrame) parameters.set("frame", namedFrame.id);
  previewUrl.search = parameters.toString();
  history.replaceState(null, "", previewUrl);
  const response = await fetch("/api/preview", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: scenario.id, frameId: namedFrame?.id ?? "" }),
  });
  if (!response.ok) throw new Error("Could not start local preview");
  const preview = await response.json();
  frame.src = preview.url;
  $("open-preview").href = preview.url;
  $("copy-url").dataset.url = previewUrl.href;
  $("player-status").textContent = namedFrame
    ? `${scenario.title}: ${scenario.description} · frame ${namedFrame.id} at ${namedFrame.atMs} ms · covers ${namedFrame.covers.join("; ")}`
    : `${scenario.title}: ${scenario.description} · default scenario state`;
  if (namedFrame?.expected.reducedMotion ?? scenario.reducedMotion) $("player-status").textContent += " Reduced motion is active for this named frame.";
}

select.addEventListener("change", () => { stopPlayback(); void showScenario(scenarios.findIndex((scenario) => scenario.id === select.value)); });
frameSelect.addEventListener("change", () => { stopPlayback(); void showScenario(selected, frameSelect.value); });
framePrevious.addEventListener("click", () => {
  stopPlayback();
  const scenario = scenarios[selected];
  const index = scenario?.frames.findIndex((entry) => entry.id === frameSelect.value) ?? 0;
  if (index > 0) void showScenario(selected, scenario.frames[index - 1].id);
});
frameNext.addEventListener("click", () => {
  stopPlayback();
  const scenario = scenarios[selected];
  const index = scenario?.frames.findIndex((entry) => entry.id === frameSelect.value) ?? -1;
  if (scenario && index < scenario.frames.length - 1) void showScenario(selected, scenario.frames[index + 1].id);
});
frameList.addEventListener("click", (event) => {
  if (!(event.target instanceof Element)) return;
  const button = event.target.closest("button[data-frame]");
  if (!(button instanceof HTMLButtonElement)) return;
  stopPlayback();
  void showScenario(selected, button.dataset.frame);
});
playFrames.addEventListener("click", () => {
  if (playFrames.getAttribute("aria-pressed") === "true") {
    stopPlayback();
    return;
  }
  const token = ++playbackToken;
  playFrames.textContent = "Stop frames";
  playFrames.setAttribute("aria-pressed", "true");
  const playNext = async () => {
    if (token !== playbackToken) return;
    const scenario = scenarios[selected];
    const index = scenario?.frames.findIndex((entry) => entry.id === frameSelect.value) ?? -1;
    if (!scenario || index >= scenario.frames.length - 1) {
      stopPlayback();
      return;
    }
    await new Promise((resolve) => window.setTimeout(resolve, frameDelayMs));
    if (token !== playbackToken) return;
    await showScenario(selected, scenario.frames[index + 1].id);
    if (token === playbackToken) void playNext();
  };
  void playNext();
});
list.addEventListener("click", (event) => {
  if (!(event.target instanceof Element)) return;
  const link = event.target.closest("a[data-scenario]");
  if (!link || !(link instanceof HTMLAnchorElement)) return;
  event.preventDefault();
  stopPlayback();
  void showScenario(scenarios.findIndex((scenario) => scenario.id === link.dataset.scenario));
});
$("previous").addEventListener("click", () => { stopPlayback(); void showScenario((selected + scenarios.length - 1) % scenarios.length); });
$("next").addEventListener("click", () => { stopPlayback(); void showScenario((selected + 1) % scenarios.length); });
$("reset").addEventListener("click", () => { stopPlayback(); void showScenario(selected, frameSelect.value); });
viewport.addEventListener("change", () => { frame.style.width = `${viewport.value}px`; });
$("copy-url").addEventListener("click", async (event) => {
  const button = event.currentTarget;
  if (!(button instanceof HTMLButtonElement)) return;
  const url = button.dataset.url;
  if (url) {
    await navigator.clipboard.writeText(url);
    button.textContent = "Scenario URL copied";
    window.setTimeout(() => { button.textContent = "Copy scenario URL"; }, 1500);
  }
});
void loadScenarios().catch((error) => { $("player-status").textContent = error instanceof Error ? error.message : "Local demo failed to load"; });
