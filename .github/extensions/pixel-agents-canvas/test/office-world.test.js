import assert from "node:assert/strict";
import test from "node:test";
import { createOfficeWorld, deterministicAppearance, deriveMotifs } from "../src/office-world.js";

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
    for (const change of [{ state: "working" }, { state: "waiting", waitingReason: "approval" }, { state: "failed" }, { state: "unknown" }, { freshness: "stale" }, { connected: false }, { ended: true }]) {
        const h = harness();
        h.world.update(snapshot([agent(), agent("a2", "s2")], [session(), session("s2")]), preferences());
        h.at(10000);
        assert.equal(h.world.view().scenes.length, 1);
        h.world.update(snapshot([agent("a1", "s1", change), agent("a2", "s2")], [session(), session("s2")]), preferences());
        assert.equal(h.world.view().scenes.length, 0);
        for (const character of h.world.view().characters) assert.deepEqual(character.position, character.deskPosition);
    }
});

test("unknown, stale, disconnected, absent and nonidle agents never start office vignettes", () => {
    for (const change of [{ state: "working" }, { state: "completed" }, { state: "failed" }, { state: "waiting" }, { state: "unknown" }, { freshness: "stale" }, { freshness: "unknown" }, { connected: false }]) {
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
    assert.equal(setup.label, "Setting up desk (office fiction)");
    assert.deepEqual(setup.participants, ["new"]);
    assert.equal(view.characters[0].state, "working");
    assert.equal(view.characters[0].statusLabel, "working");
    assert.equal(view.characters[0].deskId, original.characters[0].deskId);
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
    h.world.update(snapshot([agent("a1", "s1", { ended: true })], [session("s1", { closed: true, endedAt: 20 })]), preferences());
    const ended = h.world.view().clusters[0];
    assert.equal(ended.abandoned, true);
    assert.equal(ended.dimmed, true);
    assert.equal(ended.title, null);
    assert.deepEqual(ended.motifs, []);
    assert.equal(ended.endedAt, 20);
    assert.equal(ended.statusLabel, "Session ended");
    assert.equal(h.world.view().characters.length, 0);
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
    h.world.update(snapshot([agent()], [session("s1", { title: "Debugging mobile" })]), preferences());
    const returned = h.world.view().clusters[0];
    assert.equal(returned.id, ended.id);
    assert.equal(returned.spaceId, ended.spaceId);
    assert.equal(returned.dimmed, false);
    assert.equal(returned.title, "Debugging mobile");
    assert.equal(h.world.view().abandonedEffects.length, 0);
    assert.ok(h.world.view().props.some((prop) => prop.kind === "web"), "restoring never silently clears physical props");
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
    const facts = snapshot();
    h.world.update(facts, preferences({ hideTitles: true }));
    const hidden = h.world.view().clusters[0];
    assert.equal(hidden.title, null);
    assert.equal(hidden.titleHidden, true);
    assert.ok(hidden.motifs.length > 0);
    assert.match(hidden.titleVisibilityNote, /does not hide title-derived motifs/);
    h.world.update(facts, preferences({ hiddenSessionTitles: { s1: true } }));
    assert.equal(h.world.view().clusters[0].title, null);
    h.world.update(snapshot([agent("a1", "s1", { ended: true })], [session("s1", { closed: true, endedAt: 0 })]), preferences());
    h.world.update(snapshot([agent("new", "s2")], [session("s2", { title: "Mobile debugging" })]), preferences());
    const replacement = h.world.view().clusters.find((cluster) => cluster.sessionId === "s2");
    assert.notEqual(replacement.id, hidden.id);
    assert.equal(replacement.spaceId, hidden.spaceId);
    assert.equal(replacement.title, "Mobile debugging");
    assert.ok(replacement.motifs.some((motif) => motif.id === "domain:mobile"));
    assert.ok(!replacement.motifs.some((motif) => motif.id === "domain:frontend"));
    assert.equal(h.world.view().clusters.find((cluster) => cluster.sessionId === "s1").visible, false);
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
        assert.match(bubble.label, /Persona flavor/);
        assert.ok(bubble.label.includes(bubble.flavor));
    }
    h.world.update(snapshot(agents.map((item) => ({ ...item, state: "working" }))), preferences());
    assert.deepEqual(h.world.view().dialogue, bubbles);
    h.at(5000);
    assert.equal(h.world.view().dialogue.length, 0);
    h.world.update(snapshot(agents), preferences());
    assert.equal(h.world.view().dialogue.length, 0, "rapid transitions respect cooldown");
    h.at(20000);
    h.world.update(snapshot(agents.map((item) => ({ ...item, state: "waiting", waitingReason: "approval" }))), preferences());
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
    assert.equal(h.world.view().clusters.find((cluster) => cluster.sessionId === "s1").visible, false);
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
    assert.ok(setup);
    assert.ok(view.props.every((prop) => prop.cleanupSceneId === setup.id));
    h.at(setup.endsAt);
    assert.deepEqual(h.world.view().props, []);
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
