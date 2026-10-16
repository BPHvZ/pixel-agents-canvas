import { createServer } from "node:http";
import { createCanvas, joinSession } from "@github/copilot-sdk/extension";
import { createStore, genericCopilotLabel } from "./src/state.js";
import { createCodexClient } from "./src/codex-client.js";

const servers = new Map();
const store = createStore();
const now = () => new Date().toISOString();
const palette = { Copilot: "#64d8b4", Codex: "#f2a65a" };
const safeJson = (value) => JSON.stringify(value).replaceAll("<", "\\u003c");
let codexClient;
let codexStatus = { connected: false, error: "Codex is disabled. Enable it here to connect to your local Codex CLI." };
function publicAgents() {
    const rows = store.list().filter((item) => !item.id.startsWith("provider:"));
    return ["Copilot", "Codex"].map((provider) => {
        const item = rows.find((row) => row.provider === provider);
        const connected = provider === "Codex" ? codexStatus.connected : Boolean(item?.connected);
        return { id: provider.toLowerCase(), name: provider, provider, role: provider === "Copilot" ? "This Copilot App session" : "Local Codex thread", state: connected ? item?.state ?? "idle" : "unknown", task: connected ? item?.task ?? "Connected · waiting for activity" : provider === "Codex" ? codexStatus.error : "No Copilot session activity yet", color: palette[provider], connected, updatedAt: item?.updatedAt ? new Date(item.updatedAt).toISOString() : now() };
    });
}
function record({ provider, id, state, event, at }) {
    const label = provider === "Copilot" ? genericCopilotLabel(event) : ({ "thread-start": "Codex thread ready", "turn-start": "Working on a request", "turn-complete": "Request finished", error: "Codex encountered an error" })[event] ?? "Codex activity updated";
    store.upsert({ id, provider: provider === "copilot" ? "Copilot" : provider, state, task: label, connected: true, at });
}
function copilotHooks() {
    const update = (event, state = "working") => () => { record({ provider: "Copilot", id: "copilot:current-session", state, event, at: Date.now() }); };
    return {
        onSessionStart: update("session-start", "idle"),
        onSessionEnd: update("session-end", "idle"),
        onUserPromptSubmitted: update("prompt-submitted"),
        onPreToolUse: update("tool-start"),
        onPostToolUse: update("tool-complete", "working"),
        onPostToolUseFailure: update("tool-complete", "failed"),
        onErrorOccurred: update("error", "failed"),
    };
}
function enableCodex() {
    if (codexClient?.running) return;
    codexClient = createCodexClient({ onEvent: record, onStatus: (status) => { codexStatus = status; } });
    codexClient.start().catch((error) => { codexStatus = { connected: false, error: error.message }; });
}

