import assert from "node:assert/strict";
import test from "node:test";
import { createOfficeWorld, deterministicAppearance, deriveMotifs } from "../src/office-world.js";
import { createOfficeState } from "../src/office-state.js";

/** @returns {import('../src/product-types.js').OfficeSession} */
function session(id = "s1", overrides = {}) {
    return { id, provider: "Codex", sourceId: id, title: "Testing frontend", parentSessionId: null, archived: false, closed: false, endedAt: null, ...overrides };
}
/** @returns {import('../src/product-types.js').OfficeAgent} */
function agent(id = "a1", sessionId = "s1", overrides = {}) {
    return { id, sessionId, provider: "Codex", sourceId: id, name: "Provider name", role: "Provider role", parentAgentId: null, state: "idle", waitingReason: null, connected: true, freshness: "fresh", observedAt: 0, lastActivityAt: 0, ended: false, endedAt: null, lastTurnOutcome: null, ...overrides };
}
/** @returns {import('../src/product-types.js').Preferences} */
function preferences(overrides = {}) {
    return { hideTitles: false, hiddenSessionTitles: {}, showEnded: true, vignettes: true, dialogue: true, appearances: {}, ...overrides };
}
/** @returns {import('../src/product-types.js').OfficeSnapshot} */
function snapshot(agents = [agent()], sessions = [session()]) {
    return { providers: [], agents, sessions, feed: [{ id: 1, provider: "Codex", agentId: "a1", sessionId: "s1", label: "Idle", at: 0 }], now: 0 };
}
function harness(random = () => 0) {
    let now = 0;
    const world = createOfficeWorld({ clock: () => now, random });
    return { world, at(time) { now = time; world.tick(); } };
}

test("projects provider facts with deterministic editable looks without sharing mutable input or output", () => {
    const h = harness();
    const facts = snapshot();
    const settings = preferences();
    const original = structuredClone(facts);
    h.world.update(facts, settings);
    const view = h.world.view();
    assert.equal(view.characters[0].state, "idle");
    assert.equal(view.characters[0].providerName, "Provider name");
    assert.deepEqual(view.characters[0].position, view.characters[0].deskPosition);
    assert.deepEqual(view.characters[0].appearance, deterministicAppearance("a1"));
    assert.equal(deterministicAppearance("a1").nickname, "");
    assert.deepEqual(deterministicAppearance("a1"), deterministicAppearance("a1"));
    assert.ok(new Set(Array.from({ length: 30 }, (_, i) => JSON.stringify(deterministicAppearance(`agent${i}`)))).size > 5);
    settings.appearances.a1 = { ...deterministicAppearance("a1"), nickname: "Local alias", outfit: "vest" };
    h.world.update(facts, settings);
    assert.equal(h.world.view().characters[0].appearance.nickname, "Local alias");
    view.characters[0].appearance.nickname = "Changed outside";
    facts.agents[0].name = "Changed input";
    assert.equal(h.world.view().characters[0].providerName, "Provider name");
    facts.agents[0].name = "Provider name";
    assert.deepEqual(facts, original);
    assert.deepEqual(deriveMotifs(null), []);
});

test("idle characters share fictional cross-session scenes on a 10–30 second nonrepeating cycle", () => {
    const h = harness();
    const facts = snapshot([agent(), agent("a2", "s2"), agent("busy", "s2", { state: "working" })], [session(), session("s2")]);
    const before = structuredClone(facts);
    h.world.update(facts, preferences());
    h.at(9999);
    assert.equal(h.world.view().scenes.length, 0);
    const cycle = [];
    for (let i = 1; i <= 16; i++) {
        h.at(i * 10000);
        const view = h.world.view();
        const scene = view.scenes[0];
        assert.ok(scene, "eligible agents start a scene without a model turn");
        assert.equal(scene.fictional, true);
        assert.deepEqual(scene.participants.slice().sort(), ["a1", "a2"]);
        assert.match(view.fictionLabel, /not provider activity or collaboration/);
        const busy = view.characters.find((character) => character.id === "busy");
        assert.equal(busy.pose, "focused");
        assert.deepEqual(busy.position, busy.deskPosition);
        cycle.push(scene.templateId);
        h.at(i * 10000 + 4000);
        assert.equal(h.world.view().scenes.length, 0);
    }
    assert.equal(new Set(cycle.slice(0, 8)).size, 8);
    assert.equal(new Set(cycle.slice(8)).size, 8);
    assert.notEqual(cycle[7], cycle[8]);
    assert.deepEqual(facts, before);
    const slow = harness(() => 1);
    slow.world.update(snapshot(), preferences());
    slow.at(29999);
    assert.equal(slow.world.view().scenes.length, 0);
    slow.at(30000);
    assert.equal(slow.world.view().scenes.length, 1);
});

