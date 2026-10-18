import test from "node:test";
import assert from "node:assert/strict";
import { createOfficeState } from "../src/office-state.js";

const thread = (id, extra = {}) => ({ id, title: "Example", parentThreadId: null, status: { type: "idle", activeFlags: [] }, updatedAt: 1000, createdAt: 900, source: "cli", modelProvider: null, archived: false, monitoring: "subscribed", ...extra });

test("provider health remains independent and discovered threads have provider-established characters", () => {
    const state = createOfficeState({ clock: () => 2000000 });
    state.setProvider("Copilot", { availability: "connected", enabled: true, detail: "Hosting only" });
    state.setProvider("Codex", { availability: "connected", enabled: true, detail: "Local" });
    state.applyCodex([thread("main"), thread("child", { parentThreadId: "main", agentRole: "reviewer" })]);
    const snapshot = state.snapshot();
    assert.equal(snapshot.sessions.length, 1);
    assert.equal(snapshot.agents.length, 2);
    assert.equal(snapshot.agents[1].parentAgentId, snapshot.agents[0].id);
    assert.equal(snapshot.agents[0].freshness, "fresh");
    state.setProvider("Codex", { availability: "disconnected", enabled: true, detail: "Lost" });
    assert.equal(state.snapshot().providers[0].availability, "connected");
    assert.equal(state.snapshot().agents[0].connected, false);
});

test("silence, turn completion, archive, and subscription closure never fabricate session termination", () => {
    let now = 2000000;
    const state = createOfficeState({ clock: () => now });
    state.setProvider('Codex', { enabled: true, availability: 'connected' });
    state.applyCodex([thread('one')]);
    state.codexTurn({ threadId: 'one', turnId: 'turn', outcome: 'completed', at: now });
    state.codexLifecycle({ threadId: 'one', event: 'archived', at: now });
    now += 50000;
    let snapshot = state.snapshot();
    assert.equal(snapshot.sessions[0].closed, false);
    assert.equal(snapshot.agents[0].state, 'unknown');
    assert.equal(snapshot.agents[0].freshness, 'stale');
    assert.equal(snapshot.agents[0].ended, false);
    state.codexLifecycle({ threadId: 'one', event: 'closed', at: now });
    snapshot = state.snapshot();
    assert.equal(snapshot.sessions[0].closed, false);
    assert.equal(snapshot.agents[0].connected, false);
});

test("Copilot subagents keep stable internal names and discard task-description display names", () => {
    const state = createOfficeState({ clock: () => 1000 });
    state.bindHostingSession("host");
    state.copilotEvent({ id: "start", type: "subagent.started", data: { toolCallId: "call", agentName: "explore", agentDisplayName: "PRIVATE task description", agentType: "explore" } });
    const snapshot = state.snapshot();
    const child = snapshot.agents.find((item) => item.sourceId === "tool:call");
    assert.equal(child?.name, "explore");
    assert.equal(child?.role, "explore");
    assert.equal(child?.state, "working");
    assert.equal(JSON.stringify(snapshot).includes("PRIVATE task description"), false);
});

test("Copilot reported subagents have distinct identities and end independently without exposing payloads", () => {
    const state = createOfficeState({ clock: () => 2000000 });
    state.bindHostingSession('host');
    state.copilotEvent({ id:'start1', type:'subagent.started', data:{toolCallId:'call1',agentName:'explore',agentDescription:'PRIVATE',response:'PRIVATE'} });
    state.copilotEvent({ id:'start2', type:'subagent.started', data:{toolCallId:'call2',agentName:'explore'} });
    state.copilotEvent({ id:'end1', type:'subagent.completed', data:{toolCallId:'call1',agentName:'explore',response:'PRIVATE'} });
    const snapshot = state.snapshot();
    assert.equal(snapshot.agents.length,3);
    assert.equal(snapshot.agents.find(a => a.sourceId === 'tool:call1').ended,true);
    assert.equal(snapshot.agents.find(a => a.sourceId === 'tool:call2').ended,false);
    assert.equal(snapshot.sessions[0].closed,false);
    assert.equal(JSON.stringify(snapshot).includes('PRIVATE'),false);
});

