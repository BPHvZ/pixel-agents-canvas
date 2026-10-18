/** @typedef {import('./product-types.js').OfficeAgent} OfficeAgent */
/** @typedef {import('./product-types.js').OfficeSession} OfficeSession */
/** @typedef {import('./product-types.js').Preferences} Preferences */
/** @typedef {import('./world-types.js').WorldView} WorldView */
/** @typedef {import('./world-types.js').WorldCharacter} WorldCharacter */
/** @typedef {import('./world-types.js').CharacterPose} CharacterPose */
/** @typedef {import('./world-types.js').VoiceFlavor} VoiceFlavor */
/** @typedef {{session: OfficeSession, space: number, desks: Map<string, number>, abandoned: boolean, retired: boolean, endedAt: number | null}} Cluster */

/** @type {VoiceFlavor[]} */
const VOICES = ["curious", "dry-witted", "earnest", "calm", "upbeat"];
const PALETTES = ["#5c8ed6", "#c77951", "#7a9e64", "#aa78bc", "#cc9f42", "#5baba3"];
/** @type {Record<VoiceFlavor, readonly string[]>} */
const DIALOGUE_LINES = {
    curious: ["Does the fern have a favorite day?", "I wonder where tiny clouds go.", "Could this mug tell a story?", "The window has a new shade."],
    "dry-witted": ["That paper stack is gaining altitude.", "The chair has plans of its own.", "A serious meeting with a mug.", "The clock is winning again."],
    earnest: ["A little care makes home.", "One small thing at a time.", "This corner feels brighter now.", "A kind pause can help."],
    calm: ["There is room for a quiet breath.", "The light moves gently here.", "Let the afternoon take its time.", "A peaceful corner is enough."],
    upbeat: ["A little sunshine makes this corner feel warm and welcoming today.", "The office plants look splendid today!", "What a lovely day for a stretch!", "This desk has excellent company."],
};
/** @type {{kind: import('./world-types.js').OfficeEffectKind, label: string}[]} */
const HAUNTS = [
    { kind: "ghost", label: "A little office ghost drifts past" },
    { kind: "spider", label: "A tiny spider spins a web" },
    { kind: "screen-flicker", label: "A sleeping screen glows softly (not an error)" },
    { kind: "chair-movement", label: "An empty chair turns a little" },
];
const VIGNETTES = [
    { id: "coffee", label: "Sharing a coffee break" },
    { id: "tea", label: "Pouring a cup of tea" },
    { id: "stretch", label: "Stretching and taking a short walk" },
    { id: "plant", label: "Caring for the office plants" },
    { id: "tidy", label: "Tidying the office" },
    { id: "reading", label: "Reading a little book" },
    { id: "antics", label: "Balancing a paper hat" },
    { id: "chat", label: "A friendly office chat" },
];
const OFF_DUTY_VIGNETTES = [
    { id: "off-duty-stroll", label: "Taking a gentle stroll in the common area" },
    { id: "off-duty-plants", label: "Enjoying a quiet stroll by the office plants" },
    { id: "off-duty-window", label: "Taking a gentle walk to the sunny window" },
    { id: "off-duty-books", label: "A quiet stroll past the common-area bookshelf" },
];

/** @template T @param {readonly T[]} values @param {() => number} random */
function shuffleCycle(values, random) {
    /** @type {T[]} */
    let bag = [];
    /** @type {T | undefined} */
    let previous;
    return () => {
        if (!bag.length) {
            bag = [...values];
            for (let i = bag.length - 1; i > 0; i--) {
                const j = Math.floor(random() * (i + 1));
                const left = bag[i];
                const right = bag[j];
                if (left !== undefined && right !== undefined) { bag[i] = right; bag[j] = left; }
            }
            if (bag.length > 1 && bag[bag.length - 1] === previous) bag.unshift(...bag.splice(bag.length - 1, 1));
        }
        previous = bag.pop();
        return previous;
    };
}

/** @param {string} text */
function hash(text) {
    let value = 2166136261;
    for (const point of text) value = Math.imul(value ^ (point.codePointAt(0) ?? 0), 16777619) >>> 0;
    return value;
}