test("real work or incompatible participant facts immediately dismiss the entire scene and return desks", () => {
    for (const change of [{ state: "working" }, { state: "waiting", waitingReason: "approval" }, { state: "failed" }, { state: "unknown" }, { freshness: "stale" }, { connected: false }]) {
        const h = harness();
        h.world.update(snapshot([agent(), agent("a2", "s2")], [session(), session("s2")]), preferences());
        h.at(10000);
        assert.equal(h.world.view().scenes.length, 1);
        h.world.update(snapshot([agent("a1", "s1", change), agent("a2", "s2")], [session(), session("s2")]), preferences());
        assert.equal(h.world.view().scenes.length, 0);
        for (const character of h.world.view().characters) assert.deepEqual(character.position, character.deskPosition);
    }
});

test("unknown, stale and disconnected agents get solo fiction while active work stays desk-centered", () => {
    for (const change of [{ state: "unknown" }, { freshness: "stale" }, { freshness: "unknown" }, { connected: false }]) {
        const h = harness();
        const facts = snapshot([agent("a1", "s1", change)]);
        const before = structuredClone(facts);
        h.world.update(facts, preferences());
        h.at(10000);
        const view = h.world.view();
        assert.equal(view.scenes.length, 1);
        assert.deepEqual(view.scenes[0].participants, ["a1"]);
        const character = view.characters[0];
        assert.equal(character.state, change.state ?? "idle");
        assert.equal(character.freshness, change.freshness ?? "fresh");
        assert.equal(character.connected, change.connected ?? true);
        assert.notEqual(character.pose, "focused");
        assert.deepEqual(facts, before);
    }
    for (const change of [{ state: "working" }, { state: "completed" }, { state: "failed" }, { state: "waiting" }]) {
        const h = harness();
        h.world.update(snapshot([agent("a1", "s1", change)]), preferences());
        h.at(100000);
        assert.equal(h.world.view().scenes.length, 0);
    }
    const h = harness();
    h.world.update(snapshot(), preferences());
    h.world.update(snapshot([]), preferences());
    h.at(10000);
    assert.equal(h.world.view().characters[0].observed, false);
    assert.equal(h.world.view().scenes.length, 0);
});

test("props persist across facts and interruptions, and an idle agent can visibly clean another cluster", () => {
    const h = harness();
    h.world.update(snapshot(), preferences());
    h.at(10000);
    const prop = h.world.view().props[0];
    assert.ok(prop, "coffee leaves a persistent prop");
    h.world.update(snapshot([agent("a1", "s1", { state: "working" })]), preferences());
    h.at(60000);
    assert.ok(h.world.view().props.some((item) => item.id === prop.id));
    h.world.update(snapshot([agent("a1", "s1", { state: "working" }), agent("a2", "s2")], [session(), session("s2")]), preferences());
    let cleanup;
    for (let time = 70000; time <= 150000; time += 10000) {
        h.at(time);
        cleanup = h.world.view().scenes.find((scene) => scene.kind === "cleanup");
        if (cleanup) break;
        h.at(time + 4000);
    }
    assert.ok(cleanup, "tidying is part of the authored cycle");
    assert.deepEqual(cleanup.participants, ["a2"]);
    const target = h.world.view().props.find((item) => item.cleanupSceneId === cleanup.id);
    assert.equal(target.id, prop.id);
    assert.deepEqual(h.world.view().characters.find((character) => character.id === "a2").position, target.position);
    h.at(cleanup.endsAt - 1);
    assert.ok(h.world.view().props.some((item) => item.id === target.id));
    h.at(cleanup.endsAt);
    assert.ok(!h.world.view().props.some((item) => item.id === target.id));
});

test("an arriving working character may visibly set up only its own reused dirty desk once", () => {
    const h = harness();
    h.world.update(snapshot(), preferences());
    h.at(10000);
    h.at(14000);
    const original = h.world.view();
    assert.ok(original.props.some((prop) => prop.deskIndex === 0));
    const newcomer = agent("new", "s2", { state: "working" });
    const facts = snapshot([agent("a1", "s1", { ended: true }), newcomer], [session("s1", { closed: true, endedAt: 14000 }), session("s2", { title: "Backend APIs" })]);
    const before = structuredClone(facts);
    h.world.update(facts, preferences());
    const view = h.world.view();
    const setup = view.scenes.find((scene) => scene.kind === "desk-setup");
    const arriving = view.characters.find((character) => character.id === "new");
    assert.equal(setup.label, "Setting up desk (office fiction)");
    assert.deepEqual(setup.participants, ["new"]);
    assert.equal(arriving.state, "working");
    assert.equal(arriving.statusLabel, "working");
    assert.equal(arriving.deskId, original.characters[0].deskId);
    h.world.update(facts, preferences());
    assert.equal(h.world.view().scenes.find((scene) => scene.kind === "desk-setup").id, setup.id);
    h.at(setup.endsAt);
    assert.equal(h.world.view().props.length, 0);
    assert.equal(h.world.view().scenes.length, 0);
    assert.deepEqual(facts, before);
});

