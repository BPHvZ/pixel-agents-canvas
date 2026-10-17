import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { createCodexClient } from "../src/codex-client.js";

function fakeProcess({ onRequest = () => undefined, resumeErrorFor = new Set() } = {}) {
    const child = new EventEmitter();
    child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
    child.exitCode = null; child.signalCode = null;
    child.requests = [];
    child.stdin.on("data", (chunk) => {
        const msg = JSON.parse(chunk.toString());
        child.requests.push(msg);
        if (msg.id == null) return;
        let result = {};
        if (msg.method === "initialize") result = { userAgent: "fixture" };
        if (msg.method === "thread/list") result = onRequest(msg) ?? { data: [], nextCursor: null };
        if (msg.method === "thread/resume" && resumeErrorFor.has(msg.params.threadId)) {
            queueMicrotask(() => child.stdout.write(`${JSON.stringify({ id: msg.id, error: { message: "resume unavailable" } })}\n`));
            return;
        }
        if (msg.method === "thread/resume") result = { thread: { id: msg.params.threadId, status: { type: "idle" }, turns: [] } };
        if (msg.method === "thread/unsubscribe") result = {};
        queueMicrotask(() => child.stdout.write(`${JSON.stringify({ id: msg.id, result })}\n`));
    });
    child.kill = (signal) => { child.signalCode = signal; queueMicrotask(() => child.emit("exit", null, signal)); };
    return child;
}

test("Codex client initializes without an initialized notification and only emits discovered thread metadata", async () => {
    const events = []; const statuses = []; let child;
    const client = createCodexClient({
        spawnProcess: () => (child = fakeProcess({ onRequest: () => ({ data: [{ id: "thread-owned", name: "Current session", status: { type: "idle" } }], nextCursor: null }) })),
        onEvent: (event) => events.push(event), onStatus: (status) => statuses.push(status),
    });
    await client.start();
    assert.equal(client.running, true);
    assert.deepEqual(statuses.at(-1), { availability: "connected", connected: true, error: "" });
    const threads = await client.discoverThreads({ includeArchived: false });
    assert.equal(threads[0].id, "thread-owned");
    child.stdout.write(`${JSON.stringify({ method: "turn/started", params: { threadId: "unowned", turn: { id: "private" } } })}\n`);
    child.stdout.write(`${JSON.stringify({ method: "turn/started", params: { threadId: "thread-owned", turn: { id: "turn-1" } } })}\n`);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(events.length, 1);
    assert.equal(events[0].state, "working");
    assert.equal(JSON.stringify(events).includes("private"), false);
    await client.stop();
    assert.equal(client.running, false);
});

test("Codex client lists every metadata-only page and discards content-bearing fields", async () => {
    let child;
    const client = createCodexClient({
        spawnProcess: () => (child = fakeProcess({
            onRequest: ({ params }) => params.cursor
                ? { data: [{ id: "thread-2", title: "Review worker", parentThreadId: "thread-1", status: { type: "active", activeFlags: ["waitingOnApproval"] }, updatedAt: 200, preview: "private second preview", turns: [{ text: "private second turn" }], path: "/secret/path" }], nextCursor: null }
                : { data: [{ id: "thread-1", name: "Main task", status: { type: "idle", activeFlags: [] }, createdAt: 100, updatedAt: 150, source: "cli", modelProvider: "custom", preview: "private first prompt", turns: [{ text: "private first turn" }], cwd: "/secret/repo" }], nextCursor: "page-2" },
        })),
    });
    await client.start();
    try {
        const threads = await client.listThreads();
        assert.deepEqual(threads, [
            { id: "thread-1", title: "Main task", parentThreadId: null, status: { type: "idle", activeFlags: [] }, createdAt: 100, updatedAt: 150, source: "cli", modelProvider: "custom", archived: false },
            { id: "thread-2", title: "Review worker", parentThreadId: "thread-1", status: { type: "active", activeFlags: ["waitingOnApproval"] }, createdAt: null, updatedAt: 200, source: null, modelProvider: null, archived: false },
        ]);
        const requests = child.requests.filter((request) => request.method === "thread/list");
        assert.equal(requests.length, 2);
        assert.deepEqual(requests.map(({ params }) => params), [
            { archived: false, limit: 100, useStateDbOnly: true },
            { archived: false, limit: 100, useStateDbOnly: true, cursor: "page-2" },
        ]);
        assert.equal(JSON.stringify(threads).includes("private"), false);
        assert.equal(JSON.stringify(threads).includes("secret"), false);
    } finally {
        await client.stop();
    }
});

