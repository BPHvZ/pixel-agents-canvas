// @ts-check
/** @typedef {import('./product-types.js').OfficeSnapshot} OfficeSnapshot */
/** @typedef {import('./product-types.js').OfficeAgent} OfficeAgent */
/** @typedef {import('./product-types.js').OfficeSession} OfficeSession */
/** @typedef {import('./product-types.js').ProviderHealth} ProviderHealth */
/** @typedef {import('./product-types.js').FeedEvent} FeedEvent */
/** @typedef {import('./types.js').ProviderName} ProviderName */
/** @typedef {import('./types.js').AgentState} AgentState */

/** @param {unknown} input @returns {Record<string, unknown>} */
const record = (input) => input && typeof input === 'object' && !Array.isArray(input) ? /** @type {Record<string, unknown>} */ (input) : {};
/** @param {unknown} input @param {number} [limit] */
const text = (input, limit = 160) => typeof input === 'string' && input ? input.slice(0, limit) : null;
/** @param {unknown} input */
const eventTime = (input) => typeof input === 'string' && Number.isFinite(Date.parse(input)) ? Date.parse(input) : null;
/** @param {unknown} input */
function activityTime(input) {
    if (typeof input === 'string') return eventTime(input);
    return typeof input === 'number' && Number.isFinite(input) ? Math.abs(input) < 100_000_000_000 ? input * 1000 : input : null;
}
/** @param {unknown} input @returns {AgentState} */
function stateOf(input) {
    const status = record(input);
    if (status.type === 'active') return Array.isArray(status.activeFlags) && status.activeFlags.some((flag) => flag === 'waitingOnApproval' || flag === 'waitingOnUserInput') ? 'waiting' : 'working';
    if (status.type === 'idle') return 'idle';
    if (status.type === 'systemError') return 'failed';
    return 'unknown';
}