test("only explicit session closure plus explicit agent exits abandons, dims and haunts a space", () => {
    const h = harness();
    for (const change of [{ state: "completed" }, { state: "failed" }, { freshness: "stale" }, { connected: false }]) {
        h.world.update(snapshot([agent("a1", "s1", change)], [session("s1", { archived: true })]), preferences());
        assert.equal(h.world.view().clusters[0].abandoned, false);
        assert.equal(h.world.view().characters.length, 1);
    }
    h.world.update(snapshot([], [session("s1", { closed: true, endedAt: 20 })]), preferences());
    assert.equal(h.world.view().clusters[0].abandoned, false, "absence is not an agent-end signal");
    assert.equal(h.world.view().abandonedEffects.length, 0, "only explicitly abandoned clusters receive abandoned effects");
    h.world.update(snapshot([agent("a1", "s1", { ended: true })], [session("s1", { closed: true, endedAt: 20 })]), preferences());
    const ended = h.world.view().clusters[0];
    assert.equal(ended.abandoned, true);
    assert.equal(ended.dimmed, true);
    assert.equal(ended.title, null);
    assert.deepEqual(ended.motifs, []);
    assert.equal(ended.endedAt, 20);
    assert.equal(ended.statusLabel, "Session ended");
    const endedCharacter = h.world.view().characters[0];
    assert.equal(endedCharacter.ended, true);
    assert.equal(endedCharacter.state, "idle");
    assert.equal(endedCharacter.statusLabel, "Ended");
    assert.notEqual(endedCharacter.statusLabel, "working");
    assert.equal(endedCharacter.pose, "rest");
    assert.notDeepEqual(endedCharacter.position, endedCharacter.deskPosition, "ended agents spend off-duty time in the common area");
    const cycle = [];
    for (let i = 1; i <= 8; i++) {
        h.at(i * 10000);
        const effect = h.world.view().abandonedEffects[0];
        assert.ok(effect);
        cycle.push(effect.kind);
        h.at(i * 10000 + 4000);
        assert.equal(h.world.view().abandonedEffects.length, 0);
    }
    assert.equal(new Set(cycle.slice(0, 4)).size, 4);
    assert.equal(new Set(cycle.slice(4)).size, 4);
    assert.ok(h.world.view().props.some((prop) => prop.kind === "web"));
    h.world.update(snapshot([agent("a1", "s1", { state: "working" })], [session("s1", { title: "Debugging mobile" })]), preferences());
    const returned = h.world.view().clusters[0];
    assert.equal(returned.id, ended.id);
    assert.equal(returned.spaceId, ended.spaceId);
    assert.equal(returned.dimmed, false);
    assert.equal(returned.title, "Debugging mobile");
    assert.equal(h.world.view().abandonedEffects.length, 0);
    assert.ok(h.world.view().props.some((prop) => prop.kind === "web"), "restoring never silently clears physical props");
});

test("ended characters remain visible and join only explicit idle or ended company", () => {
    const h = harness();
    const participants = [agent("ended", "s1", { state: "working", ended: true, endedAt: 20 }), agent("idle", "s2")];
    const facts = snapshot(participants, [session("s1"), session("s2")]);
    const closedFacts = snapshot(participants, [session("s1", { closed: true, endedAt: 20 }), session("s2")]);
    h.world.update(facts, preferences());
    h.world.update(closedFacts, preferences());
    h.at(10000);
    const view = h.world.view();
    const ended = view.characters.find((character) => character.id === "ended");
    const scene = view.scenes[0];
    assert.equal(ended.ended, true);
    assert.equal(ended.endedAt, 20);
    assert.equal(ended.statusLabel, "Ended");
    assert.equal(ended.pose, "vignette");
    assert.deepEqual(scene.participants, ["ended", "idle"]);
    assert.equal(view.clusters.find((cluster) => cluster.sessionId === "s1").statusLabel, "Session ended");
    h.world.update(closedFacts, preferences({ showEnded: false }));
    const hidden = h.world.view();
    assert.equal(hidden.characters.some((character) => character.id === "ended"), false);
    assert.equal(hidden.clusters.find((cluster) => cluster.sessionId === "s1").visible, true);
    assert.equal(hidden.clusters.find((cluster) => cluster.sessionId === "s1").statusLabel, "Session ended");
});

