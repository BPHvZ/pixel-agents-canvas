import test from 'node:test';
import assert from 'node:assert/strict';
import { createOfficeServer } from '../src/server.js';
import { createOfficeController } from '../src/controller.js';
import { request as httpRequest } from 'node:http';
import { connect } from 'node:net';
import { once } from 'node:events';
import { spawnSync } from 'node:child_process';
import { PreferenceError, validatePreferences } from '../src/preferences.js';

/** @param {URL} url @param {import('node:http').RequestOptions} options @param {string} [body] */
function request(url,options,body) {
    return new Promise((resolve,reject)=>{
        const outgoing=httpRequest(url,options,response=>{
            let text='';
            response.setEncoding('utf8');
            response.on('data',chunk=>{text+=chunk;});
            response.on('end',()=>resolve({status:response.statusCode,text}));
            response.on('error',reject);
        });
        outgoing.on('error',reject);
        outgoing.end(body);
    });
}
const preferences={hideTitles:false,hiddenSessionTitles:{},showEnded:false,vignettes:true,dialogue:true,appearances:{}};

test('all write routes bound declared and streamed bodies before invoking mutations',async()=>{
    let starts=0;let writes=0;
    const controller=createOfficeController({autoRefresh:false,createClient:()=>({running:false,start:async()=>{starts++;},stop:async()=>{},listThreads:async()=>[],discoverThreads:async()=>[]})});
    const server=await createOfficeServer({instanceId:'limits',controller,preferences:{read:async()=>preferences,write:async()=>{writes++;return preferences;}}});
    const origin=new URL(server.url).origin;
    try {
        for(const path of ['/preferences','/codex/enable','/codex/disable','/codex/refresh']) {
            for(const transfer of [{'content-length':String(512*1024+1)},{'transfer-encoding':'chunked'}]) {
                const response=await request(new URL(path,server.url),{method:'POST',headers:{origin,'content-type':'application/json',...transfer}},' '.repeat(512*1024+1));
                assert.equal(response.status,413,`${path}: ${JSON.stringify(transfer)}`);
            }
        }
        assert.equal(starts,0);
        assert.equal(writes,0);
        const atLimit=' '.repeat(512*1024-2)+'{}';
        assert.equal((await request(new URL('/preferences',server.url),{method:'POST',headers:{origin,'content-type':'application/json'}},atLimit)).status,200);
        assert.equal((await request(new URL('/codex/enable',server.url),{method:'POST',headers:{origin,'content-type':'application/json'}},atLimit)).status,200);
        assert.equal(writes,1);
        assert.equal(starts,1);
    } finally {await server.close();await controller.stop();}
});

test('control routes accept empty input but reject unexpected bodies without starting a provider',async()=>{
    let starts=0;let running=false;
    const controller=createOfficeController({autoRefresh:false,createClient:()=>({get running(){return running;},start:async()=>{starts++;running=true;},stop:async()=>{running=false;},listThreads:async()=>[],discoverThreads:async()=>[]})});
    const server=await createOfficeServer({instanceId:'inputs',controller,preferences:{read:async()=>preferences,write:async()=>preferences}});
    const origin=new URL(server.url).origin;
    try {
        for(const path of ['/codex/enable','/codex/disable','/codex/refresh']) {
            for(const body of ['{','null','[]','{"unexpected":true}']) {
                assert.equal((await request(new URL(path,server.url),{method:'POST',headers:{origin,'content-type':'application/json'}},body)).status,400);
            }
            assert.equal((await request(new URL(path,server.url),{method:'POST',headers:{origin,'content-type':'text/plain'}},'{}')).status,400);
        }
        assert.equal(starts,0);
        assert.equal((await request(new URL('/codex/enable',server.url),{method:'POST',headers:{origin}},'')).status,200);
        assert.equal((await request(new URL('/codex/refresh',server.url),{method:'POST',headers:{origin,'content-type':'application/json'}},'{}')).status,200);
        assert.equal((await request(new URL('/codex/disable',server.url),{method:'POST',headers:{origin}})).status,200);
        assert.equal(starts,1);
    } finally {await server.close();await controller.stop();}
});

