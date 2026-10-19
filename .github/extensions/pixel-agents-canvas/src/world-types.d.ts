import type { Appearance, OfficeSnapshot, Preferences, Freshness } from "./product-types.js";
import type { AgentState, ProviderName } from "./types.js";

export interface Position { x: number; y: number }
export interface Motif { id: string; label: string; symbol: string }
export type VoiceFlavor = "curious" | "dry-witted" | "earnest" | "calm" | "upbeat";
export type CharacterPose = "rest" | "focused" | "wait" | "attention" | "issue" | "completion" | "neutral" | "vignette" | "cleanup" | "desk-setup";
export type PropKind = "mug" | "leaves" | "paper" | "book" | "web";
export type OfficeEffectKind = "ghost" | "spider" | "screen-flicker" | "chair-movement";

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
    /** Fictional non-active atmosphere; independent of explicit session closure. */
    quiet: boolean;
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
    /** Absolute static/home anchor; semantic scene routes control temporary travel. */
    position: Position;
    deskPosition: Position;
    provider: ProviderName;
    providerName: string | null;
    providerRole: string | null;
    state: AgentState;
    ended: boolean;
    endedAt: number | null;
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
export type WorldPropLocation =
    | { kind: "desk"; spaceId: string; deskIndex: number | null; position: Position }
    | { kind: "zone"; zoneId: OfficeZoneId; slot: number };
export interface WorldProp {
    id: string;
    location: WorldPropLocation;
    kind: PropKind;
    createdAt: number;
    cleanupSceneId: string | null;
    fictional: true;
}
export type OfficeZoneId = "common-table" | "coffee-station" | "plant-corner" | "bookshelf" | "window";
export type WorldWaypoint =
    | { kind: "zone"; zoneId: OfficeZoneId }
    | { kind: "desk"; agentId: string };
export interface WorldScene {
    id: string;
    templateId: string;
    kind: "vignette" | "cleanup" | "desk-setup";
    label: string;
    participants: string[];
    /** Intermediate global zones/desk destinations; each character starts and returns to its own desk. */
    route: WorldWaypoint[];
    phase: "walking" | "acting" | "returning";
    startedAt: number;
    endsAt: number;
    fictional: true;
}
export type WorldActor = SpiderActor | GhostActor;
export interface SpiderActor {
    id: string;
    kind: "spider";
    spaceId: string;
    position: Position;
    /** Complete absolute path in the actor's physical space, including start and end. */
    route: Position[];
    startedAt: number;
    endsAt: number;
    fictional: true;
}
export interface GhostActor {
    id: string;
    kind: "ghost";
    clusterId: string;
    spaceId: string;
    position: Position;
    /** Complete deterministic room-local loop, including start and end. */
    route: Position[];
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
    kind: OfficeEffectKind;
    label: string;
    position: Position;
    startedAt: number;
    endsAt: number;
    fictional: true;
}
export interface WorldQuietEffect {
    id: string;
    clusterId: string;
    spaceId: string;
    kind: OfficeEffectKind;
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
    /** Independent fictional actors; scene routes contain shared waypoints only. */
    actors: WorldActor[];
    dialogue: WorldDialogue[];
    abandonedEffects: AbandonedEffect[];
    /** Ambient fiction for quiet, non-abandoned clusters; never carries an end marker. */
    quietEffects: WorldQuietEffect[];
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
