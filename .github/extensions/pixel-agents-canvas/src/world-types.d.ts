import type { Appearance, OfficeSnapshot, Preferences, Freshness } from "./product-types.js";
import type { AgentState, ProviderName } from "./types.js";

export interface Position { x: number; y: number }
export interface Motif { id: string; label: string; symbol: string }
export type VoiceFlavor = "curious" | "dry-witted" | "earnest" | "calm" | "upbeat";
export type CharacterPose = "rest" | "focused" | "wait" | "attention" | "issue" | "completion" | "neutral" | "vignette" | "cleanup" | "desk-setup";
export type PropKind = "mug" | "leaves" | "paper" | "book" | "web";
export type AbandonedEffectKind = "ghost" | "spider" | "screen-flicker" | "chair-movement";

export interface WorldCluster {
    id: string;
    sessionId: string;
    /** Physical space, reusable independently of provider/session identity. */
    spaceId: string;
    position: Position;
    provider: ProviderName;
    title: string | null;
    titleHidden: boolean;
    titleVisibilityNote: string;
    motifs: Motif[];
    abandoned: boolean;
    dimmed: boolean;
    endedAt: number | null;
    statusLabel: string;
    /** Ended clusters obey showEnded; replaced spaces are also hidden. */
    visible: boolean;
}
export interface WorldCharacter {
    id: string;
    agentId: string;
    sessionId: string;
    clusterId: string;
    spaceId: string;
    deskId: string;
    deskIndex: number;
    /** Absolute world coordinates; these final positions need no animation. */
    position: Position;
    deskPosition: Position;
    provider: ProviderName;
    providerName: string | null;
    providerRole: string | null;
    state: AgentState;
    waitingReason: "approval" | "input" | null;
    freshness: Freshness;
    connected: boolean;
    /** False means retained identity absent from the latest complete snapshot, not an inferred exit. */
    observed: boolean;
    appearance: Appearance;
    voiceFlavor: VoiceFlavor;
    pose: CharacterPose;
    statusLabel: string;
    sceneId: string | null;
    sceneLabel: string | null;
}
export interface WorldProp {
    id: string;
    /** Props belong to physical space, not a returning/new session's context. */
    spaceId: string;
    deskIndex: number | null;
    kind: PropKind;
    position: Position;
    createdAt: number;
    cleanupSceneId: string | null;
    fictional: true;
}
export interface WorldScene {
    id: string;
    templateId: string;
    kind: "vignette" | "cleanup" | "desk-setup";
    label: string;
    participants: string[];
    startedAt: number;
    endsAt: number;
    fictional: true;
}
export interface WorldDialogue {
    id: string;
    agentId: string;
    flavor: VoiceFlavor;
    label: string;
    text: string;
    startedAt: number;
    endsAt: number;
    placement: "secondary";
    fictional: true;
}
export interface AbandonedEffect {
    id: string;
    clusterId: string;
    spaceId: string;
    kind: AbandonedEffectKind;
    label: string;
    position: Position;
    startedAt: number;
    endsAt: number;
    fictional: true;
}
export interface WorldView {
    now: number;
    fictionLabel: "Office fiction — not provider activity or collaboration";
    /** All animation is optional. Keep static positions, readable labels, and status cues in reduced motion. */
    motion: { optional: true; reducedMotion: "static"; flashing: false };
    clusters: WorldCluster[];
    characters: WorldCharacter[];
    props: WorldProp[];
    scenes: WorldScene[];
    dialogue: WorldDialogue[];
    abandonedEffects: AbandonedEffect[];
}
export interface OfficeWorldOptions {
    /** Milliseconds; defaults to Date.now. update/tick advance time; view is observational. */
    clock?: () => number;
    /** Unit interval; injected for reproducible cadence/shuffle behavior. */
    random?: () => number;
}
export interface OfficeWorld {
    update(snapshot: OfficeSnapshot, preferences: Preferences): void;
    /** No background timers, network, model calls, storage, or assets. */
    tick(): void;
    /** Detached render-ready data; no factual feed is synthesized or returned. */
    view(): WorldView;
}