/** @param {{clock?: () => number, staleAfterMs?: number}} [options] */
export function createOfficeState({ clock = Date.now, staleAfterMs = 45000 } = {}) {
    /** @type {Map<ProviderName, ProviderHealth>} */
    const providers = new Map([
        ['Copilot', { id: 'Copilot', source: 'copilotcli', availability: 'unavailable', enabled: true, detail: 'Hosting conversation only', observedAt: null, capabilities: { discovery: 'unsupported', agents: 'supported', navigation: 'unsupported' } }],
        ['Codex', { id: 'Codex', source: 'app-server', availability: 'unavailable', enabled: false, detail: 'Disabled; explicit enablement starts local Codex', observedAt: null, capabilities: { discovery: 'supported', agents: 'supported', navigation: 'unsupported' } }],
    ]);
    /** @type {Map<string, OfficeSession>} */
    const sessions = new Map();
    /** @type {Map<string, OfficeAgent>} */
    const agents = new Map();
    /** @type {FeedEvent[]} */
    const feed = [];
    let sequence = 0;
    let hostingId = 'copilot:hosting';
    /** @type {Map<string, number>} */
    const appliedEvents = new Map();
    /** @type {Map<string, number>} */
    const copilotActivityAt = new Map();
    /** @type {Map<string, {archived: boolean, at: number}>} */
    const codexArchives = new Map();
    let codexDiscoveryAt = -Infinity;
    /** @param {number} at */
    const validObservation = (at) => Number.isFinite(at) && at >= 0 && at <= clock();
    /** @param {ProviderName} provider @param {string | null} agentId @param {string | null} sessionId @param {string} label @param {number} [at] */
    function emit(provider, agentId, sessionId, label, at = clock()) {
        feed.unshift({ id: ++sequence, provider, agentId, sessionId, label, at });
        // The recent feed is a rolling window, not a cap on discovered agents/sessions.
        if (feed.length > 200) feed.length = 200;
    }
    /** @param {ProviderName} provider @param {Partial<Omit<ProviderHealth, 'id' | 'source' | 'capabilities'>>} update */
    function setProvider(provider, update) {
        const previous = providers.get(provider);
        if (!previous) return;
        const next = { ...previous, ...update, observedAt: update.observedAt ?? clock() };
        providers.set(provider, next);
        if (previous.availability !== next.availability || previous.enabled !== next.enabled) emit(provider, null, null, `Source ${next.availability}`);
    }
    /** @param {OfficeAgent} next @param {boolean} [live] */
    function upsertAgent(next, live = true) {
        const previous = agents.get(next.id);
        if (previous && previous.observedAt !== null && next.observedAt !== null && next.observedAt < previous.observedAt) return;
        agents.set(next.id, next);
        if (!previous) emit(next.provider, next.id, next.sessionId, 'Agent observed');
        else if (live && (previous.state !== next.state || previous.waitingReason !== next.waitingReason || previous.ended !== next.ended)) {
            emit(next.provider, next.id, next.sessionId, next.ended ? 'Agent ended' : next.waitingReason === 'approval' ? 'Waiting for approval' : next.waitingReason === 'input' ? 'Waiting for input' : `Agent ${next.state}`);
        }
    }
    /** @param {string} sessionId @param {ProviderName} provider @param {string} sourceId @param {number} at @returns {OfficeAgent} */
    function initialAgent(sessionId, provider, sourceId, at) {
        return { id: `${sessionId}:agent:${sourceId}`, sessionId, provider, sourceId, name: null, role: null, parentAgentId: null, state: 'unknown', waitingReason: null, connected: true, freshness: 'fresh', observedAt: at, lastActivityAt: null, ended: false, endedAt: null, lastTurnOutcome: null };
    }
    /** @param {unknown[]} threads @param {number} [observedAt] */
    function applyCodex(threads, observedAt = clock()) {
        if (!validObservation(observedAt) || observedAt < codexDiscoveryAt) return;
        codexDiscoveryAt = observedAt;
        /** @type {Map<string, Record<string, unknown>>} */
        const rows = new Map();
        for (const input of threads) {
            const thread = record(input);
            if (typeof thread.id === 'string' && thread.id) rows.set(thread.id, thread);
        }
        /** @param {string} id @param {Record<string, unknown>} thread */
        function treeId(id, thread) {
            if (typeof thread.sessionId === 'string' && thread.sessionId) return thread.sessionId;
            const visited = new Set([id]);
            let parent = thread.parentThreadId;
            let root = id;
            while (typeof parent === 'string' && parent) {
                if (visited.has(parent)) return id;
                visited.add(parent);
                root = parent;
                const ancestor = rows.get(parent);
                if (typeof ancestor?.sessionId === 'string' && ancestor.sessionId) return ancestor.sessionId;
                parent = ancestor?.parentThreadId;
            }
            return root;
        }
        /** @type {Set<string>} */
        const present = new Set();
        /** @type {Map<string, {row:Record<string, unknown>, root:boolean, allArchived:boolean}>} */
        const trees = new Map();
        for (const [threadId, thread] of rows) {
            const id = `codex:${treeId(threadId, thread)}`;
            const agentId = `codex:${threadId}:agent:${threadId}`;
            present.add(agentId);
            const parent = typeof thread.parentThreadId === 'string' ? thread.parentThreadId : null;
            const oldTree = trees.get(id);
            const isRoot = !parent;
            const archived = codexArchives.get(threadId);
            if (!archived || archived.at <= observedAt) codexArchives.set(threadId, { archived: thread.archived === true, at: observedAt });
            trees.set(id, { row: !oldTree || isRoot && !oldTree.root ? thread : oldTree.row, root: isRoot || oldTree?.root === true, allArchived: codexArchives.get(threadId)?.archived === true && (!oldTree || oldTree.allArchived) });
            const previous = agents.get(agentId);
            const status = record(thread.status);
            const flags = Array.isArray(status.activeFlags) ? /** @type {unknown[]} */ (status.activeFlags) : [];
            const monitored = thread.monitoring === 'subscribed';
            const base = previous ?? { ...initialAgent(id, 'Codex', threadId, observedAt), id: agentId };
            const metadata = { sessionId: id, name: text(thread.agentNickname, 80), role: text(thread.agentRole, 80), parentAgentId: parent ? `codex:${parent}:agent:${parent}` : null };
            if (previous?.observedAt !== null && previous?.observedAt !== undefined && previous.observedAt > observedAt) {
                upsertAgent({ ...previous, ...metadata });
                continue;
            }
            const state = monitored ? stateOf(status) : 'unknown';
            const updatedAt = activityTime(thread.updatedAt);
            const lastActivityAt = updatedAt !== null && validObservation(updatedAt) ? Math.max(updatedAt, base.lastActivityAt ?? updatedAt) : base.lastActivityAt;
            upsertAgent({ ...base, ...metadata, state, waitingReason: state === 'waiting' ? flags.includes('waitingOnApproval') ? 'approval' : 'input' : null, connected: monitored, observedAt, lastActivityAt });
        }
        for(const [id,tree] of trees) {
            const sourceId = typeof tree.row.id === 'string' ? tree.row.id : id.slice(6);
            sessions.set(id,{id,provider:'Codex',sourceId,title:text(tree.row.title ?? tree.row.name),parentSessionId:null,archived:tree.allArchived,closed:false,endedAt:null});
        }
        const occupied = new Set([...agents.values()].map((agent) => agent.sessionId));
        for (const [id, session] of sessions) {
            if (session.provider === 'Codex' && !occupied.has(id)) sessions.delete(id);
        }
        for (const agent of agents.values()) {
            if (agent.provider === 'Codex' && !present.has(agent.id) && !agent.ended && observedAt >= (agent.observedAt ?? 0)) {
                agent.connected = false;
                agent.state = 'unknown';
                agent.waitingReason = null;
            }
        }
    }
    /** @param {import('./types.js').CodexActivityEvent} event */
    function codexActivity(event) {
        const agent = agents.get(`${event.id}:agent:${event.id.slice(6)}`);
        if (!agent || agent.ended || !validObservation(event.at) || event.at < (agent.observedAt ?? 0)) return;
        const state = event.event === 'session-end' ? 'unknown' : event.state;
        upsertAgent({ ...agent, state, waitingReason: state === 'waiting' ? event.waitingReason ?? null : null, observedAt: event.at, lastActivityAt: state === 'unknown' ? agent.lastActivityAt : event.at, connected: event.event !== 'session-end' && (state !== 'unknown' || agent.connected) });
    }
    /** @param {import('./types.js').CodexTurnEvent} event */
    function codexTurn(event) {
        const agent = agents.get(`codex:${event.threadId}:agent:${event.threadId}`);
        if (!agent || !validObservation(event.at) || event.at < (agent.observedAt ?? 0)) return;
        if (agent.lastTurnOutcome !== event.outcome) emit('Codex', agent.id, agent.sessionId, `Turn ${event.outcome}`, event.at);
        agent.lastTurnOutcome = event.outcome;
        agent.observedAt = event.at;
        agent.lastActivityAt = event.at;
    }
    /** @param {import('./types.js').CodexThreadLifecycleEvent} event */
    function codexLifecycle(event) {
        const threadAgent = agents.get(`codex:${event.threadId}:agent:${event.threadId}`);
        const session = threadAgent ? sessions.get(threadAgent.sessionId) : undefined;
        if (!session || !threadAgent || !validObservation(event.at) || event.at < Math.max(threadAgent.observedAt ?? 0, codexArchives.get(event.threadId)?.at ?? 0)) return;
        if (event.event === 'archived' || event.event === 'unarchived') {
            codexArchives.set(event.threadId, { archived: event.event === 'archived', at: event.at });
            session.archived = [...agents.values()].filter((agent) => agent.sessionId === session.id).every((agent) => codexArchives.get(agent.sourceId)?.archived === true);
        }
        // A closed app-server subscription alone does not prove the conversation ended.
        if (event.event === 'closed') {
            threadAgent.connected = false;
            threadAgent.state = 'unknown';
            threadAgent.waitingReason = null;
            threadAgent.observedAt = event.at;
        }
    }
    /** @param {string} id */
    function bindHostingSession(id) {
        if (!id) return;
        hostingId = `copilot:${id}`;
        if (!sessions.has(hostingId)) sessions.set(hostingId, { id: hostingId, provider: 'Copilot', sourceId: id, title: null, parentSessionId: null, archived: false, closed: false, endedAt: null });
        const agent = initialAgent(hostingId, 'Copilot', 'main', clock());
        if (!agents.has(agent.id)) upsertAgent(agent);
        setProvider('Copilot', { availability: 'connected', enabled: true, detail: 'Hosting conversation only; no unrelated-session discovery' });
    }
    /** @param {unknown} input */
    function copilotEvent(input) {
        const event = record(input);
        if (typeof event.type !== 'string' || sessions.get(hostingId)?.closed) return;
        const observedAt = clock();
        const sourceAt = eventTime(event.timestamp);
        const at = sourceAt ?? observedAt;
        if (!validObservation(at)) return;
        if (typeof event.id === 'string') {
            if (appliedEvents.has(event.id)) return;
            appliedEvents.set(event.id, at);
            if (appliedEvents.size > 1000) { const first = appliedEvents.keys().next().value; if (first) appliedEvents.delete(first); }
        }
        const data = record(event.data);
        const rootId = `${hostingId}:agent:main`;
        let agent = agents.get(rootId);
        if (!agent) { bindHostingSession(hostingId.slice(8)); agent = agents.get(rootId); }
        if (!agent) return;
        if (event.type === 'subagent.started' || event.type === 'subagent.completed' || event.type === 'subagent.failed') {
            if (typeof data.toolCallId !== 'string' || !data.toolCallId) return;
            const id = `${hostingId}:agent:tool:${data.toolCallId}`;
            // parentId is a task-registry ID, not the parent's spawning tool-call ID.
            const child = agents.get(id) ?? initialAgent(hostingId, 'Copilot', `tool:${data.toolCallId}`, observedAt);
            if (at < (copilotActivityAt.get(id) ?? 0)) return;
            copilotActivityAt.set(id, at);
            upsertAgent({ ...child, name: text(data.agentName, 80) ?? child.name, role: text(data.agentType, 80) ?? child.role, parentAgentId: event.type === 'subagent.started' && data.parentId === undefined ? rootId : child.parentAgentId, state: event.type === 'subagent.started' ? 'working' : event.type === 'subagent.failed' ? 'failed' : 'completed', ended: event.type !== 'subagent.started', endedAt: event.type !== 'subagent.started' ? at : null, observedAt, lastActivityAt: sourceAt ?? child.lastActivityAt });
            return;
        }
        if (typeof event.agentId === 'string') return; // Child payloads without a mapped stable identity cannot alter the main agent.
        if (at < (copilotActivityAt.get(rootId) ?? 0)) return;
        /** @type {AgentState | null} */
        let state = null;
        if (event.type === 'user.message' || event.type === 'tool.execution_start' || event.type === 'assistant.turn_start') state = 'working';
        else if (event.type === 'session.idle') state = 'idle';
        else if (event.type === 'session.error') state = 'failed';
        else if (event.type === 'session.shutdown') state = 'completed';
        if (!state) return;
        copilotActivityAt.set(rootId, at);
        upsertAgent({ ...agent, state, observedAt, lastActivityAt: sourceAt ?? agent.lastActivityAt, ended: event.type === 'session.shutdown', endedAt: event.type === 'session.shutdown' ? at : null, connected: event.type !== 'session.shutdown' });
        if (event.type === 'session.shutdown') {
            const session = sessions.get(hostingId);
            if (session) { session.closed = true; session.endedAt = at; session.title = null; }
            setProvider('Copilot', { availability: 'disconnected', detail: 'Hosting session ended' });
            for (const child of agents.values()) if (child.sessionId === hostingId && !child.ended) upsertAgent({ ...child, ended: true, endedAt: at, state: 'completed', connected: false, observedAt });
        }
    }
    /** @returns {OfficeSnapshot} */
    function snapshot() {
        const now = clock();
        const currentAgents = [...agents.values()].map((agent) => {
            const health = providers.get(agent.provider);
            const connected = agent.connected && health?.enabled === true && (health.availability === 'connected' || health.availability === 'empty' || health.availability === 'stale');
            const factAt = agent.provider === 'Copilot' ? copilotActivityAt.get(agent.id) ?? agent.observedAt : agent.observedAt;
            const freshness = factAt === null || factAt > now ? /** @type {const} */ ('unknown') : now - factAt > staleAfterMs ? /** @type {const} */ ('stale') : /** @type {const} */ ('fresh');
            // Idle is an explicit Copilot lifecycle state, not a promise of periodic heartbeats.
            const reportedIdle = agent.provider === 'Copilot' && agent.state === 'idle';
            const state = !agent.ended && (!connected || freshness !== 'fresh' && !reportedIdle) ? 'unknown' : agent.state;
            return { ...agent, connected, freshness, state, waitingReason: state === 'waiting' ? agent.waitingReason : null };
        });
        return { providers: [...providers.values()].map((provider) => ({ ...provider, capabilities: { ...provider.capabilities } })), sessions: [...sessions.values()].map((session) => ({ ...session })), agents: currentAgents, feed: feed.map((item) => ({ ...item })), now };
    }
    return { setProvider, applyCodex, codexActivity, codexTurn, codexLifecycle, bindHostingSession, copilotEvent, snapshot };
}