test("Copilot idle is explicit, duplicate/out-of-order updates are ignored, and shutdown closes the cluster", () => {
    let now = 2000000;
    const state = createOfficeState({ clock: () => now });
    state.bindHostingSession('host');
    state.copilotEvent({id:'work',type:'user.message',timestamp:new Date(now).toISOString(),data:{content:'PRIVATE'}});
    now += 10;
    state.copilotEvent({id:'idle',type:'session.idle',timestamp:new Date(now).toISOString()});
    state.copilotEvent({id:'old',type:'assistant.turn_start',timestamp:new Date(now-5).toISOString()});
    state.copilotEvent({id:'idle',type:'session.idle',timestamp:new Date(now).toISOString()});
    assert.equal(state.snapshot().agents[0].state,'idle');
    assert.equal(state.snapshot().feed.filter(e => e.label === 'Agent idle').length,1);
    now += 10;
    state.copilotEvent({id:'end',type:'session.shutdown',timestamp:new Date(now).toISOString()});
    assert.equal(state.snapshot().sessions[0].closed,true);
    assert.equal(state.snapshot().agents[0].ended,true);
    assert.equal(JSON.stringify(state.snapshot()).includes('PRIVATE'),false);
});

test("notifications newer than discovery win and snapshots cannot mutate stored facts", () => {
    let now=2000000;
    const state=createOfficeState({clock:()=>now});
    state.setProvider('Codex',{enabled:true,availability:'connected'});
    state.applyCodex([thread('one')], now);
    now += 10;
    state.codexActivity({provider:'codex',id:'codex:one',state:'working',event:'thread-status',at:now});
    state.applyCodex([thread('one')],now-5);
    const snapshot=state.snapshot();
    assert.equal(snapshot.agents[0].state,'working');
    snapshot.agents[0].state='failed';
    assert.equal(state.snapshot().agents[0].state,'working');
});

test('Codex session-tree identity groups distinct provider agents in one session cluster',()=>{
 const state=createOfficeState({clock:()=>2000000});
 state.setProvider('Codex',{enabled:true,availability:'connected'});
 state.applyCodex([thread('root',{sessionId:'tree',title:'Root task'}),thread('child',{sessionId:'tree',parentThreadId:'root',title:'Child task'})]);
 const snapshot=state.snapshot();
 assert.equal(snapshot.sessions.length,1);
 assert.equal(snapshot.sessions[0].id,'codex:tree');
 assert.equal(snapshot.sessions[0].title,'Root task');
 assert.equal(snapshot.agents.length,2);
 assert.equal(snapshot.agents[0].sessionId,snapshot.agents[1].sessionId);
 assert.equal(snapshot.agents[1].parentAgentId,snapshot.agents[0].id);
});

test('binding a hosting session observes an unknown agent without inventing activity', () => {
    const state = createOfficeState({ clock: () => 2000000 });
    state.bindHostingSession('host');
    const agent = state.snapshot().agents[0];
    assert.equal(agent.state, 'unknown');
    assert.equal(agent.observedAt, 2000000);
    assert.equal(agent.lastActivityAt, null);
});

test('Copilot receipt time and source activity time stay distinct, including delayed events', () => {
    const now = 2000000;
    const state = createOfficeState({ clock: () => now });
    state.bindHostingSession('host');
    state.copilotEvent({ id: 'delayed', type: 'assistant.turn_start', timestamp: new Date(now - 50000).toISOString() });
    const agent = state.snapshot().agents[0];
    assert.equal(agent.observedAt, now);
    assert.equal(agent.lastActivityAt, now - 50000);
    assert.equal(agent.freshness, 'stale');
    assert.equal(agent.state, 'unknown');
});

test('explicit Copilot idle survives silence without manufacturing a fresh observation', () => {
    let now = 2000000;
    const state = createOfficeState({ clock: () => now });
    state.bindHostingSession('host');
    state.copilotEvent({ id: 'idle', type: 'session.idle', timestamp: new Date(now).toISOString() });
    const before = state.snapshot();
    now += 50000;
    const after = state.snapshot();
    assert.equal(after.agents[0].state, 'idle');
    assert.equal(after.agents[0].freshness, 'stale');
    assert.equal(after.agents[0].observedAt, before.agents[0].observedAt);
    assert.equal(after.agents[0].lastActivityAt, before.agents[0].lastActivityAt);
    assert.deepEqual(after.feed, before.feed);
    state.setProvider('Copilot', { availability: 'disconnected' });
    assert.equal(state.snapshot().agents[0].state, 'unknown');
    assert.equal(state.snapshot().agents[0].ended, false);
});

