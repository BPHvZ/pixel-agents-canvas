import test from 'node:test';
import assert from 'node:assert/strict';
import { createOfficeController } from '../src/controller.js';

/** @returns {{promise:Promise<void>, resolve:()=>void}} */
function deferred() {
    let resolve = () => {};
    const promise = new Promise(done => { resolve = () => done(); });
    return {promise, resolve};
}
const flush = () => new Promise(resolve => setImmediate(resolve));

/** @param {Partial<import('../src/types.js').CodexClient>} overrides */
function fakeClient(overrides = {}) {
    return {running:true,start:async()=>{},stop:async()=>{},listThreads:async()=>[],discoverThreads:async()=>[],...overrides};
}

test('parallel enable and refresh calls share a single discovery', async () => {
    const discovery = deferred();
    let starts = 0; let discoveries = 0;
    const controller = createOfficeController({autoRefresh:false,createClient:()=>fakeClient({running:false,start:async()=>{starts++;},discoverThreads:async()=>{discoveries++;await discovery.promise;return [];}})});
    try {
        const operations = [controller.enableCodex(),controller.enableCodex(),controller.refreshCodex(),controller.refreshCodex()];
        await flush();
        assert.equal(starts,1);
        assert.equal(discoveries,1);
        discovery.resolve();
        await Promise.all(operations);
        assert.equal(controller.snapshot().providers.find(p=>p.id==='Codex').availability,'empty');
    } finally { discovery.resolve(); await controller.stop(); }
});

test('a final disable cancels enables waiting for a previous stop', async () => {
    const stopped = deferred();
    let clients = 0;
    const controller = createOfficeController({autoRefresh:false,createClient:()=>{clients++;return fakeClient({stop:()=>stopped.promise});}});
    await controller.enableCodex();
    const disabling = controller.disableCodex();
    const enabling = controller.enableCodex();
    const enablingAgain = controller.enableCodex();
    const finalDisable = controller.disableCodex();
    stopped.resolve();
    await Promise.all([disabling,enabling,enablingAgain,finalDisable]);
    try {
        assert.equal(clients,1);
        assert.equal(controller.snapshot().providers.find(p=>p.id==='Codex').enabled,false);
    } finally { await controller.stop(); }
});

test('parallel enables and refresh during shutdown wait and share one new client', async () => {
    const stopped=deferred();
    let clients=0;let discoveries=0;
    const controller=createOfficeController({autoRefresh:false,createClient:()=>{
        clients++;
        return fakeClient({stop:()=>stopped.promise,discoverThreads:async()=>{discoveries++;return [];}});
    }});
    await controller.enableCodex();
    const disabling=controller.disableCodex();
    const operations=[controller.enableCodex(),controller.enableCodex(),controller.refreshCodex()];
    try {
        await flush();
        assert.equal(clients,1);
        stopped.resolve();
        await Promise.all([disabling,...operations]);
        assert.equal(clients,2);
        assert.equal(discoveries,2);
        assert.equal(controller.snapshot().providers.find(p=>p.id==='Codex').availability,'empty');
    } finally {stopped.resolve();await controller.stop();}
});

test('disable during startup never discovers after the client has stopped', async () => {
    const started = deferred();
    let discoveries = 0;
    const controller = createOfficeController({autoRefresh:false,createClient:()=>fakeClient({running:false,start:()=>started.promise,stop:async()=>{started.resolve();},discoverThreads:async()=>{discoveries++;return [];}})});
    const enabling = controller.enableCodex();
    await flush();
    await controller.disableCodex();
    await enabling;
    assert.equal(discoveries,0);
});

test('synchronous client failures do not wedge future refreshes', async t => {
    for (const stage of ['factory','start','discover']) {
        await t.test(stage,async()=>{
            let attempts = 0;
            const failOnce = () => { if (++attempts === 1) throw new Error('unavailable'); };
            const controller = createOfficeController({autoRefresh:false,createClient:()=>{
                if(stage==='factory') failOnce();
                return fakeClient({running:stage!=='start',start:()=>{failOnce();return Promise.resolve();},discoverThreads:()=>{if(stage==='discover') failOnce();return Promise.resolve([]);}});
            }});
            try {
                await controller.enableCodex();
                assert.equal(controller.snapshot().providers.find(p=>p.id==='Codex').availability,stage==='discover'?'stale':'unavailable');
                await controller.refreshCodex();
                assert.equal(attempts,2);
                assert.equal(controller.snapshot().providers.find(p=>p.id==='Codex').availability,'empty');
            } finally { await controller.stop(); }
        });
    }
});