function renderHtml(instanceId) {
    const payload = safeJson({ instanceId, agents: publicAgents(), codexStatus });
    return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><title>Pixel Agents · Office</title>
<style>
:root{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;color:#e9e3d5;background:#12171d;font-synthesis:none}*{box-sizing:border-box}body{margin:0;min-height:100vh;background:radial-gradient(ellipse at 50% -15%,#34434b 0,#1d272e 48%,#141a20 100%);padding:clamp(14px,3vw,34px)}button{font:inherit;color:inherit}.app{max-width:1120px;margin:auto}.top{display:flex;justify-content:space-between;align-items:center;gap:16px;margin-bottom:20px}.brand{display:flex;align-items:center;gap:13px}.mark{width:42px;height:42px;display:grid;place-items:center;background:#e9a95c;color:#263037;box-shadow:inset -5px -5px #bd774e,inset 4px 4px #ffe29a;font-size:22px}.eyebrow{font-size:10px;letter-spacing:.18em;color:#a5b2af;text-transform:uppercase}.brand h1{font-size:18px;margin:4px 0 0;letter-spacing:-.06em}.live{font-size:10px;color:#91d8b8;display:flex;gap:8px;align-items:center}.dot{width:7px;height:7px;background:#74d9ae;box-shadow:0 0 12px #74d9ae;border-radius:50%}.office{border:1px solid #53636a;background:#27333a;padding:8px;box-shadow:0 16px 50px #080c11aa}.room{position:relative;min-height:410px;overflow:hidden;border:1px solid #182126;background-color:#34443e;background-image:linear-gradient(90deg,#283831 1px,transparent 1px),linear-gradient(#283831 1px,transparent 1px);background-size:32px 32px}.room:before{content:"";position:absolute;inset:0;background:linear-gradient(90deg,transparent 49.7%,#25312d 49.7%,#25312d 50.3%,transparent 50.3%),linear-gradient(transparent 49.7%,#25312d 49.7%,#25312d 50.3%,transparent 50.3%);opacity:.55;pointer-events:none}.window{position:absolute;left:5%;top:7%;width:18%;height:22%;background:#405f72;border:8px solid #805f49;box-shadow:inset 0 0 0 4px #b1845e,inset 0 0 0 6px #24363e}.window:before,.window:after{content:"";position:absolute;background:#b1845e}.window:before{width:4px;top:0;bottom:0;left:50%}.window:after{height:4px;left:0;right:0;top:50%}.sun{position:absolute;width:22px;height:22px;background:#ffd27c;right:15%;top:17%;box-shadow:0 0 28px #ffd27c88}.plant{position:absolute;left:6%;bottom:12%;font-size:34px;color:#81b780}.shelf{position:absolute;right:6%;top:8%;height:19%;width:17%;border-top:8px solid #8e684e;border-bottom:8px solid #8e684e}.shelf:before{content:"▥ ▣ ▤";position:absolute;top:-24px;color:#e9a95c;letter-spacing:7px;font-size:14px}.rug{position:absolute;width:46%;height:22%;left:27%;bottom:7%;background:#29323b;border:5px dashed #64777a;opacity:.8}.desk{position:absolute;width:190px;max-width:28%;height:18px;background:#bd895c;bottom:31%;box-shadow:0 10px 0 #805d45}.monitor{position:absolute;width:66px;height:52px;bottom:calc(31% + 18px);background:#263b43;border:5px solid #bb9c73;box-shadow:inset 0 0 0 2px #5d9b91}.monitor:after{content:"";position:absolute;width:7px;height:9px;background:#bb9c73;left:24px;bottom:-13px}.desk.left{left:12%}.desk.right{right:12%}.desk.mid{left:calc(50% - 95px);bottom:60%}.monitor.left{left:calc(12% + 61px)}.monitor.right{right:calc(12% + 61px)}.monitor.mid{left:calc(50% - 33px);bottom:calc(60% + 18px)}.chair{position:absolute;width:35px;height:26px;bottom:calc(31% - 36px);background:#536a6b;border:4px solid #34494c}.chair.left{left:calc(12% + 78px)}.chair.right{right:calc(12% + 78px)}.chair.mid{left:calc(50% - 18px);bottom:calc(60% - 36px)}.character{position:absolute;z-index:2;width:44px;height:54px;bottom:calc(31% - 14px);left:calc(12% + 74px);transition:transform .3s;image-rendering:pixelated}.character.right{left:auto;right:calc(12% + 74px)}.character.mid{left:calc(50% - 22px);bottom:calc(60% - 14px)}.head{position:absolute;width:28px;height:27px;left:8px;top:0;background:var(--agent);box-shadow:inset -5px -5px #0003,0 0 0 4px #273238}.head:before{content:"";position:absolute;width:4px;height:4px;background:#142129;left:6px;top:10px;box-shadow:11px 0 #142129}.body{position:absolute;left:6px;top:30px;width:32px;height:22px;background:#e6dfcc;box-shadow:inset -6px -4px #a6a08e}.label{position:absolute;z-index:3;bottom:calc(31% - 61px);left:calc(12% + 42px);font-size:9px;color:#f5e8cb;background:#26343bcc;padding:4px 6px;white-space:nowrap}.label.right{left:auto;right:calc(12% + 42px)}.label.mid{left:calc(50% - 34px);bottom:calc(60% - 61px)}.activity{position:absolute;z-index:4;left:calc(50% + 17px);bottom:calc(60% + 50px);background:#f5e8cb;color:#34423d;padding:5px 7px;font-size:9px;box-shadow:3px 3px #20302d}.floorlabel{position:absolute;z-index:1;left:50%;top:51%;transform:translateX(-50%);font-size:9px;letter-spacing:.22em;color:#9eac9e;text-transform:uppercase}.controls{display:flex;justify-content:space-between;align-items:center;padding:13px 4px 4px;gap:12px}.controls small{color:#9ca9a7;font-size:10px}.reset{border:1px solid #55656a;background:#334148;padding:7px 10px;font-size:10px;cursor:pointer}.reset:hover{background:#40535a}.roster{margin-top:15px;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.card{background:#202a30;border:1px solid #39484e;padding:12px;min-width:0;text-align:left;cursor:pointer}.card:hover{border-color:#91d8b8;transform:translateY(-2px)}.cardhead{display:flex;align-items:center;gap:9px}.avatar{width:25px;height:25px;background:var(--agent);box-shadow:inset -4px -4px #0003;position:relative}.avatar:after{content:"";position:absolute;width:4px;height:4px;background:#172228;top:9px;left:6px;box-shadow:8px 0 #172228}.name{font-size:11px}.provider{font-size:9px;color:#9eaaa8;margin-top:3px}.status{margin:12px 0 5px;font-size:10px;color:#9bd9b8}.task{font-size:10px;color:#c3c9c1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.foot{color:#889692;font-size:9px;margin:17px 2px 0;line-height:1.7}.foot strong{color:#d4b478}@media(max-width:640px){.room{min-height:360px}.roster{grid-template-columns:1fr}.desk{max-width:34%;width:150px}.desk.left{left:5%}.desk.right{right:5%}.monitor.left{left:calc(5% + 43px)}.monitor.right{right:calc(5% + 43px)}.character{left:calc(5% + 58px)}.character.right{left:auto;right:calc(5% + 58px)}.label{left:calc(5% + 24px)}.label.right{left:auto;right:calc(5% + 24px)}}
</style></head><body><main class="app"><header class="top"><div class="brand"><div class="mark">✦</div><div><div class="eyebrow">Your tiny team, at work</div><h1>AGENT OFFICE</h1></div></div><div class="live"><span class="dot"></span> OFFICE OPEN <span id="clock"></span></div></header>
<section class="office"><div class="controls"><small id="connection">Copilot: current session only · Codex: off</small><button class="reset" id="codex">Enable local Codex</button></div><div class="room"><div class="window"></div><div class="sun"></div><div class="shelf"></div><div class="plant">♣</div><div class="rug"></div><div class="floorlabel">creative department · floor 01</div><div class="desk left"></div><div class="desk right"></div><div class="desk mid"></div><div class="monitor left"></div><div class="monitor right"></div><div class="monitor mid"></div><div class="chair left"></div><div class="chair right"></div><div class="chair mid"></div>
<div class="character" id="char-copilot" style="--agent:#64d8b4"><div class="head"></div><div class="body"></div></div><div class="label" id="label-copilot">Copilot</div><div class="character right" id="char-codex" style="--agent:#f2a65a"><div class="head"></div><div class="body"></div></div><div class="label right" id="label-codex">Codex</div><div class="activity" id="activity">✦ nice to see you!</div></div><div class="controls"><small>Activity labels never include prompts or tool content.</small><button class="reset" id="thread">＋ New Codex thread</button></div></section>
<section class="roster" id="roster"></section><p class="foot"><strong>REAL ACTIVITY</strong> · Copilot reflects hooks from this hosting session only. Codex is opt-in and starts a local app-server; threads created elsewhere are not monitored. No prompts, source files, or tool output are retained. Activity stays in memory for this extension process.</p></main>
<script>const roster=${payload}.agents;const statusText={working:'▣ Working',thinking:'✦ Thinking',idle:'◌ Idle',completed:'✓ Complete',failed:'⚠ Issue',unknown:'◌ Unknown',waiting:'… Waiting'};function esc(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}function draw(){document.getElementById('roster').innerHTML=roster.map(a=>'<article class="card" style="--agent:'+esc(a.color)+'"><div class="cardhead"><div class="avatar"></div><div><div class="name">'+esc(a.name)+'</div><div class="provider">'+esc(a.provider)+' · '+esc(a.role)+'</div></div></div><div class="status">'+(statusText[a.state]||statusText.unknown)+(a.connected?' · connected':' · disconnected')+'</div><div class="task">'+esc(a.task)+'</div></article>').join('');for(const a of roster){const e=document.getElementById('char-'+a.id);if(e)e.style.opacity=a.connected?'1':'.45';const label=document.getElementById('label-'+a.id);if(label)label.textContent=a.name+(a.connected?' · '+a.state:' · offline')}document.getElementById('activity').textContent='✦ '+(roster.find(a=>a.state==='working')?.task||'your team is waiting');document.getElementById('connection').textContent='Copilot: '+(roster[0].connected?'connected to this session':'waiting for activity')+' · Codex: '+(roster[1].connected?'connected':'off');document.getElementById('codex').textContent=roster[1].connected?'Codex enabled':'Enable local Codex'}document.getElementById('codex').onclick=async()=>{await fetch('/codex/enable',{method:'POST'});setTimeout(()=>location.reload(),700)};document.getElementById('thread').onclick=async()=>{const r=await fetch('/codex/thread',{method:'POST'});const d=await r.json();document.getElementById('activity').textContent=d.error||('✦ Codex thread '+d.threadId+' ready')};document.getElementById('clock').textContent=new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});draw();</script></body></html>`;
}

async function startServer(instanceId) {
    const server = createServer((req, res) => {
        if (req.method === "POST" && req.url === "/codex/enable") { enableCodex(); res.writeHead(202).end(); return; }
        if (req.method === "POST" && req.url === "/codex/thread") {
            res.setHeader("content-type", "application/json");
            if (!codexClient?.running) { res.writeHead(409).end(JSON.stringify({ error: "Enable Codex first; local Codex CLI must be installed and authenticated." })); return; }
            codexClient.startThread().then((result) => res.end(JSON.stringify(result))).catch((error) => { res.writeHead(500).end(JSON.stringify({ error: error.message })); }); return;
        }
        if (req.url === "/health") { res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ ok: true })); return; }
        res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" });
        res.end(renderHtml(instanceId));
    });
    await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
    return { server, url: `http://127.0.0.1:${server.address().port}/` };
}

