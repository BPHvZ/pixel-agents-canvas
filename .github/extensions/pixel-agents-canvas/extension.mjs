// @ts-check
import { createCanvas, CanvasError, joinSession } from '@github/copilot-sdk/extension';
import { createOfficeController } from './src/controller.js';
import { createPreferenceStore } from './src/preferences.js';
import { createOfficeServer } from './src/server.js';

const controller=createOfficeController();
const preferences=createPreferenceStore();
/** @type {Map<string, Promise<Awaited<ReturnType<typeof createOfficeServer>>>>} */
const panels=new Map();
let closed=false;
const emptyInput={type:/** @type {const} */('object'),properties:{},additionalProperties:/** @type {const} */(false)};

/** @param {unknown} input */
function assertEmptyInput(input) {
    if(input===undefined) return;
    if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length) throw new CanvasError('INVALID_INPUT','This action takes an empty object');
}
/** @param {unknown} error @returns {never} */
function storageFailure(error) {
    throw new CanvasError('OFFICE_UNAVAILABLE',error instanceof Error && error.name==='PreferenceError' ? error.message : 'Office data unavailable; existing preferences were preserved');
}
async function cleanup() {
    if(closed)return;
    closed=true;
    await controller.stop();
    await Promise.all([...panels.values()].map(async(entry)=>{try{await(await entry).close();}catch{ /* Initialization failure has already been surfaced to the host. */ }}));
    panels.clear();
}

const session=await joinSession({canvases:[createCanvas({
    id:'pixel-agents-canvas',
    displayName:'Pixel Agents Office',
    description:'A read-only office of observed provider activity with separately labeled decorative office life.',
    actions:[
        {name:'list_agents',description:'List provider health and observed agent states; excludes private titles and preferences.',inputSchema:emptyInput,handler:({input})=>{
            assertEmptyInput(input);
            const snapshot=controller.snapshot();
            return {providers:snapshot.providers,agents:snapshot.agents.map(({id,sessionId,provider,state,freshness,ended,waitingReason})=>({id,sessionId,provider,state,freshness,ended,waitingReason}))};
        }},
        {name:'enable_codex',description:'After explicit user consent, start local Codex metadata discovery. Never starts a model turn.',inputSchema:emptyInput,handler:async({input})=>{assertEmptyInput(input);await controller.enableCodex();return {providers:controller.snapshot().providers};}},
        {name:'disable_codex',description:'Stop only this canvas provider connection and its local child; does not stop any user agent.',inputSchema:emptyInput,handler:async({input})=>{assertEmptyInput(input);await controller.disableCodex();return {providers:controller.snapshot().providers};}},
        {name:'refresh_codex',description:'Refresh metadata from the already-enabled local Codex source.',inputSchema:emptyInput,handler:async({input})=>{assertEmptyInput(input);await controller.refreshCodex();return {providers:controller.snapshot().providers};}},
    ],
    open:async({instanceId})=>{
        if(closed)throw new CanvasError('SESSION_CLOSED','The hosting session has ended');
        let entry=panels.get(instanceId);
        if(!entry){
            entry=createOfficeServer({instanceId,controller,preferences});
            panels.set(instanceId,entry);
        }
        try{
            const panel=await entry;
            if(closed||panels.get(instanceId)!==entry)throw new CanvasError('INSTANCE_CLOSED','This office instance was closed while opening');
            return {title:'Pixel Agents Office',status:'Observed activity · decorative office life labeled separately',url:panel.url};
        }
        catch(error){if(panels.get(instanceId)===entry)panels.delete(instanceId);if(error instanceof CanvasError)throw error;return storageFailure(error);}
    },
    onClose:async({instanceId})=>{
        const entry=panels.get(instanceId);
        panels.delete(instanceId);
        if(entry){try{await(await entry).close();}catch{ /* Closing an already failed presentation requires no further cleanup. */ }}
    },
})]});
controller.bindHostingSession(session.sessionId);
session.on((event)=>{
    controller.copilotEvent(event);
    if(event.type==='session.shutdown')void cleanup();
});
process.once('SIGTERM',()=>{void cleanup().finally(()=>process.exit(0));});
process.once('SIGINT',()=>{void cleanup().finally(()=>process.exit(0));});
