import { spawn } from "node:child_process";
import { StringDecoder } from "node:string_decoder";

const CLIENT = { name: "pixel_agents_office", title: "Pixel Agents Office", version: "0.1.0" };
const MAX_LINE = 1_000_000;

export function createCodexClient({ onEvent = () => {}, onStatus = () => {}, spawnProcess = spawn, executable = "codex", timeoutMs = 12_000 } = {}) {
    let child;
    let buffer = "";
    let nextId = 1;
    let decoder;
    let closedByUs = false;
    const pending = new Map();
    const ownedThreads = new Set();
    const turns = new Map();

    function write(method, params = {}) {
        if (!child || child.stdin.destroyed) return Promise.reject(new Error("Codex app-server is not running"));
        const id = nextId++;
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Codex request timed out: ${method}`)); }, timeoutMs);
            pending.set(id, { resolve, reject, timer, method });
            child.stdin.write(`${JSON.stringify({ method, id, params })}\n`, (err) => {
                if (err) { clearTimeout(timer); pending.delete(id); reject(err); }
            });
        });
    }
    function failPending(error) {
        for (const request of pending.values()) { clearTimeout(request.timer); request.reject(error); }
        pending.clear();
    }
    function handle(message) {
        if (message.id != null && pending.has(message.id)) {
            const request = pending.get(message.id); pending.delete(message.id); clearTimeout(request.timer);
            if (message.error) request.reject(new Error(message.error.message ?? `Codex request failed: ${request.method}`));
            else request.resolve(message.result);
            return;
        }
        if (!message.method || !message.method.includes("/")) return;
        const p = message.params ?? {};
        const threadId = p.threadId ?? p.thread?.id;
        if (threadId && !ownedThreads.has(threadId)) return;
        if (message.method === "turn/started" && threadId && ownedThreads.has(threadId)) {
            turns.set(threadId, p.turn?.id);
            onEvent({ provider: "codex", id: `codex:${threadId}`, state: "working", event: "turn-start", at: Date.now() });
        } else if (message.method === "turn/completed" && threadId && ownedThreads.has(threadId)) {
            turns.delete(threadId);
            const status = p.turn?.status;
            onEvent({ provider: "codex", id: `codex:${threadId}`, state: status === "failed" ? "failed" : "completed", event: "turn-complete", at: Date.now() });
        } else if (message.method === "thread/status/changed" && threadId && ownedThreads.has(threadId)) {
            const status = p.status?.type ?? "unknown";
            onEvent({ provider: "codex", id: `codex:${threadId}`, state: status === "active" ? "working" : status === "idle" ? "idle" : "unknown", event: "thread-status", at: Date.now() });
        } else if (message.method === "error" && threadId && ownedThreads.has(threadId)) {
            onEvent({ provider: "codex", id: `codex:${threadId}`, state: "failed", event: "error", at: Date.now() });
        }
    }
    function consume(chunk) {
        buffer += decoder.write(chunk);
        if (buffer.length > MAX_LINE && !buffer.includes("\n")) { buffer = ""; onStatus({ connected: false, error: "Codex sent an oversized protocol message" }); return; }
        let end;
        while ((end = buffer.indexOf("\n")) !== -1) {
            const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
            if (!line.trim()) continue;
            if (line.length > MAX_LINE) continue;
            try { handle(JSON.parse(line)); } catch { /* Ignore malformed or unrecognized server output. */ }
        }
    }
    async function start() {
        if (child) return;
        closedByUs = false; buffer = ""; decoder = new StringDecoder("utf8");
        child = spawnProcess(executable, ["app-server", "--listen", "stdio://"], { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
        child.stdout.on("data", consume);
        child.stderr.on("data", () => {});
        child.once("error", (error) => { onStatus({ connected: false, error: error.message }); failPending(error); child = undefined; });
        child.once("exit", (code, signal) => {
            child = undefined; failPending(new Error(`Codex app-server exited (${signal ?? code ?? "unknown"})`));
            ownedThreads.clear(); turns.clear(); onStatus({ connected: false, error: closedByUs ? "Stopped" : `Codex app-server exited (${signal ?? code ?? "unknown"})` });
        });
        try {
            await write("initialize", { clientInfo: CLIENT });
            onStatus({ connected: true, error: "" });
        } catch (error) {
            await stop(); onStatus({ connected: false, error: error.message }); throw error;
        }
    }
    async function startThread() {
        if (!child) throw new Error("Enable the Codex provider first");
        const result = await write("thread/start", { cwd: process.cwd(), ephemeral: true });
        const thread = result?.thread;
        if (!thread?.id) throw new Error("Codex did not return a thread ID");
        ownedThreads.add(thread.id);
        onEvent({ provider: "codex", id: `codex:${thread.id}`, state: "idle", event: "thread-start", at: Date.now() });
        return { threadId: thread.id, status: thread.status ?? "idle" };
    }
    async function stop() {
        if (!child) return;
        closedByUs = true;
        const current = child; child = undefined;
        failPending(new Error("Codex app-server stopped"));
        current.kill("SIGTERM");
        await Promise.race([new Promise((resolve) => current.once("exit", resolve)), new Promise((resolve) => setTimeout(resolve, 1500))]);
        if (current.exitCode == null && current.signalCode == null) current.kill("SIGKILL");
        ownedThreads.clear(); turns.clear();
    }
    return { start, stop, startThread, get running() { return Boolean(child); } };
}
