import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { createCodexClient } from "../src/codex-client.js";

function fakeProcess({ onRequest = () => undefined, onResume, resumeErrorFor = new Set() } = {}) {
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
        if (msg.method === "thread/resume") result = onResume?.(msg, child) ?? { thread: { id: msg.params.threadId, status: { type: "idle" }, turns: [] } };
        if (msg.method === "thread/unsubscribe") result = {};
        queueMicrotask(() => child.stdout.write(`${JSON.stringify({ id: msg.id, result })}\n`));
    });
    child.kill = (signal) => { child.signalCode = signal; queueMicrotask(() => child.emit("exit", null, signal)); };
    return child;
}

function controlledProcess(onRequest = () => false, { autoExit = true } = {}) {
    const child = new EventEmitter();
    child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
    child.exitCode = null; child.signalCode = null; child.requests = []; child.signals = [];
    child.respond = (request, result) => child.stdout.write(`${JSON.stringify({ id: request.id, result })}\n`);
    child.notify = (method, params) => child.stdout.write(`${JSON.stringify({ method, params })}\n`);
    child.exit = (signal = null) => { child.signalCode = signal; child.exitCode = signal ? null : 0; child.emit("exit", child.exitCode, signal); };
    child.kill = (signal) => { child.signals.push(signal); if (autoExit) queueMicrotask(() => child.exit(signal)); return true; };
    child.stdin.on("data", (chunk) => {
        const request = JSON.parse(chunk.toString());
        child.requests.push(request);
        if (onRequest(request, child)) return;
        const result = request.method === "thread/list" ? { data: [], nextCursor: null }
            : request.method === "thread/resume" ? { thread: { id: request.params.threadId, status: { type: "idle" } } } : {};
        queueMicrotask(() => child.respond(request, result));
    });
    return child;
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

test("Codex concurrent starts wait for the same initialization", async () => {
    const child = controlledProcess((request) => request.method === "initialize");
    let spawns = 0;
    const client = createCodexClient({ spawnProcess: () => { spawns++; return child; } });
    const first = client.start();
    const second = client.start();
    let initialized = false;
    second.then(() => { initialized = true; });
    try {
        await flush();
        assert.equal(initialized, false);
        assert.equal(spawns, 1);
        child.respond(child.requests[0], {});
        await Promise.all([first, second]);
    } finally {
        child.respond(child.requests[0], {});
        await Promise.allSettled([first, second]);
        await client.stop();
    }
});

test("Codex stop coalesces and a racing start survives old process exits", async () => {
    const old = controlledProcess(() => false, { autoExit: false });
    const replacement = controlledProcess();
    let spawns = 0;
    const statuses = [];
    const client = createCodexClient({ spawnProcess: () => (++spawns === 1 ? old : replacement), onStatus: (status) => statuses.push(status) });
    await client.start();
    const stopped = client.stop();
    const stoppedAgain = client.stop();
    const restarted = client.start();
    try {
        await flush();
        assert.equal(spawns, 1);
        old.exit("SIGTERM");
        await Promise.all([stopped, stoppedAgain, restarted]);
        assert.equal(spawns, 2);
        assert.equal(client.running, true);
        assert.deepEqual(old.signals, ["SIGTERM"]);
        old.emit("exit", 1, null);
        old.emit("error", new Error("late old error"));
        old.notify("thread/status/changed", { threadId: "unowned", status: { type: "active" } });
        assert.equal(client.running, true);
        assert.equal(statuses.at(-1).availability, "connected");
    } finally {
        old.exit("SIGTERM");
        await Promise.allSettled([stopped, stoppedAgain, restarted]);
        await client.stop();
    }
});

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

test("Codex archival and app-server runtime closure never manufacture session completion", async () => {
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
        assert.equal(events.some(({ event, state }) => event === "session-end" || state === "completed"), false);
        assert.equal(events.at(-1).state, "unknown");
    } finally {
        await client.stop();
    }
});