test('Copilot task-registry parent IDs are not guessed to be tool-call identities', () => {
    const state = createOfficeState({ clock: () => 2000000 });
    state.bindHostingSession('host');
    state.copilotEvent({ id: 'parent', type: 'subagent.started', data: { toolCallId: 'registry-parent', agentName: 'explore' } });
    state.copilotEvent({ id: 'child', type: 'subagent.started', data: { toolCallId: 'child-call', parentId: 'registry-parent', agentName: 'explore' } });
    state.copilotEvent({ id: 'missed-start', type: 'subagent.completed', data: { toolCallId: 'other-call' } });
    const snapshot = state.snapshot();
    const root = snapshot.agents.find(agent => agent.sourceId === 'main');
    assert.equal(snapshot.agents.find(agent => agent.sourceId === 'tool:registry-parent').parentAgentId, root.id);
    assert.equal(snapshot.agents.find(agent => agent.sourceId === 'tool:child-call').parentAgentId, null);
    assert.equal(snapshot.agents.find(agent => agent.sourceId === 'tool:other-call').parentAgentId, null);
    assert.equal(snapshot.agents.length, 4);
});

test('future Copilot timestamps cannot poison ordering or fabricate session closure', () => {
    let now = 2000000;
    const state = createOfficeState({ clock: () => now });
    state.bindHostingSession('host');
    state.copilotEvent({ id: 'future', type: 'session.shutdown', timestamp: new Date(now + 60000).toISOString() });
    assert.equal(state.snapshot().sessions[0].closed, false);
    assert.equal(state.snapshot().agents[0].lastActivityAt, null);
    now += 10;
    state.copilotEvent({ id: 'work', type: 'assistant.turn_start', timestamp: new Date(now).toISOString() });
    assert.equal(state.snapshot().agents[0].state, 'working');
    assert.equal(state.snapshot().agents[0].lastActivityAt, now);
});

test('a closed Copilot session cannot be resurrected by late root or subagent signals', () => {
    let now = 2000000;
    const state = createOfficeState({ clock: () => now });
    state.bindHostingSession('host');
    state.copilotEvent({ id: 'end', type: 'session.shutdown', timestamp: new Date(now).toISOString() });
    now += 10;
    state.copilotEvent({ id: 'late', type: 'session.idle', timestamp: new Date(now).toISOString() });
    state.copilotEvent({ id: 'late-child', type: 'subagent.started', timestamp: new Date(now).toISOString(), data: { toolCallId: 'child' } });
    const snapshot = state.snapshot();
    assert.equal(snapshot.sessions[0].closed, true);
    assert.equal(snapshot.agents.length, 1);
    assert.equal(snapshot.agents[0].ended, true);
});

test('Codex session-tree discovery removes superseded clusters without losing agent identity', () => {
    const state = createOfficeState({ clock: () => 2000000 });
    state.setProvider('Codex', { enabled: true, availability: 'connected' });
    state.applyCodex([thread('child', { parentThreadId: 'root' })]);
    const childId = state.snapshot().agents[0].id;
    state.applyCodex([thread('root', { sessionId: 'tree', title: 'Root' }), thread('child', { parentThreadId: 'root' })]);
    const snapshot = state.snapshot();
    assert.equal(snapshot.sessions.length, 1);
    assert.equal(snapshot.sessions[0].id, 'codex:tree');
    assert.equal(snapshot.sessions[0].title, 'Root');
    assert.equal(snapshot.agents.find(agent => agent.id === childId).sessionId, 'codex:tree');
    assert.equal(snapshot.agents.find(agent => agent.id === childId).parentAgentId, 'codex:root:agent:root');
});

test('Codex refresh preserves activity time, rejects future metadata, and never fabricates missing activity', () => {
    let now = 2000000;
    const state = createOfficeState({ clock: () => now });
    state.setProvider('Codex', { enabled: true, availability: 'connected' });
    state.applyCodex([thread('one'), thread('future', { updatedAt: (now + 60000) / 1000 }), thread('missing', { updatedAt: null })]);
    assert.equal(state.snapshot().agents.find(agent => agent.sourceId === 'future').lastActivityAt, null);
    assert.equal(state.snapshot().agents.find(agent => agent.sourceId === 'missing').lastActivityAt, null);
    now += 10;
    state.codexActivity({ provider: 'codex', id: 'codex:one', state: 'working', event: 'thread-status', at: now });
    const activityAt = now;
    now += 10;
    state.applyCodex([thread('one', { status: { type: 'active' } })]);
    const agent = state.snapshot().agents.find(agent => agent.sourceId === 'one');
    assert.equal(agent.observedAt, now);
    assert.equal(agent.lastActivityAt, activityAt);
    assert.equal(agent.state, 'working');
});

