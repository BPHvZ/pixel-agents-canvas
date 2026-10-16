import test from "node:test";
import assert from "node:assert/strict";
import { createStore, genericCopilotLabel } from "../src/state.js";

test("Copilot labels do not retain event content", () => {
    assert.equal(genericCopilotLabel("prompt-submitted"), "Working on a request");
    assert.equal(genericCopilotLabel("unknown"), "Activity updated");
});

test("store accepts only normalized, bounded metadata and expires stale activity", () => {
    let time = 100_000;
    const store = createStore({ clock: () => time, staleAfterMs: 100 });
    const received = [];
    store.subscribe((agent) => received.push(agent));
    store.upsert({ id: "copilot:session", provider: "Copilot", state: "working", task: "x".repeat(200), at: time });
    assert.equal(store.get("copilot:session").task.length, 100);
    assert.equal(store.get("copilot:session").state, "working");
    time += 101;
    const [agent] = store.list();
    assert.equal(agent.state, "unknown");
    assert.equal(agent.connected, false);
    assert.equal(agent.task, "No recent activity");
    assert.equal(received.at(-1).state, "unknown");
});

test("store rejects malformed identities and normalizes unknown states", () => {
    const store = createStore();
    assert.equal(store.upsert({ id: "", provider: "Codex" }), null);
    store.upsert({ id: "codex:t", provider: "Codex", state: "pretend", task: 42 });
    assert.equal(store.get("codex:t").state, "unknown");
    assert.equal(store.get("codex:t").task, "");
});