test("ended solo scenes are gentle off-duty walks and never present the ended agent as working", () => {
    const h = harness();
    h.world.update(snapshot([agent("ended", "s1", { state: "working", ended: true })], [session("s1", { closed: true })]), preferences());
    const resting = h.world.view().characters[0];
    assert.equal(resting.statusLabel, "Ended");
    assert.notDeepEqual(resting.position, resting.deskPosition);
    h.at(10000);
    const view = h.world.view();
    const endedScene = view.scenes[0];
    const character = view.characters[0];
    assert.equal(endedScene.participants[0], "ended");
    assert.match(endedScene.templateId, /^off-duty-/);
    assert.match(endedScene.label, /gentle|quiet stroll/i);
    assert.equal(character.state, "working");
    assert.equal(character.statusLabel, "Ended");
    assert.notDeepEqual(character.position, character.deskPosition);
});

test("local title motifs cover all twenty work types and ten domains with bounded high-confidence matches", () => {
    const examples = [
        ["Implement feature", "work:implementation"], ["Debug bug", "work:debugging"], ["Refactor modules", "work:refactoring"],
        ["Review changes", "work:review"], ["Testing suite", "work:testing"], ["Documentation guide", "work:docs"],
        ["Design prototype", "work:design"], ["Research findings", "work:research"], ["Planning roadmap", "work:planning"],
        ["Performance latency", "work:performance"], ["Accessibility keyboard", "work:accessibility"], ["Security audit", "work:security"],
        ["Data schema", "work:data-schema"], ["API endpoints", "work:apis"], ["Dependency updates", "work:dependencies"],
        ["CI build pipeline", "work:ci-build"], ["Release version", "work:release"], ["Migration upgrade", "work:migration"],
        ["Cleanup unused", "work:cleanup"], ["Configuration settings", "work:configuration"],
        ["Frontend React", "domain:frontend"], ["Backend server", "domain:backend"], ["Storage database", "domain:storage"],
        ["API GraphQL", "domain:apis"], ["Mobile iOS", "domain:mobile"], ["Desktop Electron", "domain:desktop"],
        ["Cloud infra", "domain:cloud-infra"], ["CLI tooling", "domain:cli-tooling"], ["ML AI", "domain:ml-ai"], ["Graphics games", "domain:graphics-games"],
    ];
    for (const [title, id] of examples) {
        assert.ok(deriveMotifs(title).some((motif) => motif.id === id), title);
        assert.deepEqual(deriveMotifs(title), deriveMotifs(title));
    }
    const motifs = deriveMotifs("Debug testing review implementation frontend backend storage mobile");
    assert.equal(motifs.length, 4);
    assert.equal(motifs.filter((motif) => motif.id.startsWith("work:")).length, 2);
    assert.equal(motifs.filter((motif) => motif.id.startsWith("domain:")).length, 2);
    for (const motif of motifs) assert.deepEqual(Object.keys(motif).sort(), ["id", "label", "symbol"]);
    assert.deepEqual(deriveMotifs("Private project Sunflower"), []);
    assert.deepEqual(deriveMotifs("Contest of chairs and storageous cupboard"), []);
});

test("title hiding is independent of motifs; ended and reused spaces never inherit previous session context", () => {
    const h = harness();
    const facts = snapshot([agent("a1", "s1", { state: "working" })]);
    h.world.update(facts, preferences({ hideTitles: true }));
    const hidden = h.world.view().clusters[0];
    assert.equal(hidden.title, null);
    assert.equal(hidden.titleHidden, true);
    assert.equal(hidden.abandoned, false);
    assert.equal(hidden.quiet, false);
    assert.equal(hidden.dimmed, false);
    assert.ok(hidden.motifs.length > 0);
    assert.match(hidden.titleVisibilityNote, /does not hide title-derived motifs/);
    h.world.update(facts, preferences({ hiddenSessionTitles: { s1: true } }));
    assert.equal(h.world.view().clusters[0].title, null);
    h.world.update(snapshot([agent("a1", "s1", { ended: true })], [session("s1", { closed: true, endedAt: 0 })]), preferences());
    h.world.update(snapshot([agent("new", "s2", { state: "working" })], [session("s2", { title: "Mobile debugging" })]), preferences());
    const replacement = h.world.view().clusters.find((cluster) => cluster.sessionId === "s2");
    assert.notEqual(replacement.id, hidden.id);
    assert.equal(replacement.spaceId, hidden.spaceId);
    assert.equal(replacement.title, "Mobile debugging");
    assert.ok(replacement.motifs.some((motif) => motif.id === "domain:mobile"));
    assert.ok(!replacement.motifs.some((motif) => motif.id === "domain:frontend"));
    const retired = h.world.view().clusters.find((cluster) => cluster.sessionId === "s1");
    assert.equal(retired.visible, true, "ended characters remain visible when another session reuses the space");
    assert.equal(retired.title, null);
    assert.deepEqual(retired.motifs, []);
    assert.ok(h.world.view().characters.some((character) => character.id === "a1" && character.ended));
});