/** @param {string} agentId @returns {import('./product-types.js').Appearance} */
export function deterministicAppearance(agentId) {
    const value = hash(agentId);
    /** @type {import('./product-types.js').Appearance['outfit'][]} */
    const outfits = ["shirt", "vest", "overalls"];
    /** @type {import('./product-types.js').Appearance['accessory'][]} */
    const accessories = ["none", "glasses", "cap"];
    /** @type {import('./product-types.js').Appearance['deskProp'][]} */
    const deskProps = ["none", "plant", "mug", "book"];
    return { nickname: "", palette: PALETTES[value % PALETTES.length] ?? "#5c8ed6", outfit: outfits[(value >>> 4) % 3] ?? "shirt", accessory: accessories[(value >>> 8) % 3] ?? "none", deskProp: deskProps[(value >>> 12) % 4] ?? "none" };
}

/** @type {{id: string, label: string, symbol: string, pattern: RegExp}[][]} */
const MOTIF_AXES = [
    [
        { id: "implementation", label: "Implementation", symbol: "🧩", pattern: /\b(implement(?:ation|ing|ed)?|features?)\b/i },
        { id: "debugging", label: "Debugging", symbol: "🔎", pattern: /\b(debug(?:ging)?|bugs?|fix(?:ing|es|ed)?)\b/i },
        { id: "refactoring", label: "Refactoring", symbol: "♻", pattern: /\b(refactor(?:ing|ed)?|restructure)\b/i },
        { id: "review", label: "Review", symbol: "👓", pattern: /\b(review(?:ing|ed)?|code review)\b/i },
        { id: "testing", label: "Testing", symbol: "🧪", pattern: /\b(tests?|testing|coverage|specs?)\b/i },
        { id: "docs", label: "Documentation", symbol: "📚", pattern: /\b(docs?|documentation|readme|guide)\b/i },
        { id: "design", label: "Design", symbol: "✏", pattern: /\b(design(?:ing)?|prototype|wireframes?)\b/i },
        { id: "research", label: "Research", symbol: "🔬", pattern: /\b(research|investigat(?:e|ion)|exploration)\b/i },
        { id: "planning", label: "Planning", symbol: "🗓", pattern: /\b(plan(?:ning)?|roadmap|milestones?)\b/i },
        { id: "performance", label: "Performance", symbol: "⚡", pattern: /\b(performance|optimi[sz](?:e|ation)|latency|benchmark)\b/i },
        { id: "accessibility", label: "Accessibility", symbol: "♿", pattern: /\b(accessibility|a11y|screen reader|keyboard navigation)\b/i },
        { id: "security", label: "Security", symbol: "🔒", pattern: /\b(security|vulnerabilit(?:y|ies)|authentication|authorization)\b/i },
        { id: "data-schema", label: "Data / schema", symbol: "🗃", pattern: /\b(data|schema|schemas|data model)\b/i },
        { id: "apis", label: "API work", symbol: "🔌", pattern: /\b(apis?|endpoints?|graphql|restful)\b/i },
        { id: "dependencies", label: "Dependencies", symbol: "📦", pattern: /\b(dependenc(?:y|ies)|packages?|lockfile)\b/i },
        { id: "ci-build", label: "CI / build", symbol: "🏗", pattern: /\b(ci|cd|build|pipeline|compil(?:e|ation)|bundl(?:e|ing))\b/i },
        { id: "release", label: "Release", symbol: "🚀", pattern: /\b(release|publish(?:ing)?|versioning|changelog)\b/i },
        { id: "migration", label: "Migration", symbol: "🌉", pattern: /\b(migrat(?:e|ion|ing)|upgrade)\b/i },
        { id: "cleanup", label: "Cleanup", symbol: "🧹", pattern: /\b(cleanup|clean up|tidy|unused|dead code)\b/i },
        { id: "configuration", label: "Configuration", symbol: "⚙", pattern: /\b(config(?:uration)?|settings|environment variables)\b/i },
    ],
    [
        { id: "frontend", label: "Frontend", symbol: "🖥", pattern: /\b(front[ -]?end|react|vue|angular|svelte|css|html|ui)\b/i },
        { id: "backend", label: "Backend", symbol: "⚙", pattern: /\b(back[ -]?end|servers?|express|django|fastapi)\b/i },
        { id: "storage", label: "Storage", symbol: "🗄", pattern: /\b(storage|databases?|sql|sqlite|postgres(?:ql)?|redis|mongodb)\b/i },
        { id: "apis", label: "APIs", symbol: "🔗", pattern: /\b(apis?|endpoints?|graphql|restful)\b/i },
        { id: "mobile", label: "Mobile", symbol: "📱", pattern: /\b(mobile|ios|android|swiftui|flutter|react native)\b/i },
        { id: "desktop", label: "Desktop", symbol: "💻", pattern: /\b(desktop|electron|tauri|macos|windows|appkit)\b/i },
        { id: "cloud-infra", label: "Cloud / infrastructure", symbol: "☁", pattern: /\b(cloud|infra(?:structure)?|aws|azure|kubernetes|docker|terraform)\b/i },
        { id: "cli-tooling", label: "CLI / tooling", symbol: "⌨", pattern: /\b(cli|tooling|command[ -]line|terminal|shell)\b/i },
        { id: "ml-ai", label: "ML / AI", symbol: "🤖", pattern: /\b(ml|ai|machine learning|llms?|neural|model training)\b/i },
        { id: "graphics-games", label: "Graphics / games", symbol: "🎨", pattern: /\b(graphics|games?|gaming|shaders?|webgl|sprites?|canvas)\b/i },
    ],
];