test('automatic recovery backs off at most 60 seconds, resets after success, and stops with consent', async t => {
    t.mock.timers.enable({apis:['setTimeout']});
    let attempts = 0; let failing = true; let stops = 0;
    const controller = createOfficeController({refreshMs:15000,createClient:()=>fakeClient({stop:async()=>{stops++;},discoverThreads:async()=>{attempts++;if(failing)throw new Error('unavailable');return [];}})});
    try {
        await controller.enableCodex();
        for (const delay of [1000,2000,4000,8000,16000,32000,60000,60000]) {
            const before = attempts;
            t.mock.timers.tick(delay-1);
            await flush();
            assert.equal(attempts,before);
            t.mock.timers.tick(1);
            await flush();
            assert.equal(attempts,before+1);
        }
        failing=false;
        await controller.refreshCodex();
        const before = attempts;
        t.mock.timers.tick(14999);
        await flush();
        assert.equal(attempts,before);
        t.mock.timers.tick(1);
        await flush();
        assert.equal(attempts,before+1);
        await controller.stop();
        t.mock.timers.tick(600000);
        await flush();
        assert.equal(attempts,before+1);
        assert.equal(stops,1);
    } finally { await controller.stop(); }
});

test('controller requires explicit opt-in and can disable without affecting Copilot', async () => {
    let starts=0; let stops=0; let running=false;
    const controller=createOfficeController({autoRefresh:false,createClient:()=>({get running(){return running;},start:async()=>{starts++;running=true;},stop:async()=>{stops++;running=false;},listThreads:async()=>[],discoverThreads:async()=>[]})});
    controller.bindHostingSession('test');
    assert.equal(starts,0);
    await controller.enableCodex();
    assert.equal(starts,1);
    assert.equal(controller.snapshot().providers.find(p=>p.id==='Codex').availability,'empty');
    await controller.disableCodex();
    assert.equal(stops,1);
    assert.equal(controller.snapshot().providers.find(p=>p.id==='Copilot').availability,'connected');
    await controller.stop();
});

test('enabled provider can recover on refresh without another consent or blocking Copilot',async()=>{
 let running=false;let attempts=0;
 const controller=createOfficeController({autoRefresh:false,createClient:()=>({get running(){return running;},start:async()=>{if(++attempts===1)throw new Error('unavailable');running=true;},stop:async()=>{running=false;},listThreads:async()=>[],discoverThreads:async()=>[]})});
 controller.bindHostingSession('host');
 await controller.enableCodex();
 assert.equal(controller.snapshot().providers.find(p=>p.id==='Codex').availability,'unavailable');
 await controller.refreshCodex();
 assert.equal(attempts,2);
 assert.equal(controller.snapshot().providers.find(p=>p.id==='Codex').availability,'empty');
 assert.equal(controller.snapshot().providers.find(p=>p.id==='Copilot').availability,'connected');
 await controller.stop();
});

test('disabling an in-flight discovery prevents late results from repopulating the office',async()=>{
 let running=false;let finish;
 const discovery=new Promise(resolve=>{finish=resolve;});
 const controller=createOfficeController({autoRefresh:false,createClient:()=>({get running(){return running;},start:async()=>{running=true;},stop:async()=>{running=false;finish([]);},listThreads:async()=>[],discoverThreads:()=>discovery})});
 const enabling=controller.enableCodex();
 await new Promise(resolve=>setImmediate(resolve));
 await controller.disableCodex();
 await enabling;
 const provider=controller.snapshot().providers.find(p=>p.id==='Codex');
 assert.equal(provider.enabled,false);
 assert.equal(provider.availability,'unavailable');
 assert.equal(controller.snapshot().sessions.length,0);
});
