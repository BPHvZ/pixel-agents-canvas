# ADR 0005: Observable activity and office presentation

- **Status:** Proposed
- **Date:** 2026-10-16

## Context

The office is a visualization of real provider activity, so visual delight must not imply signals the integrations did not observe. ADR 0001 already requires fresh connection state, unknown/disconnected fallbacks, and no invented activity. Inspiration examples show real-event-driven reactions and role-specific animations (`agent-virtual-office`), richer agent dialogue/task management (`agent-office`), and animated state mapped from provider events (`pixel-agents`). These features are observed in their public project descriptions; they are not evidence that this product receives the same signals.

## Decision

- Derive factual identity, session/agent relationships, lifecycle, waiting/blocked state, completion, and freshness only from provider-established metadata/events. Preserve source and provenance.
- Render one character per distinct provider-established agent identity, including reported subagents, grouped under the parent session. Rooms/clusters express that reported relationship only; they do not imply shared files/context.
- Active sessions appear by default. Hide only provider-reported terminal states; an opt-in current-host-lifetime view may render them as sleeping/off-duty. Lack of recent events does not equal completion.
- Distinguish unsupported provider, unavailable integration, confirmed empty result, stale/disconnected source, and active discovery. Include concise source health in the office and detailed coverage in an optional hidden-by-default view.
- Playful inferred role/mood cues are permitted only when clearly marked as inference and strictly decorative; they cannot change factual labels, lifecycle, sorting, or actions. Do not invent dialogue, task content, collaboration, or causal explanations.
- Preview is optional, separate, and explicitly labeled. Accessibility, keyboard operation, reduced motion, responsive layout, and readable status text are acceptance qualities; animation is supplementary.

## Consequences

- Provider adapters need explicit event-to-state mapping and stale-state tests; unsupported provider events must not be guessed.
- UI copy and visuals should expose source, connection health, and freshness without exposing private provider payloads.
- Ambient animations may decorate the office but cannot change the perceived factual state of an agent.

## Alternatives considered

1. **Use plausible/simulated activity whenever event coverage is incomplete.** Rejected: users cannot distinguish observation from fabrication.
2. **Render raw provider event text as speech bubbles.** Rejected: it risks leaking private content and conflates personality with factual status.
3. **Make animation the only status indicator.** Rejected: it is inaccessible and ambiguous, especially with reduced motion enabled.

## Revisit when

Provider event coverage, accessibility requirements, or the product's explicitly read-only scope changes.
