import test from "node:test";
import assert from "node:assert/strict";
import { renderHtml } from "../src/renderer.js";

test("renderer embeds session state without allowing provider titles to escape the script element", () => {
    const title = "</script><img src=x onerror=alert(1)>";
    const html = renderHtml({
        instanceId: "office-test",
        agents: [{ kind: "session", id: "codex-session-1", name: title, provider: "Codex", role: "Codex session", state: "idle", task: title, color: "#f2a65a", connected: true, updatedAt: "2026-10-17T12:00:00.000Z" }],
        codexStatus: { availability: "connected", connected: true, error: "", sessionCount: 1, archivedCount: 0 },
    });

    assert.ok(html.includes("office-test"));
    assert.equal(html.includes(title), false);
    assert.ok(html.includes("\\u003c/script>"));
    assert.ok(html.includes("id=\"agent-layer\""));
    assert.ok(html.includes("office-agent-name"));
    assert.ok(html.includes('type="application/json"'));
    assert.ok(html.includes('src="/office-client.js"'));
});