test("Codex pagination rejects repeated, cycling, and malformed cursors instead of partial success", async () => {
    for (const cursors of [["again", "again"], ["a", "b", "a"], [42], [""], [false], [undefined]]) {
        let page = 0;
        const client = createCodexClient({ spawnProcess: () => fakeProcess({ onRequest: () => ({ data: [{ id: `thread-${page}` }], nextCursor: cursors[page++] }) }) });
        await client.start();
        try {
            await assert.rejects(client.listThreads(), /cursor/i);
        } finally {
            await client.stop();
        }
    }
});

test("Codex pagination keeps the freshest duplicate without changing stable order", async () => {
    const client = createCodexClient({ spawnProcess: () => fakeProcess({ onRequest: ({ params }) => params.cursor
        ? { data: [{ id: "same", name: "Fresh", updatedAt: 300 }, { id: "other", name: "Stale", updatedAt: 50 }], nextCursor: null }
        : { data: [{ id: "same", name: "Old", updatedAt: 100 }, { id: "other", name: "Keep", updatedAt: 200 }], nextCursor: "next" } }) });
    await client.start();
    try {
        assert.deepEqual((await client.listThreads()).map(({ id, title }) => ({ id, title })), [{ id: "same", title: "Fresh" }, { id: "other", title: "Keep" }]);
    } finally {
        await client.stop();
    }
});

test("Codex discovery uses current resume identity metadata and freshest in-flight notifications", async () => {
    const events = [];
    const client = createCodexClient({
        spawnProcess: () => fakeProcess({
            onRequest: () => ({ data: [{ id: "child", name: "Old", status: { type: "notLoaded" }, sessionId: "old-session", agentNickname: "Old nickname", agentRole: "old-role", parentThreadId: "old-parent" }], nextCursor: null }),
            onResume: (msg, child) => {
                child.stdout.write(`${JSON.stringify({ method: "thread/status/changed", params: { threadId: msg.params.threadId, status: { type: "active", activeFlags: ["waitingOnUserInput"] } } })}\n`);
                return { thread: { id: "child", name: "Current", status: { type: "idle" }, sessionId: "session", agentNickname: "Scout", agentRole: "explorer", parentThreadId: "parent", turns: [{ text: "PRIVATE_TURN" }], preview: "PRIVATE_PREVIEW", path: "PRIVATE_PATH" } };
            },
        }),
        onEvent: (event) => events.push(event),
    });
    await client.start();
    try {
        const [thread] = await client.discoverThreads({ includeArchived: false });
        assert.deepEqual({ title: thread.title, sessionId: thread.sessionId, agentNickname: thread.agentNickname, agentRole: thread.agentRole, parentThreadId: thread.parentThreadId, status: thread.status }, {
            title: "Current", sessionId: "session", agentNickname: "Scout", agentRole: "explorer", parentThreadId: "parent", status: { type: "active", activeFlags: ["waitingOnUserInput"] },
        });
        assert.equal(events.at(-1).waitingReason, "input");
        assert.equal(JSON.stringify({ thread, events }).includes("PRIVATE"), false);
    } finally {
        await client.stop();
    }
});

test("Codex concurrent discoveries coalesce, bound subscriptions, and retain listing order", async () => {
    const ids = Array.from({ length: 13 }, (_, index) => `thread-${index}`);
    const outstanding = [];
    let maximum = 0;
    const child = controlledProcess((request, process) => {
        if (request.method === "thread/list") {
            queueMicrotask(() => process.respond(request, { data: ids.map((id) => ({ id, status: { type: "notLoaded" } })), nextCursor: null }));
            return true;
        }
        if (request.method !== "thread/resume") return false;
        outstanding.push(request);
        maximum = Math.max(maximum, outstanding.length);
        return true;
    });
    const client = createCodexClient({ spawnProcess: () => child });
    await client.start();
    const first = client.discoverThreads({ includeArchived: false });
    const second = client.discoverThreads({ includeArchived: false });
    try {
        await flush();
        assert.equal(child.requests.filter(({ method }) => method === "thread/list").length, 1);
        assert.equal(outstanding.length, 4);
        while (outstanding.length) {
            const batch = outstanding.splice(0).reverse();
            for (const request of batch) child.respond(request, { thread: { id: request.params.threadId, status: { type: "idle" } } });
            await flush();
        }
        const [a, b] = await Promise.all([first, second]);
        assert.equal(maximum, 4);
        assert.deepEqual(a.map(({ id }) => id), ids);
        assert.deepEqual(b, a);
        assert.equal(child.requests.filter(({ method }) => method === "thread/resume").length, 13);
    } finally {
        for (const request of outstanding) child.respond(request, { thread: { id: request.params.threadId } });
        await client.stop();
        await Promise.allSettled([first, second]);
    }
});