test("Codex discovery returns archived metadata but resumes only live threads without turns", async () => {
    let child;
    const events = [];
    const client = createCodexClient({
        spawnProcess: () => (child = fakeProcess({
            onRequest: ({ params }) => ({
                data: [{ id: params.archived ? "archived" : "active", name: params.archived ? "Old session" : "Current session", status: { type: "idle" }, updatedAt: 1000, preview: "hidden preview", turns: [{ text: "hidden turn" }] }],
                nextCursor: null,
            }),
        })),
        onEvent: (event) => events.push(event),
    });
    await client.start();
    try {
        const threads = await client.discoverThreads();
        assert.deepEqual(threads.map(({ id, archived }) => ({ id, archived })), [
            { id: "active", archived: false },
            { id: "archived", archived: true },
        ]);
        await client.discoverThreads();
        const resumes = child.requests.filter((request) => request.method === "thread/resume");
        assert.deepEqual(resumes.map(({ params }) => params), [{ threadId: "active", excludeTurns: true }]);
        assert.equal(child.requests.some((request) => request.method === "thread/start"), false);
        assert.equal(JSON.stringify(threads).includes("hidden"), false);
        child.stdout.write(`${JSON.stringify({ method: "thread/status/changed", params: { threadId: "active", status: { type: "active" } } })}\n`);
        child.stdout.write(`${JSON.stringify({ method: "thread/status/changed", params: { threadId: "not-discovered", status: { type: "active" } } })}\n`);
        await new Promise((resolve) => setImmediate(resolve));
        assert.deepEqual(events.map(({ id, state }) => ({ id, state })), [{ id: "codex:active", state: "working" }]);
    } finally {
        await client.stop();
    }
});

test("Codex discovery reports listed sessions whose live subscription is unavailable", async () => {
    const statuses = [];
    const client = createCodexClient({
        spawnProcess: () => fakeProcess({ onRequest: () => ({ data: [{ id: "listed-but-unmonitored", status: { type: "idle" } }], nextCursor: null }), resumeErrorFor: new Set(["listed-but-unmonitored"]) }),
        onStatus: (status) => statuses.push(status),
    });
    await client.start();
    try {
        const threads = await client.discoverThreads({ includeArchived: false });
        assert.equal(threads[0].monitoring, "unavailable");
        assert.equal(statuses.at(-1).availability, "stale");
        assert.equal(statuses.at(-1).connected, true);
    } finally {
        await client.stop();
    }
});

test("Codex turn outcomes are separate from thread lifecycle state", async () => {
    let child;
    const events = [];
    const turns = [];
    const client = createCodexClient({
        spawnProcess: () => (child = fakeProcess({ onRequest: () => ({ data: [{ id: "thread-owned", status: { type: "active" } }], nextCursor: null }) })),
        onEvent: (event) => events.push(event), onTurn: (turn) => turns.push(turn),
    });
    await client.start();
    try {
        const { id: threadId } = (await client.discoverThreads({ includeArchived: false }))[0];
        child.stdout.write(`${JSON.stringify({ method: "turn/completed", params: { threadId, turn: { id: "turn-1", status: "interrupted" } } })}\n`);
        await new Promise((resolve) => setImmediate(resolve));
        assert.equal(events.some(({ state }) => state === "completed" || state === "failed"), false);
        assert.deepEqual(turns.map(({ threadId: id, turnId, outcome }) => ({ id, turnId, outcome })), [
            { id: "thread-owned", turnId: "turn-1", outcome: "interrupted" },
        ]);
    } finally {
        await client.stop();
    }
});

test("Codex archival does not end a thread, but an explicit close does", async () => {
    let child;
    const events = [];
    const lifecycle = [];
    const client = createCodexClient({
        spawnProcess: () => (child = fakeProcess({ onRequest: () => ({ data: [{ id: "thread-owned", status: { type: "idle" } }], nextCursor: null }) })),
        onEvent: (event) => events.push(event),
        onThreadLifecycle: (event) => lifecycle.push(event),
    });
    await client.start();
    try {
        const { id: threadId } = (await client.discoverThreads({ includeArchived: false }))[0];
        child.stdout.write(`${JSON.stringify({ method: "thread/archived", params: { threadId } })}\n`);
        child.stdout.write(`${JSON.stringify({ method: "thread/closed", params: { threadId } })}\n`);
        await new Promise((resolve) => setImmediate(resolve));
        assert.deepEqual(lifecycle.map(({ event }) => event), ["archived", "closed"]);
        assert.equal(events.filter(({ event }) => event === "session-end").length, 1);
        assert.equal(events.find(({ event }) => event === "session-end").state, "completed");
    } finally {
        await client.stop();
    }
});

test("Codex client unsubscribes discovered threads when stopping", async () => {
    let child;
    const client = createCodexClient({
        spawnProcess: () => (child = fakeProcess({ onRequest: () => ({ data: [{ id: "active", status: { type: "idle" } }], nextCursor: null }) })),
    });
    await client.start();
    await client.discoverThreads({ includeArchived: false });
    await client.stop();
    assert.deepEqual(child.requests.filter((request) => request.method === "thread/unsubscribe").map(({ params }) => params), [
        { threadId: "active" },
    ]);
});
