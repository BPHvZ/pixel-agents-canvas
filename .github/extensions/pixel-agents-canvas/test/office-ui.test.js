import test from "node:test";
import assert from "node:assert/strict";
import { parseOfficeState, parsePreferences } from "../src/office-client.js";
import { renderHtml } from "../src/renderer.js";
import { createOfficeWorld } from "../src/office-world.js";

export function pageFixture() {
    return {
        snapshot: {
            now: 1000,
            providers: [{ id: "Codex", source: "app-server", availability: "connected", enabled: true, detail: "Read-only discovery", observedAt: 900, capabilities: { discovery: "supported", agents: "unknown", navigation: "unsupported" } }],
            sessions: [{ id: "session", provider: "Codex", sourceId: "thread", title: "Review frontend accessibility", parentSessionId: "parent", archived: false, closed: false, endedAt: null }],
            agents: [{ id: "agent", sessionId: "session", provider: "Codex", sourceId: "source-agent", name: "Provider name", role: "Reported role", parentAgentId: "parent-agent", state: "waiting", waitingReason: "approval", connected: true, freshness: "stale", observedAt: 800, lastActivityAt: 700, ended: false, endedAt: null, lastTurnOutcome: "interrupted" }],
            feed: [{ id: 1, provider: "Codex", agentId: "agent", sessionId: "session", label: "Waiting for approval", at: 800 }],
        },
        preferences: { hideTitles: false, hiddenSessionTitles: { session: true }, showEnded: false, vignettes: true, dialogue: true, appearances: { agent: { nickname: "Local alias", palette: "#aabbcc", outfit: "vest", accessory: "glasses", deskProp: "plant" } } },
    };
}

function worldFixture() {
    const state = pageFixture();
    const world = createOfficeWorld({ clock: () => 1000 });
    world.update(state.snapshot, state.preferences);
    const view = world.view();
    view.props.push({ id: "prop", spaceId: "space:0", deskIndex: 0, kind: "paper", position: { x: 40, y: 80 }, createdAt: 900, cleanupSceneId: "scene", fictional: true });
    view.scenes.push({ id: "scene", templateId: "tidy", kind: "cleanup", label: "Office fiction: Tidying", participants: ["agent"], startedAt: 900, endsAt: 2000, fictional: true });
    view.dialogue.push({ id: "dialogue", agentId: "agent", flavor: "calm", label: "Persona flavor", text: "Decorative dialogue", startedAt: 900, endsAt: 2000, placement: "secondary", fictional: true });
    view.abandonedEffects.push({ id: "effect", clusterId: "cluster:session", spaceId: "space:0", kind: "ghost", label: "Office fiction: Ghost", position: { x: 0, y: 0 }, startedAt: 900, endsAt: 2000, fictional: true });
    return { ...state, world: view };
}

test("browser preserves the optional authoritative world read-model", () => {
    const state = worldFixture();
    assert.deepEqual(parseOfficeState(state), state);
    assert.equal("world" in parseOfficeState(pageFixture()), false);
});

test("browser rejects malformed supplied worlds instead of starting replacement fiction", () => {
    const cases = [
        { world: null }, { world: {} },
        { world: { ...worldFixture().world, now: NaN } },
        { world: { ...worldFixture().world, fictionLabel: "Provider collaboration" } },
        { world: { ...worldFixture().world, motion: { optional: true, reducedMotion: "static", flashing: true } } },
        { world: { ...worldFixture().world, props: "invalid" } },
    ];
    for (const patch of cases) assert.throws(() => parseOfficeState({ ...worldFixture(), ...patch }), /Invalid office world/);
    const collections = ["clusters", "characters", "props", "scenes", "dialogue", "abandonedEffects"];
    for (const collection of collections) {
        const state = worldFixture();
        state.world[collection].push(null);
        assert.throws(() => parseOfficeState(state), /Invalid office world/, collection);
    }
    for (const [collection, key, invalid] of [
        ["clusters", "position", { x: Infinity, y: 0 }], ["clusters", "provider", "Invented"],
        ["clusters", "motifs", [{ id: "motif", label: "Invalid", symbol: {} }]],
        ["characters", "appearance", { nickname: "Name", palette: "red; background:url(external)", outfit: "shirt", accessory: "none", deskProp: "none" }],
        ["characters", "state", "invented"], ["characters", "deskIndex", -1],
        ["characters", "pose", "invented"], ["characters", "voiceFlavor", "invented"],
        ["props", "kind", "invented"], ["props", "fictional", false],
        ["scenes", "participants", [null]], ["scenes", "kind", "invented"],
        ["dialogue", "placement", "primary"], ["dialogue", "text", {}],
        ["abandonedEffects", "kind", "rapid-flashing"], ["abandonedEffects", "endsAt", Infinity],
    ]) {
        const state = worldFixture();
        state.world[collection][0][key] = invalid;
        assert.throws(() => parseOfficeState(state), /Invalid office world/, `${collection}.${key}`);
    }
});

test("browser nickname normalization matches the stored 64-character limit", () => {
    const preferences = parsePreferences({ appearances: { agent: { nickname: "n".repeat(80) } } });
    assert.equal(preferences.appearances.agent.nickname, "n".repeat(64));
});

test("rich factual fields survive the unknown JSON boundary unchanged", () => {
    const fixture = pageFixture();
    assert.deepEqual(parseOfficeState(fixture), fixture);
    assert.throws(() => parseOfficeState(null), /Invalid office state/);
    assert.throws(() => parseOfficeState({ snapshot: { agents: [] } }), /Invalid office state/);
});

test("renderer uses JSON-only state and external same-origin module and stylesheet", () => {
    const fixture = pageFixture();
    fixture.snapshot.sessions[0].title = '</script><img src=x onerror="alert(1)">';
    const html = renderHtml({ instanceId: 'panel"<hostile>', state: fixture });
    assert.ok(html.includes('id="office-state" type="application/json"'));
    assert.ok(html.includes('type="module" src="/office-client.js"'));
    assert.ok(html.includes('href="/office.css"'));
    assert.equal(html.includes('<style>'), false);
    assert.equal(html.includes('<img src=x'), false);
    assert.equal(/<[^>]+\son\w+=/.test(html), false);
    const payload = html.match(/id="office-state" type="application\/json">([\s\S]*?)<\/script>/)?.[1];
    assert.deepEqual(JSON.parse(payload), fixture);
});

test("parser discards invalid entities and validates CSS without losing provider uncertainty", () => {
    const fixture = pageFixture();
    fixture.snapshot.agents.push({ ...fixture.snapshot.agents[0], id: "bad", state: "invented", freshness: "invented" });
    fixture.preferences.appearances.agent.palette = 'red; background:url(https://invalid)';
    const state = parseOfficeState(fixture);
    assert.equal(state.snapshot.agents[1].state, "unknown");
    assert.equal(state.snapshot.agents[1].freshness, "unknown");
    assert.match(state.preferences.appearances.agent.palette, /^#[0-9a-f]{6}$/i);
    assert.equal(state.snapshot.agents[0].lastTurnOutcome, "interrupted");
});