test('older Codex discovery cannot overwrite session metadata or disconnect newly observed agents', () => {
    let now = 2000000;
    const state = createOfficeState({ clock: () => now });
    state.setProvider('Codex', { enabled: true, availability: 'connected' });
    state.applyCodex([thread('one', { title: 'Old' })]);
    now += 10;
    state.applyCodex([thread('one', { title: 'Current' }), thread('two')]);
    state.applyCodex([thread('one', { title: 'Old', archived: true })], now - 5);
    const snapshot = state.snapshot();
    assert.equal(snapshot.sessions.find(session => session.sourceId === 'one').title, 'Current');
    assert.equal(snapshot.sessions.find(session => session.sourceId === 'one').archived, false);
    assert.equal(snapshot.agents.find(agent => agent.sourceId === 'two').connected, true);
});

test('Codex closure and missing discovery invalidate state without implying session end or new activity', () => {
    let now = 2000000;
    const state = createOfficeState({ clock: () => now });
    state.setProvider('Codex', { enabled: true, availability: 'connected' });
    state.applyCodex([thread('one', { status: { type: 'active', activeFlags: ['waitingOnApproval'] } })]);
    const lastActivityAt = state.snapshot().agents[0].lastActivityAt;
    now += 10;
    state.codexLifecycle({ threadId: 'one', event: 'closed', at: now });
    // The client reports notLoaded after subscription eviction, not a reconnection.
    state.codexActivity({ provider: 'codex', id: 'codex:one', state: 'unknown', event: 'thread-status', at: now });
    let snapshot = state.snapshot();
    assert.equal(snapshot.agents[0].connected, false);
    assert.equal(snapshot.agents[0].waitingReason, null);
    assert.equal(snapshot.agents[0].lastActivityAt, lastActivityAt);
    assert.equal(snapshot.sessions[0].closed, false);
    assert.equal(snapshot.agents[0].ended, false);
    now += 10;
    state.applyCodex([thread('one')]);
    state.applyCodex([]);
    snapshot = state.snapshot();
    assert.equal(snapshot.agents[0].state, 'unknown');
    assert.equal(snapshot.agents[0].connected, false);
    assert.equal(snapshot.agents[0].ended, false);
});

test('Codex lifecycle and future events cannot overwrite newer valid observations', () => {
    let now = 2000000;
    const state = createOfficeState({ clock: () => now });
    state.setProvider('Codex', { enabled: true, availability: 'connected' });
    state.applyCodex([thread('one')]);
    now += 10;
    state.codexActivity({ provider: 'codex', id: 'codex:one', state: 'working', event: 'thread-status', at: now });
    state.codexLifecycle({ threadId: 'one', event: 'closed', at: now - 5 });
    assert.equal(state.snapshot().agents[0].state, 'working');
    assert.equal(state.snapshot().agents[0].connected, true);
    state.codexTurn({ threadId: 'one', turnId: 'turn', outcome: 'completed', at: now + 60000 });
    assert.equal(state.snapshot().agents[0].lastTurnOutcome, null);
    state.codexActivity({ provider: 'codex', id: 'codex:one', state: 'failed', event: 'error', at: now + 60000 });
    state.codexLifecycle({ threadId: 'one', event: 'archived', at: now + 60000 });
    now += 10;
    state.codexActivity({ provider: 'codex', id: 'codex:one', state: 'idle', event: 'thread-status', at: now });
    assert.equal(state.snapshot().agents[0].state, 'idle');
    assert.equal(state.snapshot().sessions[0].archived, false);
});

test('archiving a Codex root does not archive an unarchived child or get undone by older discovery', () => {
    let now = 2000000;
    const state = createOfficeState({ clock: () => now });
    state.setProvider('Codex', { enabled: true, availability: 'connected' });
    const threads = [thread('root'), thread('child', { parentThreadId: 'root' })];
    state.applyCodex(threads);
    now += 10;
    state.codexLifecycle({ threadId: 'root', event: 'archived', at: now });
    assert.equal(state.snapshot().sessions[0].archived, false);
    now += 10;
    state.codexLifecycle({ threadId: 'child', event: 'archived', at: now });
    assert.equal(state.snapshot().sessions[0].archived, true);
    state.applyCodex(threads, now - 15);
    assert.equal(state.snapshot().sessions[0].archived, true);
    state.codexLifecycle({ threadId: 'root', event: 'unarchived', at: now - 15 });
    assert.equal(state.snapshot().sessions[0].archived, true);
});
