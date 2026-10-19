export type AgentState = "idle" | "working" | "waiting" | "completed" | "failed" | "unknown";
export type ProviderName = "Copilot" | "Codex";
export type ProviderAvailability = "unsupported" | "unavailable" | "connected" | "empty" | "stale" | "disconnected" | "unknown";
export type CapabilitySupport = "supported" | "unsupported" | "unavailable" | "unknown";
export type CodexThreadStatusType = "active" | "idle" | "systemError" | "notLoaded" | "unknown";
export type CodexTurnOutcome = "completed" | "interrupted" | "failed" | "inProgress" | "unknown";
export type ThreadLifecycleEvent = "closed" | "archived" | "unarchived";
export type CodexActivityEventName = "turn-start" | "thread-status" | "session-end" | "error";
export type Timestamp = number | string | null;

export interface CodexNotificationParams {
    threadId?: string;
    thread?: { id?: string };
    turn?: { id?: string; status?: string };
    status?: { type?: string; activeFlags?: string[] };
}

export interface CodexProtocolMessage {
    id?: number | null;
    method?: string;
    params?: CodexNotificationParams;
    result?: unknown;
    error?: { message?: string } | null;
}

export interface CodexThreadListPage {
    data: unknown[];
    nextCursor?: string | null;
}

export interface CodexThreadStatus {
    type: CodexThreadStatusType;
    activeFlags: string[];
}

export interface RawCodexThread {
    id?: unknown;
    title?: unknown;
    name?: unknown;
    parentThreadId?: unknown;
    status?: unknown;
    createdAt?: unknown;
    updatedAt?: unknown;
    source?: unknown;
    modelProvider?: unknown;
}

export interface CodexThreadMetadata {
    id: string;
    title: string | null;
    parentThreadId: string | null;
    status: CodexThreadStatus | null;
    createdAt: Timestamp;
    updatedAt: Timestamp;
    source: string | null;
    modelProvider: string | null;
    archived: boolean;
}

export type CodexMonitoringStatus = "subscribed" | "unavailable" | "archived";

export interface DiscoveredCodexThread extends CodexThreadMetadata {
    monitoring: CodexMonitoringStatus;
}

export interface CodexListOptions {
    archived?: boolean;
    limit?: number;
}

export interface CodexDiscoveryOptions {
    includeArchived?: boolean;
}

export interface CodexActivityEvent {
    provider: "codex";
    id: string;
    waitingReason?: "approval" | "input" | null;
    state: AgentState;
    event: CodexActivityEventName;
    at: number;
}

export interface CodexTurnEvent {
    threadId: string;
    turnId: string | null;
    outcome: CodexTurnOutcome;
    at: number;
}

export interface CodexThreadLifecycleEvent {
    threadId: string;
    event: ThreadLifecycleEvent;
    at: number;
}

export interface CodexClientStatus {
    availability: ProviderAvailability;
    connected: boolean;
    error: string;
}

export interface ChildProcessLike {
    stdin: {
        destroyed: boolean;
        write(chunk: string, callback?: (error?: Error | null) => void): boolean;
    };
    stdout: {
        on(event: "data", listener: (chunk: Uint8Array) => void): unknown;
    };
    stderr: {
        on(event: "data", listener: (chunk: Uint8Array) => void): unknown;
    };
    once(event: "error", listener: (error: Error) => void): unknown;
    once(event: "exit", listener: (code: number | null, signal: string | null) => void): unknown;
    kill(signal: "SIGTERM" | "SIGKILL"): boolean;
    exitCode: number | null;
    signalCode: string | null;
}

export interface CodexClientOptions {
    onEvent?: (event: CodexActivityEvent) => void;
    onTurn?: (event: CodexTurnEvent) => void;
    onThreadLifecycle?: (event: CodexThreadLifecycleEvent) => void;
    onStatus?: (status: CodexClientStatus) => void;
    spawnProcess?: (command: string, args: string[], options: { stdio: ["pipe", "pipe", "pipe"]; windowsHide: boolean }) => ChildProcessLike;
    executable?: string;
    timeoutMs?: number;
}

export interface CodexClient {
    start(): Promise<void>;
    stop(): Promise<void>;
    listThreads(options?: CodexListOptions): Promise<CodexThreadMetadata[]>;
    discoverThreads(options?: CodexDiscoveryOptions): Promise<DiscoveredCodexThread[]>;
    readonly running: boolean;
}

export interface NormalizedSession {
    id: string;
    provider: string;
    source: string;
    sourceId: string;
    summary: string | null;
    state: AgentState;
    updatedAt: number | null;
    freshness: "fresh" | "stale" | "unknown";
    parentSessionId: string | null;
}

export interface NormalizedAgent {
    id: string;
    sessionId: string;
    provider: string;
    source: string;
    sourceId: string;
    name: string | null;
    parentId: string | null;
    state: AgentState;
}

export interface NormalizedSnapshot {
    sessions: NormalizedSession[];
    agents: NormalizedAgent[];
}

export interface NormalizedProviderStatus {
    provider: string;
    source: string;
    availability: ProviderAvailability;
    updatedAt: number | null;
}

export type OfficeActivityEventName = "session-start" | "session-end" | "prompt-submitted" | "tool-start" | "tool-complete" | "error" | "turn-start" | "thread-status";
export type ActivityProviderKey = ProviderName | "copilot" | "codex";

export interface OfficeActivityInput {
    provider: ActivityProviderKey;
    id: string;
    state?: AgentState;
    event: OfficeActivityEventName;
    at: number;
}

export interface CodexStatus {
    availability: ProviderAvailability;
    connected: boolean;
    error: string;
    sessionCount?: number;
    archivedCount?: number;
    monitoringUnavailableCount?: number;
    updatedAt?: number | null;
}

export interface OfficeAgentCard {
    id: string;
    kind: "provider" | "session";
    name: string;
    provider: ProviderName;
    role: string;
    sessionId?: string;
    parentSessionId?: string | null;
    sourceId?: string;
    archived?: boolean;
    monitoring?: CodexMonitoringStatus;
    state: AgentState;
    task: string;
    color: string;
    connected: boolean;
    freshness?: "fresh" | "stale" | "unknown";
    availability?: ProviderAvailability;
    updatedAt: string;
}

export interface ActivityRecord {
    id: string;
    provider: string;
    name: string;
    state: AgentState;
    task: string;
    connected: boolean;
    freshness: "fresh" | "stale" | "unknown";
    updatedAt: number;
}

export interface ActivityInput {
    id: string;
    provider: string;
    name?: string;
    state?: AgentState;
    task?: string;
    connected?: boolean;
    at?: number;
}

export interface ActivityStore {
    upsert(input: ActivityInput): ActivityRecord | null;
    setProvider(provider: string, connected: boolean, detail?: string): ActivityRecord;
    get(id: string): ActivityRecord | null;
    list(): ActivityRecord[];
    expireStale(): void;
    subscribe(listener: (record: ActivityRecord) => void): () => boolean;
    clear(): void;
}
