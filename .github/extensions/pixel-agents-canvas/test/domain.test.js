import test from "node:test";
import assert from "node:assert/strict";
import { getFreshness, normalizeProviderStatus, normalizeSnapshot } from "../src/domain.js";

test("normalizes provider sessions and provider-identified agents without inferring missing data", () => {
    const result = normalizeSnapshot("codex", "app-server", {
        threads: [{ id: "thread-1", title: "Refine dashboard", status: { type: "active" }, agents: [{ id: "agent-1", name: "Builder", parentId: "agent-root" }] }],
    });

    assert.deepEqual(result, {
        sessions: [{ id: "codex:thread-1", provider: "codex", source: "app-server", sourceId: "thread-1", summary: "Refine dashboard", state: "working", updatedAt: null, freshness: "unknown", parentSessionId: null }],
        agents: [{ id: "codex:thread-1:agent:agent-1", sessionId: "codex:thread-1", provider: "codex", source: "app-server", sourceId: "agent-1", name: "Builder", parentId: "codex:thread-1:agent:agent-root", state: "unknown" }],
    });
});

test("maps Codex list records to distinct sessions, reported parent relationships, lifecycle, and freshness", () => {
    const now = Date.now();
    const result = normalizeSnapshot("codex", "app-server", {
        threads: [
            { id: "parent", name: "Parent session", status: { type: "idle" }, updatedAt: (now - 10_000) / 1000 },
            { id: "child", name: "Review worker", parentThreadId: "parent", agentRole: "reviewer", status: { type: "active", activeFlags: ["waitingOnApproval"] }, updatedAt: (now - 15_000) / 1000 },
            { id: "finished", title: "Finished work", status: { type: "systemError" }, updatedAt: "invalid" },
        ],
    });

    assert.deepEqual(result.sessions.map(({ id, parentSessionId, state }) => ({ id, parentSessionId, state })), [
        { id: "codex:parent", parentSessionId: null, state: "idle" },
        { id: "codex:child", parentSessionId: "codex:parent", state: "waiting" },
        { id: "codex:finished", parentSessionId: null, state: "failed" },
    ]);
    assert.equal(result.sessions[0].freshness, "fresh");
    assert.equal(result.sessions[2].freshness, "unknown");
    assert.equal(result.sessions[2].updatedAt, null);
    assert.deepEqual(result.agents.map(({ id, sessionId, name, parentId }) => ({ id, sessionId, name, parentId })), [
        { id: "codex:child:agent:child", sessionId: "codex:child", name: "reviewer", parentId: null },
    ]);
});

test("uses newer duplicates without trusting older or un-timestamped records", () => {
    const result = normalizeSnapshot("codex", "app-server", {
        threads: [
            { id: "one", name: "New title", status: { type: "active" }, updatedAt: Date.now() },
            { id: "one", name: "Old title", status: { type: "idle" }, updatedAt: Date.now() - 1_000 },
            { id: "one", name: "Unknown timestamp", status: { type: "completed" } },
        ],
    });

    assert.equal(result.sessions.length, 1);
    assert.equal(result.sessions[0].summary, "New title");
    assert.equal(result.sessions[0].state, "working");
    assert.ok(result.sessions[0].updatedAt <= Date.now());
});

test("future-dated session status is not treated as current activity", () => {
    const result = normalizeSnapshot("codex", "app-server", {
        threads: [{ id: "future", status: { type: "active" }, updatedAt: (Date.now() + 60_000) / 1000 }],
    });
    assert.equal(result.sessions[0].state, "unknown");
    assert.equal(result.sessions[0].freshness, "unknown");
});

test("normalizes provider availability and freshness without inferring either", () => {
    assert.deepEqual(normalizeProviderStatus("codex", "app-server", { availability: "empty", updatedAt: 1_000 }), {
        provider: "codex", source: "app-server", availability: "empty", updatedAt: 1_000_000,
    });
    assert.equal(normalizeProviderStatus("copilot", "hooks", { availability: "connected", updatedAt: 1_000 }).updatedAt, 1_000);
    assert.equal(normalizeProviderStatus("codex", "app-server", { availability: "connected" }).availability, "connected");
    assert.equal(normalizeProviderStatus("codex", "app-server", { availability: "maybe" }).availability, "unknown");
    assert.equal(normalizeProviderStatus("", "app-server", { availability: "empty" }), null);
    assert.equal(getFreshness(900, 1_000, 200), "fresh");
    assert.equal(getFreshness(700, 1_000, 200), "stale");
    assert.equal(getFreshness(null, 1_000), "unknown");
    assert.equal(getFreshness(1_100, 1_000), "unknown");
});

test("keeps agent identities distinct across sessions and discards duplicate or malformed records", () => {
    const result = normalizeSnapshot("copilot", "hooks", {
        threads: [
            { id: "one", agents: [{ id: "worker" }, { id: "worker" }, { name: "missing id" }] },
            { id: "one", agents: [{ id: "ignored" }] },
            { id: "two", agents: [{ id: "worker" }] },
            { title: "missing session id", agents: [{ id: "orphan" }] },
        ],
    });

    assert.deepEqual(result.sessions.map(({ id }) => id), ["copilot:one", "copilot:two"]);
    assert.deepEqual(result.agents.map(({ id, sessionId, parentId, name }) => ({ id, sessionId, parentId, name })), [
        { id: "copilot:one:agent:worker", sessionId: "copilot:one", parentId: null, name: null },
        { id: "copilot:two:agent:worker", sessionId: "copilot:two", parentId: null, name: null },
    ]);
});

test("normalizes parent agent references within their session identity", () => {
    const result = normalizeSnapshot("codex", "app-server", {
        threads: [
            { id: "one", agents: [{ id: "root" }, { id: "worker", parentId: "root" }] },
            { id: "two", agents: [{ id: "root" }, { id: "worker", parentId: "root" }] },
        ],
    });

    assert.deepEqual(result.agents.map(({ id, parentId }) => ({ id, parentId })), [
        { id: "codex:one:agent:root", parentId: null },
        { id: "codex:one:agent:worker", parentId: "codex:one:agent:root" },
        { id: "codex:two:agent:root", parentId: null },
        { id: "codex:two:agent:worker", parentId: "codex:two:agent:root" },
    ]);
});

test("prototype property names are not recognized provider states", () => {
    const result = normalizeSnapshot("codex", "app-server", { threads: [
        { id: "one", status: "__proto__" },
        { id: "two", status: "toString" },
    ] });
    assert.deepEqual(result.sessions.map(({ state }) => state), ["unknown", "unknown"]);
});

test("returns an empty snapshot for invalid input", () => {
    assert.deepEqual(normalizeSnapshot("", "app-server", { threads: [{ id: "x" }] }), { sessions: [], agents: [] });
    assert.deepEqual(normalizeSnapshot("codex", "app-server", null), { sessions: [], agents: [] });
});