const session = await joinSession({ canvases: [createCanvas({
    id: "pixel-agents-canvas",
    displayName: "Pixel Agents Office",
    description: "A pixel-art office showing metadata-only activity from this Copilot session and opt-in local Codex threads.",
    actions: [
        { name: "list_agents", description: "List provider connections and current agent activity.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, handler: () => ({ agents: publicAgents() }) },
        { name: "enable_codex", description: "Start the local Codex app-server after explicit user consent.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, handler: () => { enableCodex(); return { started: true }; } },
        { name: "start_codex_thread", description: "Create an empty ephemeral Codex thread. Does not start a model turn or incur usage by itself.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, handler: async () => { if (!codexClient?.running) throw new Error("Enable Codex first"); return codexClient.startThread(); } },
    ],
    open: async (ctx) => {
        let entry = servers.get(ctx.instanceId);
        if (!entry) { entry = await startServer(ctx.instanceId); servers.set(ctx.instanceId, entry); }
        return { title: "Pixel Agents · Office", status: "Provider activity · metadata only", url: entry.url };
    },
    onClose: async ({ instanceId }) => {
        const entry = servers.get(instanceId);
        if (entry) { servers.delete(instanceId); await new Promise((resolve) => entry.server.close(resolve)); }
    },
})], hooks: copilotHooks() });
session.on("session.end", async () => { await codexClient?.stop(); for (const { server } of servers.values()) server.close(); servers.clear(); });
