// @ts-check
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { createCanvas, joinSession } from "@github/copilot-sdk/extension";
import { createStore, genericCopilotLabel } from "./src/state.js";
import { normalizeProviderStatus, normalizeSnapshot } from "./src/domain.js";
import { createCodexClient } from "./src/codex-client.js";
import { renderHtml } from "./src/renderer.js";

/** @typedef {import("./src/types.js").AgentState} AgentState */
/** @typedef {import("./src/types.js").CodexStatus} CodexStatus */
/** @typedef {import("./src/types.js").DiscoveredCodexThread} DiscoveredCodexThread */
/** @typedef {import("./src/types.js").OfficeActivityInput} OfficeActivityInput */
/** @typedef {import("./src/types.js").OfficeAgentCard} OfficeAgentCard */
/** @typedef {import("./src/types.js").ProviderName} ProviderName */
/** @typedef {import("./src/types.js").NormalizedProviderStatus} NormalizedProviderStatus */

/** @type {Map<string, { server: import("node:http").Server, url: string }>} */
const servers = new Map();
const store = createStore();
const now = () => new Date().toISOString();
const palette = { Copilot: "#64d8b4", Codex: "#f2a65a" };
/** @param {unknown} value @returns {string} */
const safeJson = (value) => JSON.stringify(value).replaceAll("<", "\\u003c");
/** @type {import("./src/types.js").CodexClient | undefined} */
let codexClient;
/** @type {DiscoveredCodexThread[]} */
let codexThreads = [];
/** @type {import("./src/types.js").NormalizedSnapshot} */
let codexSnapshot = { sessions: [], agents: [] };
/** @type {Set<string>} */
const endedCodexThreads = new Set();
/** @type {CodexStatus} */
let codexStatus = { availability: "unavailable", connected: false, error: "Codex is disabled. Enable it here to connect to your local Codex CLI." };
/** @type {NormalizedProviderStatus} */
let copilotStatus = { provider: "Copilot", source: "copilotcli", availability: "unavailable", updatedAt: null };
/** @returns {NormalizedProviderStatus[]} */
function providerStatuses() {
    const codex = normalizeProviderStatus("Codex", "app-server", { availability: codexStatus.availability, updatedAt: codexStatus.updatedAt ?? null });
    return codex ? [copilotStatus, codex] : [copilotStatus];
}
/** @param {DiscoveredCodexThread[]} threads */
function syncCodexThreads(threads) {
    codexThreads = threads;
    codexSnapshot = normalizeSnapshot("codex", "app-server", { threads });
    const threadById = new Map(threads.map((thread) => [thread.id, thread]));
    for (const sessionRecord of codexSnapshot.sessions) {
        const thread = threadById.get(sessionRecord.sourceId);
        const monitoring = thread?.monitoring === "subscribed";
        store.upsert({ id: `codex:${sessionRecord.sourceId}`, provider: "Codex", state: monitoring ? sessionRecord.state : "unknown", task: monitoring ? sessionRecord.summary ?? "Codex session" : "Codex session found; live monitoring unavailable", connected: monitoring, at: sessionRecord.updatedAt ?? Date.now() });
    }
    const sessionCount = threads.filter((thread) => !thread.archived).length;
    const archivedCount = threads.filter((thread) => thread.archived).length;
    const monitoringUnavailableCount = threads.filter((thread) => !thread.archived && thread.monitoring !== "subscribed").length;
    codexStatus = { availability: sessionCount === 0 && archivedCount === 0 ? "empty" : monitoringUnavailableCount ? "stale" : "connected", connected: true, error: monitoringUnavailableCount ? "Some Codex sessions could not be monitored" : "", sessionCount, archivedCount, monitoringUnavailableCount, updatedAt: Date.now() };
}
/** @returns {OfficeAgentCard[]} */
function publicAgents() {
    const rows = store.list().filter((item) => !item.id.startsWith("provider:"));
    /** @type {OfficeAgentCard[]} */
    const providers = /** @type {ProviderName[]} */ (["Copilot", "Codex"]).map((provider) => {
        const item = rows.find((row) => row.provider === provider && !row.id.startsWith("codex:"));
        const sourceStatus = provider === "Codex"
            ? normalizeProviderStatus("Codex", "app-server", codexStatus)
            : copilotStatus;
        const availability = sourceStatus?.availability ?? "unknown";
        const connected = availability === "connected" || availability === "empty" || availability === "stale";
        const detail = provider === "Codex"
            ? codexStatus.error || (availability === "empty" ? "Connected · no Codex sessions found" : codexStatus.sessionCount !== undefined ? `Connected · ${codexStatus.sessionCount} Codex sessions` : "Connected · waiting for discovery")
            : connected ? item?.task ?? "Connected · hosting session" : "No hosting session activity observed";
        return { kind: "provider", id: provider.toLowerCase(), name: provider, provider, role: provider === "Copilot" ? "Activity source · hosting session" : "Activity source · local Codex", state: item?.state ?? (connected ? "idle" : "unknown"), task: detail, color: palette[provider], connected, availability, updatedAt: sourceStatus?.updatedAt ? new Date(sourceStatus.updatedAt).toISOString() : now() };
    });
    const copilotRow = rows.find((row) => row.id === "copilot:current-session");
    /** @type {OfficeAgentCard[]} */
    const copilotSessions = copilotRow && copilotRow.state !== "completed" ? [{ kind: "session", id: "copilot:current-session", sessionId: "copilot:current-session", name: "This Copilot session", provider: "Copilot", role: "Hosting conversation", state: copilotRow.state, task: copilotRow.task, color: palette.Copilot, connected: copilotRow.connected, freshness: copilotRow.freshness, updatedAt: new Date(copilotRow.updatedAt).toISOString() }] : [];
    /** @type {OfficeAgentCard[]} */
    const codexSessions = codexSnapshot.sessions.filter((sessionRecord) => {
        const thread = codexThreads.find((item) => item.id === sessionRecord.sourceId);
        return !endedCodexThreads.has(sessionRecord.sourceId) && !thread?.archived;
    }).map((sessionRecord) => {
        const thread = codexThreads.find((item) => item.id === sessionRecord.sourceId);
        const row = store.get(`codex:${sessionRecord.sourceId}`);
        const monitoring = thread?.monitoring ?? "unavailable";
        return { kind: "session", id: `codex:${sessionRecord.sourceId}`, sessionId: sessionRecord.id, sourceId: sessionRecord.sourceId, parentSessionId: sessionRecord.parentSessionId, name: sessionRecord.summary ?? "Untitled Codex session", provider: "Codex", role: monitoring === "unavailable" ? "Codex session · monitoring unavailable" : sessionRecord.parentSessionId ? "Codex subagent thread" : "Codex thread", state: row?.state ?? sessionRecord.state, task: row?.task ?? "Session discovered", color: palette.Codex, connected: codexStatus.connected && monitoring === "subscribed", monitoring, freshness: monitoring === "subscribed" ? row?.freshness ?? sessionRecord.freshness : "unknown", updatedAt: sessionRecord.updatedAt ? new Date(sessionRecord.updatedAt).toISOString() : row?.updatedAt ? new Date(row.updatedAt).toISOString() : now() };
    });
    return [...providers, ...copilotSessions, ...codexSessions];
}
/** @param {OfficeActivityInput} activity */
function record({ provider, id, state, event, at }) {
    const providerName = provider.toLowerCase() === "copilot" ? "Copilot" : "Codex";
    /** @type {Partial<Record<import("./src/types.js").OfficeActivityEventName, string>>} */
    const codexLabels = { "turn-start": "Working on a request", "session-end": "Session ended", "thread-status": "Status updated", error: "Codex encountered an error" };
    const label = providerName === "Copilot" ? genericCopilotLabel(event) : codexLabels[event] ?? "Codex activity updated";
    if (providerName === "Codex" && event === "session-end") endedCodexThreads.add(id.slice("codex:".length));
    if (providerName === "Copilot") copilotStatus = { provider: "Copilot", source: "copilotcli", availability: event === "session-end" ? "disconnected" : "connected", updatedAt: at };
    store.upsert({ id, provider: providerName, state, task: label, connected: event !== "session-end", at });
}
function copilotHooks() {
    /** @param {import("./src/types.js").OfficeActivityEventName} event @param {AgentState} [state] */
    const update = (event, state = "working") => () => { record({ provider: "Copilot", id: "copilot:current-session", state, event, at: Date.now() }); };
    return {
        onSessionStart: update("session-start", "idle"),
        onSessionEnd: update("session-end", "completed"),
        onUserPromptSubmitted: update("prompt-submitted"),
        onPreToolUse: update("tool-start"),
        onPostToolUse: update("tool-complete", "working"),
        onPostToolUseFailure: update("tool-complete", "failed"),
        onErrorOccurred: update("error", "failed"),
    };
}
/** @type {Promise<void> | undefined} */
let codexStartPromise;
/** @param {import("./src/types.js").CodexThreadLifecycleEvent} event */
function handleCodexLifecycle({ threadId, event }) {
    if (event !== "archived" && event !== "unarchived") return;
    const archived = event === "archived";
    codexThreads = codexThreads.map((thread) => thread.id === threadId ? { ...thread, archived } : thread);
    codexSnapshot = normalizeSnapshot("codex", "app-server", { threads: codexThreads });
    codexStatus = { ...codexStatus, archivedCount: codexThreads.filter((thread) => thread.archived).length, sessionCount: codexThreads.filter((thread) => !thread.archived).length };
}
/** @type {ReturnType<typeof setInterval> | undefined} */
let codexRefreshTimer;
/** @type {Promise<void> | undefined} */
let codexRefreshPromise;
function refreshCodexThreads() {
    if (!codexClient?.running || codexRefreshPromise) return Promise.resolve();
    codexRefreshPromise = codexClient.discoverThreads()
        .then(syncCodexThreads)
        .catch(() => { codexStatus = { ...codexStatus, availability: "stale", connected: Boolean(codexClient?.running), error: "Codex session refresh failed" }; })
        .finally(() => { codexRefreshPromise = undefined; });
    return codexRefreshPromise;
}
function enableCodex() {
    if (codexClient?.running) return Promise.resolve();
    if (codexStartPromise) return codexStartPromise;
    codexClient = createCodexClient({ onEvent: record, onThreadLifecycle: handleCodexLifecycle, onStatus: (status) => { codexStatus = { ...status, updatedAt: Date.now() }; } });
    codexStartPromise = codexClient.start()
        .then(refreshCodexThreads)
        .then(() => { codexRefreshTimer = setInterval(refreshCodexThreads, 15_000); codexRefreshTimer.unref?.(); })
        .catch((error) => { codexStatus = { availability: "unavailable", connected: false, error: error instanceof Error ? error.message : "Codex provider startup failed" }; })
        .finally(() => { codexStartPromise = undefined; });
    return codexStartPromise;
}

