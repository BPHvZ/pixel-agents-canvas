import type { Preferences, ProviderHealth } from "../../.github/extensions/pixel-agents-canvas/src/product-types.js";
import type { CodexMonitoringStatus, CodexThreadStatusType, CodexTurnEvent, ProviderAvailability, ProviderName } from "../../.github/extensions/pixel-agents-canvas/src/types.js";

export interface ScenarioProviderUpdate extends Partial<Omit<ProviderHealth, "id" | "source" | "capabilities">> {
    availability: ProviderAvailability;
    enabled: boolean;
    detail: string;
    observedAt: number;
}

export interface ScenarioRawCopilotEvent {
    id: string;
    type: "user.message" | "tool.execution_start" | "assistant.turn_start" | "session.idle" | "session.error" | "session.shutdown" | "subagent.started" | "subagent.completed" | "subagent.failed";
    timestamp: string;
    data: Record<string, unknown>;
}

export interface ScenarioCodexThread {
    id: string;
    title: string;
    status: { type: CodexThreadStatusType; activeFlags?: ("waitingOnApproval" | "waitingOnUserInput")[] };
    updatedAt: number;
    monitoring: CodexMonitoringStatus;
    parentThreadId?: string;
    agentNickname?: string;
    agentRole?: string;
    archived?: boolean;
}

export interface ScenarioFrame {
    id: string;
    scenarioId: string;
    atMs: number;
    afterStepId?: string;
    seed?: string;
    covers: readonly string[];
    expected: {
        sceneTemplateIds?: readonly string[];
        sceneKinds?: readonly ("vignette" | "cleanup" | "desk-setup")[];
        sceneRoutes?: readonly { templateId: string; route: readonly import("../../.github/extensions/pixel-agents-canvas/src/world-types.js").WorldWaypoint[]; phase?: "walking" | "acting" | "returning" }[];
        propLocations?: readonly { kind: import("../../.github/extensions/pixel-agents-canvas/src/world-types.js").PropKind; location: import("../../.github/extensions/pixel-agents-canvas/src/world-types.js").WorldPropLocation }[];
        actorKinds?: readonly import("../../.github/extensions/pixel-agents-canvas/src/world-types.js").WorldActor["kind"][];
        actorRoutes?: readonly { kind: import("../../.github/extensions/pixel-agents-canvas/src/world-types.js").WorldActor["kind"]; route: readonly import("../../.github/extensions/pixel-agents-canvas/src/world-types.js").Position[] }[];
        sceneParticipantCounts?: Readonly<Record<string, number>>;
        effectKinds?: readonly string[];
        poses?: readonly { agentId?: string; pose: import("../../.github/extensions/pixel-agents-canvas/src/world-types.js").CharacterPose }[];
        agentStates?: readonly { agentId?: string; state: import("../../.github/extensions/pixel-agents-canvas/src/types.js").AgentState; lastTurnOutcome?: CodexTurnEvent["outcome"]; ended?: boolean }[];
        providers?: readonly { id: ProviderName; availability: ProviderAvailability }[];
        sessionCount?: number;
        agentCount?: number;
        feedCount?: number;
        preferences?: { hideTitles?: boolean; showEnded?: boolean; vignettes?: boolean; dialogue?: boolean; hiddenSessionTitles?: readonly string[] };
        dialogue?: boolean;
        viewport?: "wide" | "tablet" | "narrow";
        reducedMotion?: boolean;
    };
}

export interface ScenarioStateInput {
    now: number;
    providerUpdates: {
        Copilot: ScenarioProviderUpdate | null;
        Codex: ScenarioProviderUpdate | null;
    };
    hostingSessionId: string | null;
    copilotEvents: readonly ScenarioRawCopilotEvent[];
    codexThreads: readonly ScenarioCodexThread[];
    codexTurns: readonly CodexTurnEvent[];
    codexObservedAt: number;
}

export interface ScenarioStepBase {
    id: string;
    atMs: number;
    providerUpdates?: Partial<{ Copilot: ScenarioProviderUpdate | null; Codex: ScenarioProviderUpdate | null }>;
    hostingSessionId?: string | null;
    copilotEvents?: readonly ScenarioRawCopilotEvent[];
    codexThreads?: readonly ScenarioCodexThread[];
    codexTurns?: readonly CodexTurnEvent[];
    codexObservedAt?: number;
}

export type ScenarioStep = ScenarioStepBase & (
    | { advanceTo: number; tickIntervalMs: number }
    | { advanceTo?: never; tickIntervalMs?: never }
);

export interface ScenarioFixture extends ScenarioStateInput {
    id: string;
    title: string;
    preferences: Preferences;
    viewport: "wide" | "tablet" | "narrow";
    reducedMotion: boolean;
    seed: string;
    /** How frequently to advance the production world while capturing frames, when no step defines its own interval. */
    worldTickIntervalMs?: number;
    frames: readonly ScenarioFrame[];
    steps: readonly ScenarioStep[];
}