test("quiet clusters hide session title motifs without changing facts and restore immediately for fresh attention", () => {
    for (const change of [{ state: "unknown" }, { state: "working", freshness: "stale" }, { state: "failed", connected: false, freshness: "stale" }, { state: "working", ended: true, endedAt: 120 }]) {
        const h = harness();
        const initial = snapshot();
        h.world.update(initial, preferences());
        h.at(10000);
        h.at(14000);
        const quietFacts = snapshot([agent("a1", "s1", change)]);
        const before = structuredClone(quietFacts);
        h.world.update(quietFacts, preferences());
        const quiet = h.world.view();
        const cluster = quiet.clusters[0];
        assert.equal(cluster.quiet, true);
        assert.equal(cluster.abandoned, false);
        assert.equal(cluster.dimmed, true);
        assert.equal(cluster.title, null);
        assert.equal(cluster.titleHidden, true);
        assert.deepEqual(cluster.motifs, []);
        assert.equal(cluster.statusLabel, "Session");
        assert.equal(quiet.characters[0].state, change.state);
        assert.equal(quiet.characters[0].freshness, change.freshness ?? "fresh");
        assert.equal(quiet.characters[0].connected, change.connected ?? true);
        assert.ok(quiet.props.length > 0);
        assert.deepEqual(quietFacts, before);

        const active = snapshot([agent("a1", "s1", { state: "working" })]);
        h.world.update(active, preferences());
        const restored = h.world.view();
        assert.equal(restored.clusters[0].quiet, false);
        assert.equal(restored.clusters[0].dimmed, false);
        assert.equal(restored.clusters[0].title, "Testing frontend");
        assert.equal(restored.clusters[0].titleHidden, false);
        assert.ok(restored.clusters[0].motifs.length > 0);
        assert.equal(restored.clusters[0].statusLabel, "Session");
        assert.equal(restored.characters[0].statusLabel, "working");
        assert.ok(restored.props.length > 0);
    }
});

test("quiet clusters retain light for fresh working, waiting or failed agents and cycle spooky fiction every 10–30 seconds", () => {
    for (const state of ["working", "waiting", "failed"]) {
        const h = harness();
        h.world.update(snapshot([agent("a1", "s1", { state })]), preferences());
        assert.equal(h.world.view().clusters[0].quiet, false);
        assert.equal(h.world.view().clusters[0].dimmed, false);
        assert.equal(h.world.view().clusters[0].title, "Testing frontend");
        assert.ok(h.world.view().clusters[0].motifs.length > 0);
    }
    const h = harness();
    h.world.update(snapshot([agent("a1", "s1", { state: "unknown" })]), preferences());
    h.at(9999);
    assert.equal(h.world.view().abandonedEffects.length, 0);
    h.at(10000);
    const first = h.world.view().quietEffects.find((effect) => effect.clusterId === "cluster:s1");
    assert.ok(first);
    assert.deepEqual(Object.keys(first).sort(), ["clusterId", "endsAt", "fictional", "id", "kind", "label", "position", "spaceId", "startedAt"]);
    assert.equal(first.fictional, true);
    assert.equal(h.world.view().abandonedEffects.length, 0);
    assert.equal(h.world.view().clusters[0].statusLabel, "Session");
    assert.equal(h.world.view().clusters[0].abandoned, false);
    h.at(14000);
    assert.equal(h.world.view().quietEffects.length, 0);
    h.at(19999);
    assert.equal(h.world.view().quietEffects.length, 0);
    h.at(20000);
    const second = h.world.view().quietEffects.find((effect) => effect.clusterId === "cluster:s1");
    assert.ok(second);
    assert.notEqual(second.kind, first.kind);
    const slow = harness(() => 1);
    slow.world.update(snapshot([agent("a1", "s1", { state: "unknown" })]), preferences());
    slow.at(29999);
    assert.equal(slow.world.view().quietEffects.length, 0);
    slow.at(30000);
    assert.equal(slow.world.view().quietEffects.length, 1);
});

