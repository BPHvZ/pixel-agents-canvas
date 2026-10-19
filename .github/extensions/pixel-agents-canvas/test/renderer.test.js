import test from 'node:test';
import assert from 'node:assert/strict';
import { renderHtml } from '../src/renderer.js';

test('renderer embeds session state without letting provider titles escape the script element',()=>{
 const title='</script><img src=x onerror=alert(1)>';
 const state={snapshot:{now:1000,providers:[],sessions:[{id:'codex:one',provider:'Codex',sourceId:'one',title,parentSessionId:null,archived:false,closed:false,endedAt:null}],agents:[],feed:[]},preferences:{hideTitles:false,hiddenSessionTitles:{},showEnded:false,vignettes:true,dialogue:true,appearances:{}}};
 const html=renderHtml({instanceId:'office-test',state});
 assert.ok(html.includes('office-test'));
 assert.equal(html.includes(title),false);
 assert.ok(html.includes('\\u003c/script>'));
 assert.ok(html.includes('id="agent-layer"'));
 assert.ok(html.includes('type="application/json"'));
 assert.ok(html.includes('src="/office-client.js"'));
});
