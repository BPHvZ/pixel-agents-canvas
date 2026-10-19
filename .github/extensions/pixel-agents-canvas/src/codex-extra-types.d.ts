import type {
    CodexClient as BaseCodexClient,
    CodexDiscoveryOptions,
    CodexListOptions,
    CodexMonitoringStatus,
    CodexThreadMetadata as BaseCodexThreadMetadata,
} from "./types.js";

export interface CodexThreadMetadata extends BaseCodexThreadMetadata {
    sessionId?: string | null;
    agentNickname?: string | null;
    agentRole?: string | null;
}

export interface DiscoveredCodexThread extends CodexThreadMetadata {
    monitoring: CodexMonitoringStatus;
}

export interface CodexClient extends Omit<BaseCodexClient, "listThreads" | "discoverThreads"> {
    listThreads(options?: CodexListOptions): Promise<CodexThreadMetadata[]>;
    discoverThreads(options?: CodexDiscoveryOptions): Promise<DiscoveredCodexThread[]>;
}