for (const respondBeforeStop of [false, true]) {
    test(`Codex stop cancels subscription workers and health publication (${respondBeforeStop ? "response queued" : "request pending"})`, async () => {
        const ids = Array.from({ length: 9 }, (_, index) => `thread-${index}`);
        const statuses = []; const events = []; const lifecycle = []; const turns = [];
        const child = controlledProcess((request, process) => {
            if (request.method === "thread/list") {
                queueMicrotask(() => process.respond(request, { data: ids.map((id) => ({ id })), nextCursor: null }));
                return true;
            }
            return request.method === "thread/resume" || request.method === "thread/unsubscribe";
        }, { autoExit: false });
        const client = createCodexClient({
            spawnProcess: () => child,
            onStatus: (status) => statuses.push(status), onEvent: (event) => events.push(event),
            onThreadLifecycle: (event) => lifecycle.push(event), onTurn: (turn) => turns.push(turn),
        });
        await client.start();
        const discovery = client.discoverThreads({ includeArchived: false }).then((value) => ({ value }), (error) => ({ error }));
        const queued = client.discoverThreads({ includeArchived: true }).then((value) => ({ value }), (error) => ({ error }));
        let stopped;
        try {
            await flush();
            const resumes = child.requests.filter(({ method }) => method === "thread/resume");
            assert.equal(resumes.length, 4);
            if (respondBeforeStop) {
                for (const request of resumes) child.respond(request, { thread: { id: request.params.threadId, status: { type: "idle" } } });
            }
            const statusCount = statuses.length;
            stopped = client.stop();
            child.notify("thread/status/changed", { threadId: ids[0], status: { type: "active" } });
            child.notify("turn/started", { threadId: ids[0], turn: { id: "late-turn" } });
            child.notify("thread/closed", { threadId: ids[0] });
            await flush();
            const result = await discovery;
            assert.match(result.error?.message ?? "", /stopped/i);
            assert.match((await queued).error?.message ?? "", /stopped/i);
            assert.equal(child.requests.filter(({ method }) => method === "thread/resume").length, 4);
            assert.equal(statuses.slice(statusCount).some(({ connected }) => connected), false);
            assert.deepEqual({ events, lifecycle, turns }, { events: [], lifecycle: [], turns: [] });
            assert.deepEqual(child.requests.filter(({ method }) => method === "thread/unsubscribe").map(({ params }) => params.threadId), ids.slice(0, 4));
        } finally {
            stopped ??= client.stop();
            for (const request of child.requests.filter(({ method }) => method === "thread/unsubscribe")) child.respond(request, {});
            await flush();
            child.exit("SIGTERM");
            await stopped;
            await Promise.all([discovery, queued]);
        }
    });
}