/** @param {string | null} title @returns {import('./world-types.js').Motif[]} */
export function deriveMotifs(title) {
    if (!title) return [];
    return MOTIF_AXES.flatMap((axis, index) => axis.map((motif) => ({ motif, at: title.search(motif.pattern) }))
        .filter((match) => match.at >= 0).sort((left, right) => left.at - right.at).slice(0, 2)
        .map(({ motif }) => ({ id: `${index === 0 ? "work" : "domain"}:${motif.id}`, label: motif.label, symbol: motif.symbol })));
}

/** @param {OfficeAgent} agent @returns {CharacterPose} */
function factualPose(agent) {
    if (!agent.connected || agent.freshness !== "fresh") return "neutral";
    switch (agent.state) {
        case "working": return "focused";
        case "waiting": return agent.waitingReason === "approval" ? "attention" : "wait";
        case "failed": return "issue";
        case "completed": return "rest";
        case "idle": return "rest";
        case "unknown": return "neutral";
    }
}

/** @param {import('./world-types.js').OfficeWorldOptions} [options] @returns {import('./world-types.js').OfficeWorld} */
export function createOfficeWorld({ clock = Date.now, random = Math.random } = {}) {
    let now = 0;
    let sequence = 0;
    let participantOffset = 0;
    /** @type {number | null} */
    let nextVignetteAt = null;
    /** @type {import('./world-types.js').WorldScene[]} */
    let scenes = [];
    /** @type {import('./product-types.js').ProviderHealth[]} */
    let providers = [];
    const unitRandom = () => { const value = random(); return Number.isFinite(value) ? Math.min(1 - Number.EPSILON, Math.max(0, value)) : 0; };
    const cadence = () => 10000 + Math.round(unitRandom() * 20000);
    const dialogueCadence = () => 15000 + Math.round(unitRandom() * 15000);
    const nextVignette = shuffleCycle(VIGNETTES, unitRandom);
    const nextOffDutyVignette = shuffleCycle(OFF_DUTY_VIGNETTES, unitRandom);
    const nextHaunt = shuffleCycle(HAUNTS, unitRandom);
    const nextQuietEffect = shuffleCycle(HAUNTS, unitRandom);
    /** @type {number | null} */
    let nextHauntAt = null;
    /** @type {number | null} */
    let nextQuietEffectAt = null;
    let hauntOffset = 0;
    let quietEffectOffset = 0;
    let spaces = 0;
    /** @type {import('./world-types.js').WorldProp[]} */
    let props = [];
    /** @type {import('./world-types.js').AbandonedEffect[]} */
    let effects = [];
    /** @type {import('./world-types.js').WorldQuietEffect[]} */
    let quietEffects = [];
    /** @type {Map<string, number>} */
    const completionUntil = new Map();
    /** @type {Map<string, number>} */
    const lastDialogueAt = new Map();
    /** @type {Map<string, number>} */
    const dialogueDueAt = new Map();
    /** @type {Map<string, () => string | undefined>} */
    const dialogueCycles = new Map();
    /** @type {import('./world-types.js').WorldDialogue[]} */
    let dialogue = [];
    /** @type {Preferences} */
    let preferences = { hideTitles: false, hiddenSessionTitles: {}, showEnded: true, vignettes: true, dialogue: true, appearances: {} };
    /** @type {Map<string, OfficeAgent>} */
    const agents = new Map();
    /** @type {Map<string, Cluster>} */
    const clusters = new Map();
    /** @type {Set<string>} */
    let observed = new Set();

    function readClock() { const value = clock(); if (Number.isFinite(value)) now = Math.max(now, value); }

    /** @param {OfficeAgent} agent */
    function sourceAvailable(agent) {
        const health = providers.find((provider) => provider.id === agent.provider);
        return !health || health.enabled && ["connected", "empty"].includes(health.availability);
    }

    /** @param {Cluster} cluster */
    function quietCluster(cluster) {
        if (cluster.abandoned) return false;
        return ![...agents.values()].some((agent) => agent.sessionId === cluster.session.id && observed.has(agent.id) && !agent.ended && agent.freshness === "fresh" && ["working", "waiting", "failed"].includes(agent.state));
    }

    /** @param {OfficeAgent} agent */
    function dialogueVisible(agent) {
        const cluster = clusters.get(agent.sessionId);
        return preferences.dialogue && (observed.has(agent.id) || agent.ended) && (!agent.ended || preferences.showEnded) && Boolean(cluster && (!cluster.retired || agent.ended && preferences.showEnded));
    }

    /** @param {OfficeAgent} agent */
    function speak(agent) {
        const flavor = VOICES[hash(agent.id) % VOICES.length] ?? "calm";
        const key = `${agent.id}:${agent.state}`;
        let nextLine = dialogueCycles.get(key);
        if (!nextLine) {
            nextLine = shuffleCycle(DIALOGUE_LINES[flavor], unitRandom);
            dialogueCycles.set(key, nextLine);
        }
        const text = nextLine();
        if (!text) return;
        const wordCount = text.trim().split(/\s+/u).length;
        const duration = Math.max(3000, Math.min(8000, wordCount * 300));
        dialogue.push({ id: `dialogue:${++sequence}`, agentId: agent.id, flavor, label: "Fictional character dialogue", text, startedAt: now, endsAt: now + duration, placement: "secondary", fictional: true });
        lastDialogueAt.set(agent.id, now);
        dialogueDueAt.set(agent.id, now + dialogueCadence());
    }

    /** @param {OfficeAgent} agent */
    function eligible(agent) {
        return observed.has(agent.id) && !agent.ended && agent.state === "idle" && agent.freshness === "fresh" && agent.connected && clusters.get(agent.sessionId)?.session.closed === false && sourceAvailable(agent);
    }

    /** @param {OfficeAgent} agent */
    function groupEligible(agent) {
        if (agent.ended) return preferences.showEnded && Boolean(clusters.get(agent.sessionId));
        return eligible(agent);
    }

    /** @param {OfficeAgent} agent */
    function soloEligible(agent) {
        const cluster = clusters.get(agent.sessionId);
        if (agent.ended) return preferences.showEnded && Boolean(cluster);
        if (!observed.has(agent.id) || !cluster || cluster.retired || cluster.session.closed) return false;
        if (agent.state === "idle" && agent.freshness === "fresh" && agent.connected && sourceAvailable(agent)) return true;
        return agent.state === "unknown" || agent.freshness !== "fresh" || !agent.connected || !sourceAvailable(agent);
    }

    /** @param {number} space */
    function origin(space) { return { x: space % 3 * 400, y: Math.floor(space / 3) * 300 }; }

    /** @param {Cluster} cluster @param {number} index */
    function deskPosition(cluster, index) {
        const point = origin(cluster.space);
        return { x: point.x + 40 + index % 4 * 90, y: point.y + 80 + Math.floor(index / 4) * 90 };
    }

    /** @param {import('./world-types.js').PropKind} kind @param {Cluster} cluster @param {number | null} index */
    function leaveProp(kind, cluster, index) {
        props.push({ id: `prop:${++sequence}`, spaceId: `space:${cluster.space}`, deskIndex: index, kind, position: index === null ? { x: origin(cluster.space).x + 20, y: origin(cluster.space).y + 30 } : deskPosition(cluster, index), createdAt: now, cleanupSceneId: null, fictional: true });
    }

    /** @param {import('./world-types.js').WorldScene} scene */
    function cancel(scene) {
        for (const prop of props) if (prop.cleanupSceneId === scene.id) prop.cleanupSceneId = null;
        scenes = scenes.filter((candidate) => candidate.id !== scene.id);
    }

    /** @param {import('./world-types.js').WorldScene} scene */
    function sceneIsValid(scene) {
        if (!preferences.vignettes) return false;
        return scene.participants.every((id) => {
            const agent = agents.get(id);
            if (!agent) return false;
            if (scene.kind === "desk-setup") return observed.has(id) && !agent.ended && agent.connected && agent.freshness === "fresh" && !clusters.get(agent.sessionId)?.session.closed;
            if (scene.kind === "cleanup") return eligible(agent);
            return scene.participants.length > 1 ? groupEligible(agent) : soloEligible(agent);
        });
    }

    function advance() {
        dialogue = dialogue.filter((bubble) => {
            const agent = agents.get(bubble.agentId);
            return Boolean(agent && bubble.endsAt > now && dialogueVisible(agent));
        });
        for (const [id, until] of completionUntil) if (until <= now || !agents.has(id)) completionUntil.delete(id);
        for (const scene of [...scenes]) {
            if (!sceneIsValid(scene)) cancel(scene);
            else if (scene.endsAt <= now) {
                props = props.filter((prop) => prop.cleanupSceneId !== scene.id);
                scenes = scenes.filter((candidate) => candidate.id !== scene.id);
            }
        }
        const groupCandidates = [...agents.values()].filter(groupEligible);
        const soloCandidates = [...agents.values()].filter(soloEligible);
        const soloOnlyCandidates = soloCandidates.filter((agent) => !groupEligible(agent));
        if (!preferences.vignettes || !soloCandidates.length) nextVignetteAt = null;
        else {
            if (nextVignetteAt === null) nextVignetteAt = now + cadence();
            if (now >= nextVignetteAt && !scenes.length) {
                const chooseSoloOnly = soloOnlyCandidates.length > 0 && participantOffset % 2 === 1;
                /** @type {string[]} */
                let participants = [];
                /** @type {{id: string, label: string} | undefined} */
                let template;
                if (chooseSoloOnly) {
                    const solo = soloOnlyCandidates[Math.floor(participantOffset / 2) % soloOnlyCandidates.length];
                    if (solo) participants = [solo.id];
                } else if (groupCandidates.length > 1) {
                    participants = Array.from({ length: Math.min(2, groupCandidates.length) }, (_, i) => groupCandidates[(participantOffset + i) % groupCandidates.length]?.id).filter((id) => id !== undefined);
                } else if (groupCandidates.length === 1) {
                    const only = groupCandidates[0];
                    if (only) participants = [only.id];
                } else {
                    const solo = soloCandidates[participantOffset % soloCandidates.length];
                    if (solo) participants = [solo.id];
                }
                const first = agents.get(participants[0] ?? "");
                template = first?.ended && participants.length === 1 ? nextOffDutyVignette() : nextVignette();
                participantOffset++;
                if (template && participants.length) {
                    const target = template.id === "tidy" && participants.every((id) => {
                        const participant = agents.get(id);
                        return Boolean(participant && eligible(participant));
                    }) ? props.find((prop) => !prop.cleanupSceneId && [...clusters.values()].some((cluster) => `space:${cluster.space}` === prop.spaceId && !cluster.retired && (!cluster.abandoned || preferences.showEnded))) : undefined;
                    const scene = { id: `scene:${++sequence}`, templateId: template.id, kind: target ? "cleanup" : "vignette", label: `Office fiction: ${template.label}`, participants, startedAt: now, endsAt: now + 4000, fictional: true };
                    /** @type {import('./world-types.js').WorldScene} */
                    const staged = { ...scene, kind: target ? "cleanup" : "vignette", fictional: true };
                    scenes.push(staged);
                    if (target) target.cleanupSceneId = staged.id;
                    const cluster = clusters.get(first?.sessionId ?? "");
                    if (first && cluster) {
                        /** @type {Partial<Record<string, import('./world-types.js').PropKind>>} */
                        const kinds = { coffee: "mug", tea: "mug", plant: "leaves", reading: "book", antics: "paper" };
                        const kind = kinds[template.id];
                        if (kind) leaveProp(kind, cluster, cluster.desks.get(first.id) ?? 0);
                    }
                    nextVignetteAt = now + cadence();
                }
            }
        }
        effects = effects.filter((effect) => effect.endsAt > now && preferences.vignettes && [...clusters.values()].some((cluster) => cluster.abandoned && !cluster.retired && `cluster:${cluster.session.id}` === effect.clusterId));
        const abandoned = [...clusters.values()].filter((cluster) => cluster.abandoned && !cluster.retired && preferences.showEnded);
        if (!preferences.vignettes || !abandoned.length) { nextHauntAt = null; effects = []; }
        else {
            if (nextHauntAt === null) nextHauntAt = now + cadence();
            if (now >= nextHauntAt && !effects.length) {
                const cluster = abandoned[hauntOffset++ % abandoned.length];
                const haunt = nextHaunt();
                if (cluster && haunt) {
                    effects.push({ id: `haunt:${++sequence}`, clusterId: `cluster:${cluster.session.id}`, spaceId: `space:${cluster.space}`, kind: haunt.kind, label: `Office fiction: ${haunt.label}`, position: origin(cluster.space), startedAt: now, endsAt: now + 4000, fictional: true });
                    if (haunt.kind === "spider") leaveProp("web", cluster, null);
                }
                nextHauntAt = now + cadence();
            }
        }
        const quietClusters = [...clusters.values()].filter((cluster) => quietCluster(cluster) && !cluster.retired);
        quietEffects = quietEffects.filter((effect) => effect.endsAt > now && preferences.vignettes && quietClusters.some((cluster) => `cluster:${cluster.session.id}` === effect.clusterId));
        if (!preferences.vignettes || !quietClusters.length) { nextQuietEffectAt = null; quietEffects = []; }
        else {
            if (nextQuietEffectAt === null) nextQuietEffectAt = now + cadence();
            if (now >= nextQuietEffectAt && !quietEffects.length) {
                const cluster = quietClusters[quietEffectOffset++ % quietClusters.length];
                const ambience = nextQuietEffect();
                if (cluster && ambience) {
                    quietEffects.push({ id: `quiet:${++sequence}`, clusterId: `cluster:${cluster.session.id}`, spaceId: `space:${cluster.space}`, kind: ambience.kind, label: `Office fiction: ${ambience.label}`, position: origin(cluster.space), startedAt: now, endsAt: now + 4000, fictional: true });
                    if (ambience.kind === "spider") leaveProp("web", cluster, null);
                }
                nextQuietEffectAt = now + cadence();
            }
        }
        if (preferences.dialogue) {
            for (const agent of agents.values()) {
                if (!dialogueVisible(agent)) {
                    dialogueDueAt.delete(agent.id);
                    dialogue = dialogue.filter((bubble) => bubble.agentId !== agent.id);
                    continue;
                }
                let dueAt = dialogueDueAt.get(agent.id);
                if (dueAt === undefined) {
                    dueAt = now + dialogueCadence();
                    dialogueDueAt.set(agent.id, dueAt);
                }
                if (now < dueAt) continue;
                const cooldownUntil = (lastDialogueAt.get(agent.id) ?? -Infinity) + 15000;
                if (now < cooldownUntil) dialogueDueAt.set(agent.id, cooldownUntil);
                else speak(agent);
            }
        }
    }

    function tick() { readClock(); advance(); }

    /** @param {import('./product-types.js').OfficeSnapshot} snapshot @param {Preferences} settings */
    function update(snapshot, settings) {
        readClock();
        const dialogueWasEnabled = preferences.dialogue;
        const previouslyObserved = observed;
        preferences = structuredClone(settings);
        providers = structuredClone(snapshot.providers);
        observed = new Set(snapshot.agents.map((agent) => agent.id));
        if (preferences.dialogue && !dialogueWasEnabled) {
            for (const agent of agents.values()) dialogueDueAt.set(agent.id, now + dialogueCadence());
        }
        const newcomers = snapshot.agents.filter((agent) => !agent.ended && (!agents.has(agent.id) || agents.get(agent.id)?.ended));
        for (const agent of snapshot.agents) {
            const previous = agents.get(agent.id);
            const transition = previous && (previous.state !== agent.state || previous.waitingReason !== agent.waitingReason || previous.freshness !== agent.freshness || previous.connected !== agent.connected || previous.ended !== agent.ended);
            if (!previous || !previouslyObserved.has(agent.id)) dialogueDueAt.set(agent.id, now + dialogueCadence());
            if (transition) {
                for (const scene of [...scenes]) if (scene.kind === "desk-setup" && scene.participants.includes(agent.id)) cancel(scene);
                dialogue = dialogue.filter((bubble) => bubble.agentId !== agent.id);
                const cooldownUntil = (lastDialogueAt.get(agent.id) ?? -Infinity) + 15000;
                dialogueDueAt.set(agent.id, Math.max(now, cooldownUntil));
            }
            if (agent.state === "completed" && previous?.state !== "completed") completionUntil.set(agent.id, now + 2000);
            else if (agent.state !== "completed") completionUntil.delete(agent.id);
            agents.set(agent.id, { ...agent });
        }
        for (const session of snapshot.sessions) {
            const existing = clusters.get(session.id);
            if (existing) existing.session = { ...session };
        }
        for (const cluster of clusters.values()) {
            cluster.abandoned = cluster.session.closed && ![...agents.values()].some((agent) => agent.sessionId === cluster.session.id && !agent.ended);
            cluster.endedAt = cluster.abandoned ? cluster.session.endedAt ?? cluster.endedAt ?? now : null;
        }
        /** @returns {number} */
        function claimSpace() {
            const empty = [...clusters.values()].find((cluster) => cluster.abandoned && !cluster.retired);
            if (empty) { empty.retired = true; return empty.space; }
            return spaces++;
        }
        for (const session of snapshot.sessions) {
            const existing = clusters.get(session.id);
            if (!existing) {
                const abandoned = session.closed && ![...agents.values()].some((agent) => agent.sessionId === session.id && !agent.ended);
                clusters.set(session.id, { session: { ...session }, space: abandoned ? spaces++ : claimSpace(), desks: new Map(), abandoned, retired: false, endedAt: abandoned ? session.endedAt ?? now : null });
            } else if (!session.closed && existing.retired) {
                existing.space = claimSpace();
                existing.retired = false;
            }
        }
        for (const cluster of clusters.values()) {
            for (const id of cluster.desks.keys()) if (agents.get(id)?.sessionId !== cluster.session.id) cluster.desks.delete(id);
            for (const agent of agents.values()) {
                if (agent.sessionId !== cluster.session.id || cluster.desks.has(agent.id)) continue;
                let index = 0;
                while ([...cluster.desks.values()].includes(index)) index++;
                cluster.desks.set(agent.id, index);
            }
        }
        for (const scene of [...scenes]) if (!sceneIsValid(scene)) cancel(scene);
        for (const agent of newcomers) {
            const cluster = clusters.get(agent.sessionId);
            const index = cluster?.desks.get(agent.id);
            if (!cluster || index === undefined || !preferences.vignettes || !agent.connected || agent.freshness !== "fresh" || cluster.session.closed) continue;
            const dirty = props.filter((prop) => prop.spaceId === `space:${cluster.space}` && prop.deskIndex === index && !prop.cleanupSceneId);
            if (!dirty.length) continue;
            const id = `scene:${++sequence}`;
            scenes.push({ id, templateId: "desk-setup", kind: "desk-setup", label: "Setting up desk (office fiction)", participants: [agent.id], startedAt: now, endsAt: now + 4000, fictional: true });
            for (const prop of dirty) prop.cleanupSceneId = id;
        }
        advance();
    }

    /** @returns {WorldView} */
    function view() {
        /** @type {WorldView} */
        const result = { now, fictionLabel: "Office fiction — not provider activity or collaboration", motion: { optional: true, reducedMotion: "static", flashing: false }, clusters: [], characters: [], props: [], scenes: [], dialogue: [], abandonedEffects: [], quietEffects: [] };
        for (const cluster of clusters.values()) {
            const session = cluster.session;
            const position = { x: cluster.space % 3 * 400, y: Math.floor(cluster.space / 3) * 300 };
            const quiet = quietCluster(cluster);
            const titleHidden = preferences.hideTitles || preferences.hiddenSessionTitles[session.id] === true || quiet || session.closed;
            const retainedEnded = preferences.showEnded && [...cluster.desks.keys()].some((id) => agents.get(id)?.ended === true);
            result.clusters.push({ id: `cluster:${session.id}`, sessionId: session.id, spaceId: `space:${cluster.space}`, position, provider: session.provider, title: titleHidden ? null : session.title, titleHidden, titleVisibilityNote: quiet ? "Quiet cluster fiction temporarily hides the provider title and motifs." : "Hiding provider title text does not hide title-derived motifs.", motifs: quiet || session.closed ? [] : deriveMotifs(session.title), abandoned: cluster.abandoned, quiet, dimmed: cluster.abandoned || quiet, endedAt: cluster.endedAt, statusLabel: cluster.abandoned ? "Session ended" : "Session", visible: !cluster.retired || retainedEnded });
            for (const [id, deskIndex] of cluster.desks) {
                const agent = agents.get(id);
                if (!agent || agent.ended && !preferences.showEnded) continue;
                const deskPosition = { x: position.x + 40 + deskIndex % 4 * 90, y: position.y + 80 + Math.floor(deskIndex / 4) * 90 };
                const base = deterministicAppearance(id);
                const override = preferences.appearances[id];
                const appearance = override ? { ...override, palette: /^#[\da-f]{6}$/i.test(override.palette) ? override.palette : base.palette } : base;
                const scene = scenes.find((scene) => scene.participants.includes(id));
                const host = clusters.get(agents.get(scene?.participants[0] ?? "")?.sessionId ?? "");
                const sceneOrigin = host ? { x: host.space % 3 * 400, y: Math.floor(host.space / 3) * 300 } : position;
                const cleaning = props.find((prop) => prop.cleanupSceneId === scene?.id);
                const scenePosition = scene?.kind === "desk-setup" || agent.state === "working" && !agent.ended ? deskPosition : cleaning ? cleaning.position : { x: sceneOrigin.x + 160 + (scene?.participants.indexOf(id) ?? 0) * 30, y: sceneOrigin.y + 40 };
                const commonPosition = { x: position.x + 160, y: position.y + 40 };
                result.characters.push({ id, agentId: id, sessionId: agent.sessionId, clusterId: `cluster:${session.id}`, spaceId: `space:${cluster.space}`, deskId: `space:${cluster.space}:desk:${deskIndex}`, deskIndex, position: scene ? scenePosition : agent.ended ? commonPosition : deskPosition, deskPosition, provider: agent.provider, providerName: agent.name, providerRole: agent.role, state: agent.state, ended: agent.ended, endedAt: agent.endedAt, waitingReason: agent.waitingReason, freshness: agent.freshness, connected: agent.connected, observed: observed.has(id), appearance, voiceFlavor: VOICES[hash(id) % 5] ?? "calm", pose: scene ? scene.kind === "vignette" ? "vignette" : scene.kind : agent.ended ? "rest" : !observed.has(id) ? "neutral" : agent.state === "completed" && agent.connected && agent.freshness === "fresh" && completionUntil.has(id) ? "completion" : factualPose(agent), statusLabel: agent.ended ? "Ended" : agent.state === "waiting" && agent.waitingReason === "approval" ? "Waiting for approval" : agent.state, sceneId: scene?.id ?? null, sceneLabel: scene?.label ?? null });
            }
        }
        result.scenes = scenes;
        result.props = props;
        result.dialogue = dialogue;
        result.abandonedEffects = effects;
        result.quietEffects = quietEffects;
        return structuredClone(result);
    }
    return { update, tick, view };
}
