import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { createCodexClient } from "../src/codex-client.js";

function fakeProcess() {
    const child = new EventEmitter();
    child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
    child.exitCode = null; child.signalCode = null;
    child.stdin.on("data", (chunk) => {
        const msg = JSON.parse(chunk.toString());
        if (msg.id == null) return;
        let result = {};
        if (msg.method === "initialize") result = { userAgent: "fixture" };
        if (msg.method === "thread/start") result = { thread: { id: "thread-owned", status: { type: "idle" } } };
        queueMicrotask(() => child.stdout.write(`${JSON.stringify({ id: msg.id, result })}\n`));
    });
    child.kill = (signal) => { child.signalCode = signal; queueMicrotask(() => child.emit("exit", null, signal)); };
    return child;
}

test("Codex client initializes without an initialized notification and only emits owned thread metadata", async () => {
    const events = []; const statuses = []; let child;
    const client = createCodexClient({ spawnProcess: () => (child = fakeProcess()), onEvent: (event) => events.push(event), onStatus: (status) => statuses.push(status) });
    await client.start();
    assert.equal(client.running, true);
    assert.deepEqual(statuses.at(-1), { connected: true, error: "" });
    const { threadId } = await client.startThread();
    assert.equal(threadId, "thread-owned");
    child.stdout.write(`${JSON.stringify({ method: "turn/started", params: { threadId: "unowned", turn: { id: "private" } } })}\n`);
    child.stdout.write(`${JSON.stringify({ method: "turn/started", params: { threadId, turn: { id: "turn-1" } } })}\n`);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(events.length, 2);
    assert.equal(events[1].state, "working");
    assert.equal(JSON.stringify(events).includes("private"), false);
    await client.stop();
    assert.equal(client.running, false);
});
