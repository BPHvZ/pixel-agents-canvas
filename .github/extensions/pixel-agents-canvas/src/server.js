// @ts-check
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { renderHtml } from './renderer.js';
import { createOfficeWorld } from './office-world.js';

/** @typedef {import('./product-types.js').Preferences} Preferences */
/** @typedef {{read: () => Promise<Preferences>, write: (input:unknown) => Promise<Preferences>}} PreferenceStorage */
const BODY_LIMIT = 512 * 1024;

class RequestBodyError extends Error {
    /** @param {400 | 413} status */
    constructor(status) {
        super(status === 413 ? 'Request body too large' : 'Invalid JSON request body');
        this.status = status;
    }
}

/** @param {import('node:http').IncomingMessage} request @returns {Promise<Buffer>} */
async function readBody(request) {
    const declared = Number(request.headers['content-length'] ?? 0);
    if (declared > BODY_LIMIT) throw new RequestBodyError(413);
    let size=0;
    const chunks=[];
    // Preserve the socket on a limit error long enough to send an HTTP rejection.
    for await (const chunk of request.iterator({destroyOnReturn:false})) {
        const bytes = /** @type {unknown} */ (chunk);
        if (!Buffer.isBuffer(bytes)) throw new RequestBodyError(400);
        size += bytes.length;
        if (size > BODY_LIMIT) throw new RequestBodyError(413);
        chunks.push(bytes);
    }
    return Buffer.concat(chunks);
}

/** @param {import('node:http').IncomingMessage} request @param {Buffer} body @returns {unknown} */
function readJson(request, body) {
    if (request.headers['content-type']?.split(';')[0]?.trim().toLowerCase() !== 'application/json') throw new RequestBodyError(400);
    try { return /** @type {unknown} */ (JSON.parse(body.toString('utf8'))); }
    catch { throw new RequestBodyError(400); }
}

/** @param {{instanceId:string, controller:ReturnType<import('./controller.js').createOfficeController>, preferences:PreferenceStorage, worldOptions?:import('./world-types.js').OfficeWorldOptions}} options */
export async function createOfficeServer({instanceId,controller,preferences,worldOptions}) {
    const world=createOfficeWorld(worldOptions);
    // Load storage before exposing a panel so corrupt records cannot be silently replaced.
    await preferences.read();
    /** @type {Map<string,{body:string,type:string}>} */
    const assets=new Map();
    /** @type {[string, string][]} */
    const scripts=[['office-client.js','text/javascript'],['office-world.js','text/javascript'],['office.css','text/css']];
    for (const [name,type] of scripts) {
        assets.set(`/${name}`,{body:await readFile(new URL(name,import.meta.url),'utf8'),type});
    }
    for (const name of ['common-table','coffee-station','desk-divider','mug','book','paper','paper-hat','web','plant','leaves','chair','bin','wall-art','spider','ghost','coffee-steam','recycling']) {
        if (!name) continue;
        assets.set(`/assets/${name}.svg`,{body:await readFile(new URL(`../assets/${name}.svg`,import.meta.url),'utf8'),type:'image/svg+xml'});
    }
    let origin='';
    /** @param {import('node:http').ServerResponse} response @param {number} status @param {unknown} value */
    function json(response,status,value) {
        if (response.destroyed) return;
        if (status >= 400) response.setHeader('connection','close');
        response.writeHead(status,{'content-type':'application/json; charset=utf-8'}).end(JSON.stringify(value));
    }
    const server=createServer((request,response)=>{
        response.setHeader('cache-control','no-store');
        response.setHeader('x-content-type-options','nosniff');
        response.setHeader('referrer-policy','no-referrer');
        response.setHeader('content-security-policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'");
        void (async()=>{
            if (`http://${request.headers.host}` !== origin) { json(response,403,{error:'Invalid host'});return; }
            const path=request.url ?? '';
            const asset=assets.get(path);
            const isRead=path==='/'||path==='/state'||path==='/health'||Boolean(asset);
            const isWrite=path==='/preferences'||path==='/codex/enable'||path==='/codex/disable'||path==='/codex/refresh';
            if (!isRead&&!isWrite) {json(response,404,{error:'Route not found'});return;}
            if ((isRead&&request.method!=='GET')||(isWrite&&request.method!=='POST')) {json(response,405,{error:'Method not allowed'});return;}
            if ((isWrite||request.headers.origin!==undefined)&&request.headers.origin!==origin) {json(response,403,{error:'Same-origin request required'});return;}
            const body=isWrite?await readBody(request):Buffer.alloc(0);
            if(response.destroyed)return;
            if(isWrite&&path!=='/preferences'&&body.length) {
                const input=readJson(request,body);
                if(input===null||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length) throw new RequestBodyError(400);
            }
            if (asset) {response.writeHead(200,{'content-type':`${asset.type}; charset=utf-8`}).end(asset.body);return;}
            if(path==='/health') {json(response,200,{ok:true});return;}
            if(path==='/preferences') {
                const input=readJson(request,body);
                try {json(response,200,await preferences.write(input));} catch {json(response,422,{error:'Preferences could not be saved completely; reload to inspect current local settings'});}
                return;
            }
            if(path==='/codex/enable') {await controller.enableCodex();json(response,200,{providers:controller.snapshot().providers});return;}
            if(path==='/codex/disable') {await controller.disableCodex();json(response,200,{providers:controller.snapshot().providers});return;}
            if(path==='/codex/refresh') {await controller.refreshCodex();json(response,200,{providers:controller.snapshot().providers});return;}
            const snapshot=controller.snapshot();
            const selectedPreferences=await preferences.read();
            world.update(snapshot,selectedPreferences);
            world.tick();
            const state={snapshot,preferences:selectedPreferences,world:world.view()};
            if(path==='/state') {json(response,200,state);return;}
            if(!response.destroyed)response.writeHead(200,{'content-type':'text/html; charset=utf-8'}).end(renderHtml({instanceId,state}));
        })().catch((error)=>{
            if(error instanceof RequestBodyError)json(response,error.status,{error:error.message});
            else if(!response.headersSent)json(response,500,{error:'Office state unavailable; no records were overwritten'});
            else response.end();
        });
    });
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',()=>resolve(undefined));});
    const address=server.address();
    if(!address||typeof address==='string') {server.close();throw new Error('No canvas listener address');}
    origin=`http://127.0.0.1:${address.port}`;
    /** @type {Promise<void> | undefined} */
    let closing;
    return {
        url:`${origin}/`,
        close:()=>{
            closing ??= new Promise((resolve,reject)=>{
                server.close((error)=>error?reject(error):resolve());
                server.closeAllConnections();
            });
            return closing;
        },
    };
}