/** @param {string} instanceId */
async function startServer(instanceId) {
    const officeClientSource = await readFile(new URL("./src/office-client.js", import.meta.url), "utf8");
    const server = createServer((req, res) => {
        if (req.method === "GET" && req.url === "/office-client.js") {
            res.writeHead(200, { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" }).end(officeClientSource);
            return;
        }
        if (req.method === "POST" && req.url === "/codex/enable") { enableCodex(); res.writeHead(202).end(); return; }
        if (req.url === "/state") { res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" }).end(safeJson({ agents: publicAgents(), providers: providerStatuses() })); return; }
        if (req.url === "/health") { res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ ok: true })); return; }
        res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" });
        res.end(renderHtml({ instanceId, agents: publicAgents(), codexStatus }));
    });
    await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", () => resolve(undefined)); });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Canvas listener has no TCP address");
    return { server, url: `http://127.0.0.1:${address.port}/` };
}

const session = await joinSession({ canvases: [createCanvas({
    id: "pixel-agents-canvas",
    displayName: "Pixel Agents Office",
    description: "A pixel-art office showing metadata-only activity from this Copilot session and opt-in local Codex threads.",
    actions: [
        { name: "list_agents", description: "List provider health and metadata-only sessions observed by this canvas.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, handler: () => ({ agents: publicAgents(), providers: providerStatuses() }) },
        { name: "enable_codex", description: "Start the local Codex app-server after explicit user consent.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, handler: () => { enableCodex(); return { started: true }; } },
    ],
    open: async (ctx) => {
        let entry = servers.get(ctx.instanceId);
        if (!entry) { entry = await startServer(ctx.instanceId); servers.set(ctx.instanceId, entry); }
        return { title: "Pixel Agents · Office", status: "Provider activity · metadata only", url: entry.url };
    },
    onClose: async ({ instanceId }) => {
        const entry = servers.get(instanceId);
        if (entry) { servers.delete(instanceId); await new Promise((resolve, reject) => entry.server.close((error) => error ? reject(error) : resolve(undefined))); }
    },
})], hooks: copilotHooks() });
copilotStatus = normalizeProviderStatus("Copilot", "copilotcli", { availability: "connected", updatedAt: Date.now() }) ?? copilotStatus;
session.on("session.end", async () => { if (codexRefreshTimer) clearInterval(codexRefreshTimer); await codexClient?.stop(); for (const { server } of servers.values()) server.close(); servers.clear(); });