test("Codex fresh discovery replaces old notifications but retains notifications arriving during its list", async () => {
    let pendingList; let holdList = false;
    const child = controlledProcess((request, process) => {
        if (request.method !== "thread/list") return false;
        if (holdList) pendingList = request;
        else queueMicrotask(() => process.respond(request, { data: [{ id: "thread", status: { type: "idle" } }], nextCursor: null }));
        return true;
    });
    const client = createCodexClient({ spawnProcess: () => child });
    await client.start();
    try {
        await client.discoverThreads({ includeArchived: false });
        child.notify("thread/status/changed", { threadId: "thread", status: { type: "active", activeFlags: ["waitingOnApproval"] } });
        assert.deepEqual((await client.discoverThreads({ includeArchived: false }))[0].status, { type: "idle", activeFlags: [] });
        holdList = true;
        const discovery = client.discoverThreads({ includeArchived: false });
        await flush();
        child.notify("thread/status/changed", { threadId: "thread", status: { type: "active", activeFlags: ["waitingOnUserInput"] } });
        child.respond(pendingList, { data: [{ id: "thread", status: { type: "idle" } }], nextCursor: null });
        assert.deepEqual((await discovery)[0].status, { type: "active", activeFlags: ["waitingOnUserInput"] });
        holdList = false;
        assert.deepEqual((await client.discoverThreads({ includeArchived: false }))[0].status, { type: "idle", activeFlags: [] });
    } finally {
        await client.stop();
    }
});

test("Codex runtime closure permits rediscovery and resubscription without persisted session completion", async () => {
    const child = controlledProcess((request, process) => {
        if (request.method !== "thread/list") return false;
        queueMicrotask(() => process.respond(request, { data: [{ id: "thread", status: { type: "notLoaded" } }], nextCursor: null }));
        return true;
    });
    const events = []; const lifecycle = [];
    const client = createCodexClient({ spawnProcess: () => child, onEvent: (event) => events.push(event), onThreadLifecycle: (event) => lifecycle.push(event) });
    await client.start();
    try {
        await client.discoverThreads({ includeArchived: false });
        child.notify("thread/closed", { threadId: "thread" });
        child.notify("turn/started", { threadId: "thread", turn: { id: "not-subscribed" } });
        assert.equal(events.length, 1);
        assert.equal(events[0].state, "unknown");
        const [thread] = await client.discoverThreads({ includeArchived: false });
        assert.deepEqual(thread.status, { type: "idle", activeFlags: [] });
        assert.equal(thread.monitoring, "subscribed");
        assert.equal(child.requests.filter(({ method }) => method === "thread/resume").length, 2);
        assert.deepEqual(lifecycle.map(({ event }) => event), ["closed"]);
        assert.equal(events.some(({ event, state }) => event === "session-end" || state === "completed"), false);
    } finally {
        await client.stop();
    }
});

for (const framing of ["unterminated", "terminated", "trailing partial", "fragmented"]) {
    test(`Codex oversized ${framing} protocol line fails pending discovery and stops its process`, async () => {
        const statuses = [];
        const child = controlledProcess((request) => request.method === "thread/list");
        const replacement = controlledProcess();
        let spawns = 0;
        const client = createCodexClient({ spawnProcess: () => ++spawns === 1 ? child : replacement, onStatus: (status) => statuses.push(status) });
        await client.start();
        const discovery = client.discoverThreads({ includeArchived: false }).then((value) => ({ value }), (error) => ({ error }));
        try {
            await flush();
            const oversized = "x".repeat(1_000_001);
            if (framing === "fragmented") {
                child.stdout.write(oversized.slice(0, 700_000));
                child.stdout.write(oversized.slice(700_000));
            } else child.stdout.write(`${framing === "trailing partial" ? "{}\n" : ""}${oversized}${framing === "terminated" ? "\n" : ""}`);
            await flush();
            assert.equal(statuses.some(({ availability, error }) => availability === "unavailable" && /oversized/.test(error)), true);
            assert.deepEqual(child.signals, ["SIGTERM"]);
            assert.equal(client.running, false);
            assert.match((await discovery).error?.message ?? "", /oversized/i);
            const count = statuses.length;
            child.stdout.write(`\n${JSON.stringify({ id: child.requests.find(({ method }) => method === "thread/list").id, result: { data: [], nextCursor: null } })}\n`);
            assert.equal(statuses.length, count);
            await client.start();
            assert.deepEqual(await client.discoverThreads({ includeArchived: false }), []);
            assert.equal(client.running, true);
        } finally {
            await client.stop();
            await discovery;
        }
    });
}

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
