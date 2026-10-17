import test from "node:test";
import assert from "node:assert/strict";
import { parseOfficeState } from "../src/office-client.js";

const session = { kind: "session", id: "codex:one", provider: "Codex", name: "Refactor", state: "idle", color: "#f2a65a", connected: true };

test("browser validates unknown JSON and discards invalid cards", () => {
    assert.throws(() => parseOfficeState(null), /Invalid office state/);
    assert.throws(() => parseOfficeState({ agents: "invalid" }), /Invalid office state/);
    assert.equal(parseOfficeState({ agents: [null, { id: "incomplete" }, session] }).length, 1);
});

test("browser normalizes unknown state and refuses untrusted CSS values", () => {
    const [card] = parseOfficeState({ agents: [{ ...session, state: "invented", color: 'red; background:url("external")', connected: "true" }] });
    assert.equal(card.state, "unknown");
    assert.equal(card.color, "#a5b2af");
    assert.equal(card.connected, false);
});
