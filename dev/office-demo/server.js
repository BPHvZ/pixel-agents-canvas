// @ts-check
import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createOfficeServer } from "./production-src/server.js";
import { createPreferenceStore } from "./production-src/preferences.js";
import { createScenarioRuntime } from "./runner-adapter.js";
import { buildScenarioFixture, listScenarios, seededRandom } from "./scenarios.js";

const scenarios = listScenarios();
/** @type {{url:string,close:()=>Promise<void>,title:string}|undefined} */
let activePreview;
/** @type {Promise<void>} */
let previewQueue = Promise.resolve();
let expectedHost = "";
/** @type {Map<string, [URL, string]>} */
const assets = new Map([
  ["/", [new URL("./index.html", import.meta.url), "text/html"]],
  ["/player.js", [new URL("./player.js", import.meta.url), "text/javascript"]],
  ["/player.css", [new URL("./player.css", import.meta.url), "text/css"]],
]);

/** @param {string} value */
function hashSeed(value) {
  let seed = 2166136261;
  for (const point of value) seed = Math.imul(seed ^ (point.codePointAt(0) ?? 0), 16777619) >>> 0;
  return seed;
}

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function record(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** @param {string} id @param {string} frameId */
async function startPreview(id, frameId) {
  const scenario = scenarios.find((entry) => entry.id === id);
  if (!scenario) throw new Error("Unknown scenario ID");
  const fixture = buildScenarioFixture(id);
  const frame = frameId ? fixture.frames.find((entry) => entry.id === frameId && entry.scenarioId === id) : fixture.frames[0];
  if (frameId && !frame) throw new Error("Unknown scenario frame ID");
  const selectedFrame = frame ?? null;
  const frameTime = selectedFrame?.atMs ?? fixture.now;
  const { controller, applyStep } = createScenarioRuntime(fixture);
  const preferenceDirectory = await mkdtemp(join(tmpdir(), `pixel-agents-office-demo-${process.pid}-`));
  /** @type {Awaited<ReturnType<typeof createOfficeServer>>|undefined} */
  let previewServer;
  /** @type {Promise<void>|undefined} */
  let closing;
  const close = () => {
    closing ??= (async () => {
      try { await previewServer?.close(); }
      finally { await rm(preferenceDirectory, { recursive: true, force: true }); }
    })();
    return closing;
  };
  try {
    const preferences = createPreferenceStore({ directory: preferenceDirectory, workspaceId: `office-demo:${id}` });
    await preferences.write(fixture.preferences);
    let worldNow = fixture.now;
    const liveServer = await createOfficeServer({
      instanceId: "local-office-demo",
      controller,
      preferences,
      worldOptions: { clock: () => worldNow, random: seededRandom(hashSeed(`${selectedFrame?.seed ?? fixture.seed}:${id}`)) },
    });
    previewServer = liveServer;
    const initialPage = await fetch(liveServer.url);
    if (!initialPage.ok) throw new Error("Production renderer failed to initialize");
    await initialPage.arrayBuffer();
    const targetStep = selectedFrame?.afterStepId ? fixture.steps.findIndex((step) => step.id === selectedFrame.afterStepId) : -1;
    if (selectedFrame?.afterStepId && targetStep < 0) throw new Error("Unknown timeline step for scenario frame");
    const steps = selectedFrame
      ? selectedFrame.afterStepId
        ? fixture.steps.slice(0, targetStep + 1)
        : fixture.steps.filter((step) => step.atMs <= frameTime)
      : [];
    if (steps.some((step) => step.atMs > frameTime)) throw new Error("Scenario frame precedes its required timeline step");
    /** @param {number} atMs */
    const readStateAt = async (atMs) => {
      worldNow = atMs;
      const response = await fetch(`${liveServer.url}state`);
      if (!response.ok) throw new Error("Production timeline state read failed");
      await response.arrayBuffer();
    };
    for (const step of steps) {
      applyStep(step);
      await readStateAt(step.atMs);
      if (step.advanceTo !== undefined && step.tickIntervalMs !== undefined) {
        const end = Math.min(step.advanceTo, frameTime);
        if (!Number.isFinite(step.tickIntervalMs) || step.tickIntervalMs <= 0 || end < step.atMs) throw new Error("Invalid scenario world timeline");
        for (let atMs = step.atMs + step.tickIntervalMs; atMs <= end; atMs += step.tickIntervalMs) await readStateAt(atMs);
        if (worldNow < end) await readStateAt(end);
      }
    }
    const postStepInterval = steps.at(-1)?.tickIntervalMs ?? fixture.worldTickIntervalMs ?? 30_000;
    if (!Number.isFinite(postStepInterval) || postStepInterval <= 0) throw new Error("Invalid production world cadence");
    for (let atMs = worldNow + postStepInterval; atMs <= frameTime; atMs += postStepInterval) await readStateAt(atMs);
    if (worldNow < frameTime) await readStateAt(frameTime);
    return { url: liveServer.url, close, title: selectedFrame ? `${scenario.title} · ${selectedFrame.id}` : scenario.title };
  } catch (error) {
    await close();
    throw error;
  }
}

const server = createServer((request, response) => {
  response.setHeader("cache-control", "no-store");
  response.setHeader("x-content-type-options", "nosniff");
  response.setHeader("referrer-policy", "no-referrer");
  const path = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
  void (async () => {
    if (request.headers.host !== expectedHost) {
      response.writeHead(403).end("Invalid local host");
      return;
    }
    response.setHeader("content-security-policy", "default-src 'self'; script-src 'self'; style-src 'self'; frame-src http://127.0.0.1:*; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'");
    if (request.method === "GET" && assets.has(path)) {
      const asset = assets.get(path);
      if (!asset) return;
      response.writeHead(200, { "content-type": `${asset[1]}; charset=utf-8` }).end(await readFile(asset[0]));
      return;
    }
    if (request.method === "GET" && path === "/api/scenarios") {
      const entries = scenarios.map(({ id, title, description, covers }) => {
        const fixture = buildScenarioFixture(id);
        return { id, title, description, covers, viewport: fixture.viewport, reducedMotion: fixture.reducedMotion, defaultAtMs: fixture.now, frames: fixture.frames };
      });
      response.writeHead(200, { "content-type": "application/json; charset=utf-8" }).end(JSON.stringify(entries));
      return;
    }
    if (request.method === "POST" && path === "/api/preview") {
      if (request.headers.origin !== `http://${expectedHost}` || request.headers["content-type"]?.split(";")[0]?.trim().toLowerCase() !== "application/json") {
        response.writeHead(403).end("Same-origin JSON request required");
        return;
      }
      let body = "";
      for await (const chunk of request) {
        body += String(chunk);
        if (body.length > 4096) throw new Error("Request too large");
      }
      const input = JSON.parse(body);
      if (!record(input) || typeof input.id !== "string" || typeof input.frameId !== "string") {
        response.writeHead(400).end("Invalid preview request");
        return;
      }
      const scenarioId = input.id;
      const frameId = input.frameId;
      const operation = previewQueue.then(async () => {
        await activePreview?.close();
        const preview = await startPreview(scenarioId, frameId);
        activePreview = preview;
        return preview;
      });
      previewQueue = operation.then(() => undefined, () => undefined);
      const preview = await operation;
      response.writeHead(200, { "content-type": "application/json; charset=utf-8" }).end(JSON.stringify({ url: preview.url, title: preview.title }));
      return;
    }
    response.writeHead(404).end("Not found");
  })().catch(() => {
    if (!response.headersSent) response.writeHead(400).end("Invalid local demo request");
  });
});

server.listen(0, "127.0.0.1", () => {
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Local demo listener failed");
  expectedHost = `127.0.0.1:${address.port}`;
  process.stdout.write(`http://127.0.0.1:${address.port}/\n`);
});

let closing = false;
function close() {
  if (closing) return;
  closing = true;
  void (async () => {
    await previewQueue;
    await activePreview?.close();
    server.close(() => process.exit(0));
  })();
}
process.on("SIGINT", close);
process.on("SIGTERM", close);