test('HTTP methods, hostile origins and hosts never reach preference writes',async()=>{
    let writes=0;
    const controller=createOfficeController({autoRefresh:false});
    const server=await createOfficeServer({instanceId:'origins',controller,preferences:{read:async()=>preferences,write:async()=>{writes++;return preferences;}}});
    const origin=new URL(server.url).origin;
    try {
        for(const method of ['GET','PUT','DELETE','PATCH','HEAD']) {
            assert.equal((await request(new URL('/preferences',server.url),{method,headers:{origin}})).status,405);
        }
        for(const supplied of [undefined,'null','https://untrusted.invalid',`${origin}.untrusted.invalid`,`${origin}/`,`${origin}, https://untrusted.invalid`]) {
            assert.equal((await request(new URL('/preferences',server.url),{method:'POST',headers:supplied===undefined?{}:{origin:supplied}},'{}')).status,403);
        }
        assert.equal((await request(new URL('/state',server.url),{headers:{origin:'https://untrusted.invalid'}})).status,403);
        assert.equal((await request(new URL('/state',server.url),{headers:{host:'untrusted.invalid'}})).status,403);
        assert.equal((await request(new URL('/state',server.url),{method:'POST'})).status,405);
        assert.equal((await request(new URL('/missing',server.url),{method:'POST'})).status,404);
        assert.equal(writes,0);
    } finally {await server.close();await controller.stop();}
});

test('corrupt preferences fail initialization and later read/write errors never report success or private data',async()=>{
    const controller=createOfficeController({autoRefresh:false});
    await assert.rejects(createOfficeServer({instanceId:'corrupt',controller,preferences:{read:async()=>{throw new PreferenceError('CORRUPT_PREFERENCES');},write:async()=>preferences}}),{code:'CORRUPT_PREFERENCES'});
    let corrupt=false;let writes=0;
    const server=await createOfficeServer({instanceId:'errors',controller,preferences:{
        read:async()=>{if(corrupt)throw new Error('private storage path sentinel');return preferences;},
        write:async input=>{writes++;validatePreferences(input);throw new PreferenceError('CORRUPT_PREFERENCES');},
    }});
    const origin=new URL(server.url).origin;
    try {
        corrupt=true;
        for(const path of ['/','/state']) {
            const response=await request(new URL(path,server.url),{});
            assert.equal(response.status,500);
            assert.ok(!response.text.includes('sentinel'));
        }
        for(const body of ['{','null',JSON.stringify(preferences)]) {
            const response=await request(new URL('/preferences',server.url),{method:'POST',headers:{origin,'content-type':'application/json'}},body);
            assert.equal(response.status,body==='{'?400:422);
            assert.ok(!response.text.includes('sentinel'));
        }
        assert.equal(writes,2);
    } finally {await server.close();await controller.stop();}
});

test('instance close is idempotent and terminates active and incomplete HTTP connections',async()=>{
    const controller=createOfficeController({autoRefresh:false});
    let releaseRead=()=>{};let notifyRead=()=>{};let waiting=false;
    const blocked=new Promise(resolve=>{releaseRead=resolve;});
    const reading=new Promise(resolve=>{notifyRead=resolve;});
    const server=await createOfficeServer({instanceId:'close',controller,preferences:{read:async()=>{if(waiting){notifyRead();await blocked;}return preferences;},write:async()=>preferences}});
    const address=new URL(server.url);
    const incomplete=connect(Number(address.port),'127.0.0.1');
    incomplete.on('error',()=>{});
    await once(incomplete,'connect');
    incomplete.write('GET /state HTTP/1.1\r\nHost: ');
    waiting=true;
    const active=httpRequest(new URL('/state',server.url));
    active.on('error',()=>{});
    active.end();
    await reading;
    const closing=server.close();
    let timeout;
    try {
        const outcome=await Promise.race([closing.then(()=>'closed'),new Promise(resolve=>{timeout=setTimeout(()=>resolve('timed out'),300);})]);
        assert.equal(outcome,'closed');
        await server.close();
        await assert.rejects(request(new URL('/health',server.url),{}));
    } finally {
        clearTimeout(timeout);
        releaseRead();incomplete.destroy();active.destroy();
        await closing;await controller.stop();
    }
});

test('closing one instance leaves the shared provider and other instance available',async()=>{
    let stops=0;
    const controller=createOfficeController({autoRefresh:false,createClient:()=>({running:true,start:async()=>{},stop:async()=>{stops++;},listThreads:async()=>[],discoverThreads:async()=>[]})});
    await controller.enableCodex();
    const options={controller,preferences:{read:async()=>preferences,write:async()=>preferences}};
    const first=await createOfficeServer({instanceId:'first',...options});
    const second=await createOfficeServer({instanceId:'second',...options});
    try {
        await first.close();
        assert.equal((await request(new URL('/health',second.url),{})).status,200);
        assert.equal(controller.snapshot().providers.find(p=>p.id==='Codex').enabled,true);
        assert.equal(stops,0);
    } finally {await first.close();await second.close();await controller.stop();}
    assert.equal(stops,1);
});

