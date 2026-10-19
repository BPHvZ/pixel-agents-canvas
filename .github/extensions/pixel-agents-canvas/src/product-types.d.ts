import type { AgentState, ProviderAvailability, CapabilitySupport, ProviderName, CodexTurnOutcome } from "./types.js";

export type Freshness = "fresh" | "stale" | "unknown";
export interface ProviderHealth {
    id: ProviderName;
    source: "copilotcli" | "app-server";
    availability: ProviderAvailability;
    enabled: boolean;
    detail: string;
    observedAt: number | null;
    capabilities: { discovery: CapabilitySupport; agents: CapabilitySupport; navigation: CapabilitySupport };
}
export interface OfficeSession {
    id: string;
    provider: ProviderName;
    sourceId: string;
    title: string | null;
    parentSessionId: string | null;
    archived: boolean;
    closed: boolean;
    endedAt: number | null;
}
export interface OfficeAgent {
    id: string;
    sessionId: string;
    provider: ProviderName;
    sourceId: string;
    name: string | null;
    role: string | null;
    parentAgentId: string | null;
    state: AgentState;
    waitingReason: "approval" | "input" | null;
    connected: boolean;
    freshness: Freshness;
    observedAt: number | null;
    lastActivityAt: number | null;
    ended: boolean;
    endedAt: number | null;
    lastTurnOutcome: CodexTurnOutcome | null;
}
export interface FeedEvent {
    id: number;
    provider: ProviderName;
    agentId: string | null;
    sessionId: string | null;
    label: string;
    at: number;
}
export interface OfficeSnapshot {
    providers: ProviderHealth[];
    sessions: OfficeSession[];
    agents: OfficeAgent[];
    feed: FeedEvent[];
    now: number;
}
export interface Appearance {
    nickname: string;
    palette: string;
    outfit: "shirt" | "vest" | "overalls";
    accessory: "none" | "glasses" | "cap";
    deskProp: "none" | "plant" | "mug" | "book";
}
export interface Preferences {
    hideTitles: boolean;
    hiddenSessionTitles: Record<string, boolean>;
    showEnded: boolean;
    vignettes: boolean;
    dialogue: boolean;
    appearances: Record<string, Appearance>;
}
export interface OfficePageState {
    snapshot: OfficeSnapshot;
    preferences: Preferences;
    world?: import('./world-types.js').WorldView;
}
