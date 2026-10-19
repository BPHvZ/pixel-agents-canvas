# ADR 0005: Observable activity and office presentation

- **Status:** Accepted
- **Date:** 2026-10-17

## Context

The office visualizes provider activity while also providing a fictional, stateful office world. Its visual layer must remain legible as fiction and must never overwrite or masquerade as provider signals. The source review compared actual UI implementations: [Agent Virtual Office](https://github.com/KbWen/agent-virtual-office/blob/460d71db3b41746748e53e881d7ecd08e1207f60/src/systems/officeLife.js) stages coffee-break events but prioritizes live pulses; [Agent Office](https://github.com/Pixel-Process-UG/agent-office/blob/da62eee3bb054d0500b15ace53dd005adcfa512d/src/WelcomeOnboarding.tsx) collects focus/presence for agents it manages; [Pixel Agents](https://github.com/pixel-agents-hq/pixel-agents/blob/main/webview-ui/src/office/components/ToolOverlay.tsx) presents real tool/subagent activity in overlays. Their presentation patterns inform this design; their data and orchestration scopes are not adopted. Detailed fictional-office and lifecycle rules are recorded in [ADR 0008](./0008-stateful-office-ambience.md).

## Decision

- Derive factual identity, session/agent relationships, lifecycle, waiting/blocked state, terminal state, and freshness only from the activity source that owns the session and its provider-established metadata/events. Preserve that source and provenance; do not infer it from model or billing vendor.
- Render one character per distinct provider-established agent identity, including reported subagents, grouped under the parent session. Rooms/clusters express that reported relationship only; they do not imply shared files/context.
- Active sessions appear by default. Hide only provider-reported terminal states; an opt-in current-host-lifetime view may render them as sleeping/off-duty. Lack of recent events does not equal completion.
- Distinguish unsupported provider, unavailable integration, confirmed empty result, stale/disconnected source, and active discovery. Include concise source health in the office and detailed coverage in an optional hidden-by-default view.
- Stable character looks, aliases, and voice flavors are decorative, not provider-reported roles or personalities. Authored dialogue and office-wide vignettes are permitted only under the fiction/fact separation and lifecycle rules in ADR 0008; no prompt/task text is used to generate them.
- Provider titles may appear as titles, not as guaranteed-sanitized summaries. Preview remains separate and is never displayed. Model/billing details are not part of default activity cards and may only appear in a separate details view when a host reports them reliably. Accessibility, keyboard operation, reduced motion, responsive layout, and readable status text remain acceptance qualities.

## Decision update (2026-10-18)

Keep the character badge focused on the provider-reported state and waiting cue, with WCAG AA contrast and text that does not rely on color alone. Do not duplicate provider or freshness/connection text on the character: identify the provider on its session and expose provider/source/freshness in agent details. When a session title is hidden, omit its text entirely rather than showing a “title hidden” placeholder; title-derived motifs remain governed by ADR 0008 and the control explains that behavior.

## Consequences

- Provider adapters need explicit event-to-state mapping and stale-state tests; unsupported provider events must not be guessed.
- UI copy and visuals should expose source, connection health, and freshness without exposing private provider payloads.
- Office props and theatrical transitions have their own open-canvas lifetime and must never enter provider state, session history, or the factual event feed.

## Alternatives considered

1. **Use plausible/simulated events as a substitute for missing provider activity.** Rejected: users cannot distinguish observation from fabrication. Clearly labeled office fiction is permitted only as a separate layer under ADR 0008.
2. **Render raw provider event text as speech bubbles.** Rejected: it risks leaking private content and conflates personality with factual status.
3. **Make animation the only status indicator.** Rejected: it is inaccessible and ambiguous, especially with reduced motion enabled.

## Revisit when

Provider event coverage, accessibility requirements, or the product's explicitly read-only scope changes.
