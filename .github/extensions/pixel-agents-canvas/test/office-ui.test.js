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
    view.actors = [];
    view.props.push({ id: "prop", spaceId: "space:0", deskIndex: 0, kind: "paper", position: { x: 40, y: 80 }, location: { kind: "desk", spaceId: "space:0", deskIndex: 0, position: { x: 40, y: 80 } }, createdAt: 900, cleanupSceneId: "scene", fictional: true });
    view.props.push({ id: "zone-prop", kind: "mug", location: { kind: "zone", zoneId: "common-table", slot: 0 }, createdAt: 900, cleanupSceneId: null, fictional: true });
    view.scenes.push({ id: "scene", templateId: "tidy", kind: "cleanup", label: "Office fiction: Tidying", participants: ["agent"], route: [{ kind: "zone", zoneId: "common-table" }], phase: "walking", startedAt: 900, endsAt: 2000, fictional: true });
    view.actors.push({ id: "spider", kind: "spider", spaceId: "space:0", position: { x: 60, y: 70 }, route: [{ x: 80, y: 70 }], startedAt: 900, endsAt: 2000, fictional: true });
    view.actors.push({ id: "ghost", kind: "ghost", clusterId: "cluster:session", spaceId: "space:0", position: { x: 100, y: 230 }, route: [{ x: 100, y: 230 }, { x: 200, y: 230 }], startedAt: 900, endsAt: 2000, fictional: true });
    view.dialogue.push({ id: "dialogue", agentId: "agent", flavor: "calm", label: "Persona flavor", text: "Decorative dialogue", startedAt: 900, endsAt: 2000, placement: "secondary", fictional: true });
    view.abandonedEffects.push({ id: "effect", clusterId: "cluster:session", spaceId: "space:0", kind: "ghost", label: "Office fiction: Ghost", position: { x: 0, y: 0 }, startedAt: 900, endsAt: 2000, fictional: true });
    view.quietEffects.push({ id: "quiet-effect", clusterId: "cluster:session", spaceId: "space:0", kind: "spider", label: "Office fiction: A tiny spider", position: { x: 20, y: 30 }, startedAt: 900, endsAt: 2000, fictional: true });
    return { ...state, world: view };
}

test("browser preserves semantic world routes, actors, and shared-zone props", () => {
    const state = worldFixture();
    assert.deepEqual(parseOfficeState(state), state);
    for (const zoneId of ["common-table", "coffee-station", "plant-corner", "bookshelf", "window"]) {
        const zoneState = worldFixture();
        zoneState.world.props[1].location.zoneId = zoneId;
        zoneState.world.scenes[0].route[0].zoneId = zoneId;
        assert.deepEqual(parseOfficeState(zoneState), zoneState, zoneId);
    }
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
    const collections = ["clusters", "characters", "props", "scenes", "dialogue", "abandonedEffects", "quietEffects", "actors"];
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
        ["props", "kind", "invented"], ["props", "fictional", false], ["props", "location", { kind: "zone", zoneId: "unknown", slot: -1 }],
        ["scenes", "participants", [null]], ["scenes", "kind", "invented"], ["scenes", "phase", "teleporting"], ["scenes", "route", [{ kind: "zone", zoneId: "unknown" }]],
        ["actors", "kind", "ghost"], ["actors", "route", [{ x: Infinity, y: 0 }]],
        ["dialogue", "placement", "primary"], ["dialogue", "text", {}],
        ["abandonedEffects", "kind", "rapid-flashing"], ["abandonedEffects", "endsAt", Infinity],
        ["quietEffects", "kind", "invented"], ["quietEffects", "endsAt", Infinity],
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

test("renderer uses JSON-only state, external assets, and stable instance-seeded layout", () => {
    const fixture = pageFixture();
    fixture.snapshot.sessions[0].title = '</script><img src=x onerror="alert(1)">';
    const html = renderHtml({ instanceId: 'panel"<hostile>', state: fixture });
    assert.ok(html.includes('id="office-state" type="application/json"'));
    assert.ok(html.includes('type="module" src="/office-client.js"'));
    assert.ok(html.includes('href="/office.css"'));
    assert.ok(html.includes('/assets/common-table.svg'));
    assert.ok(html.includes('/assets/coffee-station.svg'));
    const layout = html.match(/class="office-floor (layout-\d)"/)?.[1];
    assert.ok(layout);
    assert.ok(renderHtml({ instanceId: 'panel"<hostile>', state: fixture }).includes(`class="office-floor ${layout}"`));
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

test("ended visibility defaults on but explicit user preference is preserved", () => {
    assert.equal(parsePreferences({}).showEnded, true);
    assert.equal(parsePreferences({ showEnded: false }).showEnded, false);
    assert.equal(parsePreferences({ showEnded: true }).showEnded, true);
});

test("renderer keeps product and fiction explanations out of visible copy", () => {
    const html = renderHtml({ instanceId: "copy-regression", state: pageFixture() });
    for (const phrase of [
        "Read-only dashboard", "Office decor &amp; scenes are fiction", "A fictional little office",
        "A little space for big ideas", "Facts, not office fiction", "Real signals. A fictional little office.",
    ]) assert.equal(html.includes(phrase), false, phrase);
    assert.match(html, /<details id="coverage"/);
    assert.match(html, /id="show-ended"/);
});
