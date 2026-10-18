// @ts-check
import { createCodexClient } from './codex-client.js';
import { createOfficeState } from './office-state.js';

/** @param {{clock?: () => number, autoRefresh?: boolean, refreshMs?: number, createClient?: (options: import('./types.js').CodexClientOptions) => import('./types.js').CodexClient}} [options] */
export function createOfficeController({clock = Date.now, autoRefresh = true, refreshMs = 15000, createClient = createCodexClient} = {}) {
    const state = createOfficeState({clock});
    let enabled = false;
    let generation = 0;
    let failures = 0;
    /** @type {import('./types.js').CodexClient | undefined} */
    let client;
    /** @type {Promise<void> | undefined} */
    let inFlight;
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    let timer;
    /** @type {Promise<void> | undefined} */
    let stopping;
    function schedule() {
        if (timer) clearTimeout(timer);
        if (!enabled || !autoRefresh) return;
        timer = setTimeout(() => { void refreshCodex(); }, failures ? Math.min(60000, 1000 * 2 ** Math.min(failures - 1, 6)) : refreshMs);
        timer.unref();
    }
    /** @returns {Promise<void>} */
    function refreshCodex() {
        if (!enabled) return Promise.resolve();
        if (stopping) return stopping.then(() => refreshCodex());
        if (inFlight) return inFlight;
        if (timer) clearTimeout(timer);
        timer = undefined;
        const epoch = generation;
        // Defer execution so even synchronous adapter failures clear the assigned operation.
        inFlight = Promise.resolve().then(async () => {
            try {
                if (!enabled || generation !== epoch) return;
                client ??= createClient({
                    onEvent: (event) => { if (enabled && generation === epoch) state.codexActivity(event); },
                    onTurn: (event) => { if (enabled && generation === epoch) state.codexTurn(event); },
                    onThreadLifecycle: (event) => { if (enabled && generation === epoch) state.codexLifecycle(event); },
                    onStatus: (status) => {
                        if (enabled && generation === epoch) state.setProvider('Codex', { enabled:true, availability:status.availability, detail:status.connected ? 'Connected to local Codex; discovery pending' : 'Local Codex unavailable; retrying while enabled' });
                    },
                });
                const current = client;
                if (!current.running) await current.start();
                if (!enabled || generation !== epoch) return;
                const startedAt = clock();
                const threads = await current.discoverThreads();
                if (!enabled || generation !== epoch) return;
                state.applyCodex(threads, startedAt);
                const unavailable = threads.filter((thread) => !thread.archived && thread.monitoring !== 'subscribed').length;
                state.setProvider('Codex', {enabled:true, availability: unavailable ? 'stale' : threads.length ? 'connected' : 'empty', detail: unavailable ? 'Some discovered threads cannot be monitored' : threads.length ? 'Local CLI thread metadata; no cross-session navigation' : 'Connected; no local threads found'});
                failures = 0;
            } catch {
                if (enabled && generation === epoch) {
                    failures++;
                    state.setProvider('Codex', {enabled:true,availability: client?.running ? 'stale' : 'unavailable', detail:'Codex discovery unavailable; retrying while enabled. Check installed CLI compatibility.'});
                }
            }
        }).finally(() => {
            inFlight = undefined;
            if (generation === epoch) schedule();
        });
        return inFlight;
    }
    async function enableCodex() {
        if (!enabled) {
            enabled = true;
            ++generation;
            failures = 0;
            state.setProvider('Codex', {enabled:true,availability:'unavailable',detail:'Starting explicitly enabled local Codex'});
        }
        const epoch = generation;
        if (stopping) await stopping;
        if (!enabled || generation !== epoch) return;
        await refreshCodex();
    }
    function disableCodex() {
        enabled = false;
        ++generation;
        if (timer) clearTimeout(timer);
        timer = undefined;
        state.setProvider('Codex', {enabled:false,availability:'unavailable',detail:'Disabled; enablement starts a local Codex process'});
        if (stopping) return stopping;
        const current = client;
        client = undefined;
        const operation = inFlight;
        stopping = Promise.resolve().then(async () => {
            try { await current?.stop(); }
            finally { await operation; }
        }).finally(() => { stopping = undefined; });
        return stopping;
    }
    return {bindHostingSession:state.bindHostingSession,copilotEvent:state.copilotEvent,snapshot:state.snapshot,enableCodex,disableCodex,refreshCodex,stop:disableCodex};
}