test("only fresh connected idle and explicitly ended characters can share scenes", () => {
    const h = harness();
    const facts = snapshot([
        agent("stale", "s1", { freshness: "stale" }),
        agent("idle-1", "s1"),
        agent("unknown", "s1", { state: "unknown" }),
        agent("idle-2", "s2"),
        agent("offline", "s2", { connected: false }),
        agent("working", "s2", { state: "working" }),
    ], [session(), session("s2")]);
    h.world.update(facts, preferences());
    h.at(10000);
    const scenes = h.world.view().scenes;
    for (const scene of scenes) {
        const participants = scene.participants;
        assert.ok(!participants.includes("stale"));
        assert.ok(!participants.includes("unknown"));
        assert.ok(!participants.includes("offline"));
        assert.ok(!participants.includes("working"));
        if (participants.length > 1) assert.deepEqual(participants.slice().sort(), ["idle-1", "idle-2"]);
    }
    h.at(14000);
    h.at(20000);
    assert.equal(h.world.view().scenes[0].participants.length, 1);
    assert.ok(["stale", "unknown", "offline"].includes(h.world.view().scenes[0].participants[0]), "noneligible characters receive solo scenes rather than joining idle groups");
    assert.deepEqual(h.world.view().characters.find((character) => character.id === "working").position,
        h.world.view().characters.find((character) => character.id === "working").deskPosition);

    const solo = harness();
    solo.world.update(snapshot([
        agent("unknown", "s1", { state: "unknown" }),
        agent("stale", "s1", { freshness: "stale" }),
        agent("offline", "s1", { connected: false }),
    ]), preferences());
    solo.at(10000);
    const scene = solo.world.view().scenes[0];
    assert.ok(scene);
    assert.equal(scene.participants.length, 1);
});

test("disconnected working characters keep their factual badge and stay desk-centered during solo fiction", () => {
    const h = harness();
    h.world.update(snapshot([agent("a1", "s1", { state: "working", connected: false })]), preferences());
    h.at(10000);
    const view = h.world.view();
    const character = view.characters[0];
    assert.equal(character.statusLabel, "working");
    assert.equal(character.connected, false);
    assert.deepEqual(character.position, character.deskPosition);
    assert.equal(view.scenes.length, 1);
    assert.deepEqual(view.scenes[0].participants, ["a1"]);
});

test("dialogue timers include unknown and ended characters, use authored lines and per-line reading durations", () => {
    const h = harness();
    const agents = [
        agent("unknown", "s1", { state: "unknown" }),
        agent("stale", "s1", { freshness: "stale" }),
        agent("offline", "s1", { connected: false }),
        agent("ended", "s1", { ended: true, endedAt: 10 }),
    ];
    h.world.update(snapshot(agents), preferences());
    assert.equal(h.world.view().dialogue.length, 0);
    h.at(14999);
    assert.equal(h.world.view().dialogue.length, 0);
    h.at(15000);
    const bubbles = h.world.view().dialogue;
    assert.equal(bubbles.length, agents.length);
    for (const bubble of bubbles) {
        const words = bubble.text.trim().split(/\s+/u).length;
        const expectedDuration = Math.max(3000, Math.min(8000, words * 300));
        assert.equal(bubble.endsAt - bubble.startedAt, expectedDuration);
        assert.equal(bubble.label, "Fictional character dialogue");
        assert.equal(bubble.fictional, true);
        assert.ok(words <= 12);
        assert.doesNotMatch(bubble.text, /\b(?:working|waiting|failed|unknown|idle|ended)\b/i);
    }
    h.at(20000);
    assert.equal(h.world.view().dialogue.length, 0);
    h.at(29999);
    assert.equal(h.world.view().dialogue.length, 0);
    h.at(30000);
    const repeated = h.world.view().dialogue;
    assert.equal(repeated.length, agents.length);
    for (const bubble of repeated) {
        assert.notEqual(bubble.text, bubbles.find((previous) => previous.agentId === bubble.agentId).text,
            "a line is not repeated until that agent/state bank is exhausted");
    }
    const slow = harness(() => 1);
    slow.world.update(snapshot([agent("slow", "s1", { state: "unknown" })]), preferences());
    slow.at(29999);
    assert.equal(slow.world.view().dialogue.length, 0);
    slow.at(30000);
    assert.equal(slow.world.view().dialogue.length, 1, "the randomized upper cadence bound is thirty seconds");
});

test("dialogue reading window counts actual words at the 200 wpm estimate", () => {
    const h = harness();
    const agents = Array.from({ length: 50 }, (_, index) => agent(`speaker-${index}`));
    h.world.update(snapshot(agents), preferences());
    const upbeat = h.world.view().characters.find((character) => character.voiceFlavor === "upbeat");
    assert.ok(upbeat);

    h.at(15000);
    const bubble = h.world.view().dialogue.find((item) => item.agentId === upbeat.id);
    assert.ok(bubble);
    assert.equal(bubble.text, "A little sunshine makes this corner feel warm and welcoming today.");
    const words = bubble.text.trim().split(/\s+/u).length;
    assert.equal(words, 11);
    assert.equal(bubble.endsAt - bubble.startedAt, words * 300);
});

