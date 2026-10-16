# ADR 0005: Observable activity and office presentation

- **Status:** Proposed
- **Date:** 2026-10-16

## Context

The office is a visualization of real provider activity, so visual delight must not imply signals the integrations did not observe. ADR 0001 already requires fresh connection state, unknown/disconnected fallbacks, and no invented activity. Inspiration examples show real-event-driven reactions and role-specific animations (`agent-virtual-office`), richer agent dialogue/task management (`agent-office`), and animated state mapped from provider events (`pixel-agents`). These features are observed in their public project descriptions; they are not evidence that this product receives the same signals.

## Decision

- Derive every provider-backed state only from normalized, timestamped events actually observed by that adapter. Preserve event provenance and provider identity in the model.
- Map ambiguous, missing, stale, or unsupported signals to `unknown`, `idle`, or disconnected as appropriate; never leave stale work displayed as live and never imply a provider is connected without a successful connection signal.
- Do not invent agent dialogue, task content, collaboration, or causal explanations. Use generic visual activity labels when the source does not provide an approved safe detail.
- Keep optional preview/sample activity visually and textually distinct from provider-backed agents and disable it by default when real providers are connected.
- Treat accessibility, keyboard operation, reduced-motion support, responsive layout, and readable status text as product acceptance qualities; animation is supplementary, not the sole carrier of status.

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
