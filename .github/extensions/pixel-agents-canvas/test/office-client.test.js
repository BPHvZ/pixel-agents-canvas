import test from 'node:test';
import assert from 'node:assert/strict';
import { parseOfficeState } from '../src/office-client.js';

const appearance={nickname:'',palette:'#f2a65a',outfit:'shirt',accessory:'none',deskProp:'none'};
const page=()=>({snapshot:{now:1000,providers:[],sessions:[],agents:[],feed:[]},preferences:{hideTitles:false,hiddenSessionTitles:{},showEnded:false,vignettes:true,dialogue:true,appearances:{}}});
const agent={id:'codex:one:agent:one',sessionId:'codex:one',provider:'Codex',sourceId:'one',name:'Refactor',role:null,parentAgentId:null,state:'idle',waitingReason:null,connected:true,freshness:'fresh',observedAt:1000,lastActivityAt:1000,ended:false,endedAt:null,lastTurnOutcome:null};

test('browser validates unknown JSON and discards invalid agents',()=>{
 assert.throws(()=>parseOfficeState(null),/Invalid office state/);
 assert.throws(()=>parseOfficeState({agents:'invalid'}),/Invalid office state/);
 const input=page();input.snapshot.agents=[null,{id:'incomplete'},agent];
 assert.equal(parseOfficeState(input).snapshot.agents.length,1);
});

test('browser normalizes unknown state and refuses untrusted CSS values',()=>{
 const input=page();input.snapshot.agents=[{...agent,state:'invented',connected:'true'}];
 input.preferences.appearances[agent.id]={...appearance,palette:'red; background:url("external")'};
 const state=parseOfficeState(input);
 assert.equal(state.snapshot.agents[0].state,'unknown');
 assert.equal(state.snapshot.agents[0].connected,false);
 assert.match(state.preferences.appearances[agent.id].palette,/^#[0-9a-f]{6}$/i);
});