test("state changes interrupt dialogue and regenerate after the per-agent cooldown", () => {
    let now = 0;
    const world = createOfficeWorld({ clock: () => now, random: () => 0 });
    world.update(snapshot([agent("a1", "s1", { state: "working" })]), preferences());
    now = 15000;
    world.tick();
    const first = world.view().dialogue[0];
    assert.ok(first);
    now = 16000;
    world.update(snapshot([agent("a1", "s1", { state: "waiting", waitingReason: "approval" })]), preferences());
    assert.equal(world.view().dialogue.length, 0, "the current line is interrupted but cooldown is honored");
    assert.equal(world.view().characters[0].state, "waiting");
    assert.equal(world.view().characters[0].statusLabel, "Waiting for approval");
    now = 29999;
    world.tick();
    assert.equal(world.view().dialogue.length, 0);
    now = 30000;
    world.tick();
    const next = world.view().dialogue[0];
    assert.ok(next);
    assert.notEqual(next.id, first.id);
    assert.equal(next.startedAt, 30000);
    assert.equal(world.view().characters[0].statusLabel, "Waiting for approval");
});

test("five stable voice flavors author state-transition dialogue with a cooldown, never provider output", () => {
    const h = harness();
    const agents = Array.from({ length: 50 }, (_, index) => agent(`voice${index}`));
    h.world.update(snapshot(agents), preferences());
    assert.equal(new Set(h.world.view().characters.map((character) => character.voiceFlavor)).size, 5);
    assert.equal(h.world.view().dialogue.length, 0);
    h.at(100);
    h.world.update(snapshot(agents.map((item) => ({ ...item, state: "working" }))), preferences());
    const bubbles = h.world.view().dialogue;
    assert.equal(bubbles.length, 50);
    for (const bubble of bubbles) {
        assert.equal(bubble.fictional, true);
        assert.equal(bubble.placement, "secondary");
        assert.equal(bubble.label, "Fictional character dialogue");
        assert.ok(bubble.text.trim().split(/\s+/u).length <= 12);
    }
    h.world.update(snapshot(agents.map((item) => ({ ...item, state: "working" }))), preferences());
    assert.deepEqual(h.world.view().dialogue, bubbles);
    h.at(5000);
    assert.equal(h.world.view().dialogue.length, 0);
    h.world.update(snapshot(agents), preferences());
    assert.equal(h.world.view().dialogue.length, 0, "rapid transitions respect cooldown");
    h.at(20000);
    h.world.update(snapshot(agents.map((item) => ({ ...item, state: "waiting", waitingReason: "approval" }))), preferences());
    assert.equal(h.world.view().dialogue.length, 0, "a transition interrupts the line while respecting cooldown");
    h.at(35000);
    assert.equal(h.world.view().dialogue.length, 50);
    assert.ok(h.world.view().characters.every((character) => character.statusLabel === "Waiting for approval" && character.pose === "attention"));
    assert.deepEqual(h.world.view().characters.map((character) => character.voiceFlavor), agents.map((item) => {
        const one = harness();
        one.world.update(snapshot([item]), preferences());
        return one.world.view().characters[0].voiceFlavor;
    }));
});

test("completion is a brief flourish then rest, not an exit; errors, waits and unknown keep readable cues", () => {
    const h = harness();
    h.world.update(snapshot(), preferences());
    h.world.update(snapshot([agent("a1", "s1", { state: "completed" })]), preferences());
    assert.equal(h.world.view().characters[0].pose, "completion");
    h.at(2000);
    assert.equal(h.world.view().characters[0].pose, "rest");
    assert.equal(h.world.view().characters[0].state, "completed");
    h.world.update(snapshot([agent("a1", "s1", { state: "failed" })]), preferences());
    assert.equal(h.world.view().characters[0].pose, "issue");
    h.world.update(snapshot([agent("a1", "s1", { state: "unknown" })]), preferences());
    assert.equal(h.world.view().characters[0].pose, "neutral");
    assert.equal(h.world.view().clusters[0].abandoned, false);
});

test("Codex turn completion produces a brief flourish without inventing terminal state", () => {
    let now = 1000;
    const state = createOfficeState({ clock: () => now });
    state.setProvider("Codex", { availability: "connected", enabled: true, detail: "Test metadata source" });
    state.applyCodex([{ id: "thread", title: "Complete task", status: { type: "idle", activeFlags: [] }, updatedAt: now, monitoring: "subscribed" }], now);
    const world = createOfficeWorld({ clock: () => now, random: () => 0 });
    world.update(state.snapshot(), preferences());
    assert.equal(world.view().characters[0]?.pose, "rest");

    now += 10;
    state.codexTurn({ threadId: "thread", turnId: "turn", outcome: "completed", at: now });
    const completed = state.snapshot();
    assert.equal(completed.agents[0]?.state, "idle");
    assert.equal(completed.agents[0]?.ended, false);
    assert.equal(completed.agents[0]?.lastTurnOutcome, "completed");
    world.update(completed, preferences());
    assert.equal(world.view().characters[0]?.pose, "completion");

    now += 1999;
    world.tick();
    assert.equal(world.view().characters[0]?.pose, "completion");
    now += 1;
    world.tick();
    assert.equal(world.view().characters[0]?.pose, "rest");
});