test('closing listeners and stopping controller recovery lets an isolated process exit naturally',()=>{
    const script=`
        import {createOfficeServer} from ${JSON.stringify(new URL('../src/server.js',import.meta.url).href)};
        import {createOfficeController} from ${JSON.stringify(new URL('../src/controller.js',import.meta.url).href)};
        import {connect} from 'node:net';
        import {once} from 'node:events';
        const controller=createOfficeController({createClient:()=>({running:false,start:async()=>{throw new Error('unavailable');},stop:async()=>{},listThreads:async()=>[],discoverThreads:async()=>[]})});
        await controller.enableCodex();
        const preferences=${JSON.stringify(preferences)};
        let notifyRead;let opened=false;
        const reading=new Promise(resolve=>{notifyRead=resolve;});
        const server=await createOfficeServer({instanceId:'process',controller,preferences:{read:async()=>{if(opened){notifyRead();await new Promise(()=>{});}return preferences;},write:async()=>preferences}});
        opened=true;
        const socket=connect(Number(new URL(server.url).port),'127.0.0.1');
        socket.on('error',()=>{});
        await once(socket,'connect');
        socket.write('GET /state HTTP/1.1\\r\\nHost: '+new URL(server.url).host+'\\r\\n\\r\\n');
        await reading;
        await server.close();
        await controller.stop();
        console.log('closed');
    `;
    const result=spawnSync(process.execPath,['--input-type=module','--eval',script],{encoding:'utf8',timeout:2000});
    assert.equal(result.error,undefined);
    assert.equal(result.status,0,result.stderr);
    assert.equal(result.stdout.trim(),'closed');
});

test('server serves explicit assets/state and rejects cross-origin writes, invalid methods and unknown routes', async()=>{
 const controller=createOfficeController({autoRefresh:false});
 controller.bindHostingSession('test');
 let writes=0;
 const store={read:async()=>preferences,write:async()=>{writes++;return preferences;}};
 const server=await createOfficeServer({instanceId:'test',controller,preferences:store});
 try{
  const url=server.url;
  const state=await fetch(new URL('/state',url)).then(r=>r.json());
  assert.equal(state.snapshot.agents.length,1);
  assert.equal((await fetch(new URL('/unknown',url))).status,404);
  assert.equal((await fetch(new URL('/state',url),{method:'POST'})).status,405);
  assert.equal((await fetch(new URL('/preferences',url),{method:'POST',headers:{origin:'https://untrusted.invalid','content-type':'application/json'},body:'{}'})).status,403);
  assert.equal(writes,0);
  const html=await fetch(url).then(r=>r.text());
  assert.ok(html.includes('/office-client.js'));
  assert.equal((await fetch(new URL('/office-client.js',url))).headers.get('content-type').startsWith('text/javascript'),true);
 }finally{await server.close();await controller.stop();}
});

test('open-instance presentation props survive page reload but a new instance starts a clean world',async()=>{
 let now=0;
 const controller=createOfficeController({autoRefresh:false,clock:()=>now});
 controller.bindHostingSession('test');controller.copilotEvent({type:'session.idle'});
 const store={read:async()=>preferences,write:async()=>preferences};
 const options={controller,preferences:store,worldOptions:{clock:()=>now,random:()=>0}};
 const first=await createOfficeServer({instanceId:'first',...options});
 let second;
 try{
  await fetch(first.url);
  now=10000;
  const before=await fetch(new URL('/state',first.url)).then(r=>r.json());
  assert.ok(before.world.props.length);
  now=14000;
  const reloaded=await fetch(first.url).then(r=>r.text());
  assert.ok(reloaded.includes(before.world.props[0].id));
  const after=await fetch(new URL('/state',first.url)).then(r=>r.json());
  assert.equal(after.world.props[0].id,before.world.props[0].id);
  second=await createOfficeServer({instanceId:'second',...options});
  const fresh=await fetch(new URL('/state',second.url)).then(r=>r.json());
  assert.equal(fresh.world.props.length,0);
 }finally{await first.close();await second?.close();await controller.stop();}
});