test("fiction controls are independent, preserve props/facts and expose a static reduced-motion alternative", () => {
    const h = harness();
    const facts = snapshot();
    const before = structuredClone(facts);
    h.world.update(facts, preferences());
    h.at(10000);
    const props = h.world.view().props;
    h.world.update(facts, preferences({ vignettes: false }));
    assert.equal(h.world.view().scenes.length, 0);
    assert.deepEqual(h.world.view().props, props);
    assert.deepEqual(h.world.view().characters[0].position, h.world.view().characters[0].deskPosition);
    const working = snapshot([agent("a1", "s1", { state: "working" })]);
    h.world.update(working, preferences({ vignettes: false }));
    assert.equal(h.world.view().dialogue.length, 1, "dialogue remains independently enabled");
    h.world.update(working, preferences({ dialogue: false }));
    assert.equal(h.world.view().dialogue.length, 0);
    h.world.update(facts, preferences({ dialogue: false }));
    h.at(20000);
    assert.equal(h.world.view().scenes.length, 1, "vignettes remain independently enabled");
    assert.deepEqual(h.world.view().motion, { optional: true, reducedMotion: "static", flashing: false });
    assert.deepEqual(h.world.view(), h.world.view(), "view is observational");
    assert.deepEqual(facts, before);
    const otherCanvas = createOfficeWorld({ clock: () => 20000 });
    assert.deepEqual(otherCanvas.view().props, [], "new canvas has no presentation history");
});

test("hidden abandoned props cannot be removed by an invisible cleanup", () => {
    const h = harness();
    const active = session("s2");
    h.world.update(snapshot([agent(), agent("other", "s2", { state: "working" })], [session(), active]), preferences());
    h.at(10000);
    h.at(14000);
    const leftBehind = h.world.view().props[0];
    h.world.update(snapshot([agent("a1", "s1", { ended: true }), agent("other", "s2")], [session("s1", { closed: true, endedAt: 14000 }), active]), preferences({ showEnded: false }));
    for (let time = 24000; time <= 104000; time += 10000) {
        h.at(time);
        assert.equal(h.world.view().props.find((prop) => prop.id === leftBehind.id)?.cleanupSceneId, null);
        h.at(time + 4000);
    }
    assert.ok(h.world.view().props.some((prop) => prop.id === leftBehind.id));
    assert.equal(h.world.view().clusters.find((cluster) => cluster.sessionId === "s1").visible, true);
});

test("arrival takes over interrupted own-desk cleanup but never cleans someone else's desk", () => {
    const h = harness();
    h.world.update(snapshot(), preferences());
    for (let time = 10000; time <= 50000; time += 10000) {
        h.at(time);
        if (time < 50000) h.at(time + 4000);
    }
    assert.equal(h.world.view().scenes[0].kind, "cleanup");
    h.world.update(snapshot([agent("a1", "s1", { ended: true }), agent("new", "s2", { state: "working" })], [session("s1", { closed: true }), session("s2")]), preferences());
    const view = h.world.view();
    const setup = view.scenes.find((scene) => scene.kind === "desk-setup");
    const arriving = view.characters.find((character) => character.id === "new");
    assert.ok(setup);
    assert.ok(arriving);
    const ownDeskProps = view.props.filter((prop) => prop.spaceId === arriving.spaceId && prop.deskIndex === arriving.deskIndex);
    assert.ok(ownDeskProps.length > 0);
    assert.ok(ownDeskProps.every((prop) => prop.cleanupSceneId === setup.id));
    assert.ok(view.props.some((prop) => prop.deskIndex === null && prop.cleanupSceneId === null));
    h.at(setup.endsAt);
    assert.ok(!h.world.view().props.some((prop) => prop.spaceId === arriving.spaceId && prop.deskIndex === arriving.deskIndex));
    assert.ok(h.world.view().props.some((prop) => prop.deskIndex === null), "desk setup leaves common-area props untouched");
});

test('a returning provider identity readies its own dirty desk once on reentry',()=>{
 const h=harness();
 h.world.update(snapshot(),preferences());
 h.at(10000);h.at(14000);
 assert.ok(h.world.view().props.length);
 h.world.update(snapshot([agent('a1','s1',{ended:true,endedAt:14000})],[session('s1',{closed:true,endedAt:14000})]),preferences());
 h.world.update(snapshot([agent('a1','s1',{state:'working'})]),preferences());
 assert.equal(h.world.view().scenes.filter(scene=>scene.kind==='desk-setup').length,1);
 h.at(18000);
 h.world.update(snapshot([agent('a1','s1',{state:'working'})]),preferences());
 assert.equal(h.world.view().scenes.length,0);
 assert.equal(h.world.view().props.length,0);
});
