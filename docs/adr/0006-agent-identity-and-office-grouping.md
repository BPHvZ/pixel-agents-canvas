# ADR 0006: Agent identity and office grouping

- **Status:** Proposed
- **Date:** 2026-10-16

## Context

The inspiration projects use several visual models: `pixel-agents` describes one character per agent terminal and separate characters for observable subagents/teammates; `agent-virtual-office` maps observed signals into role-specific reactions; `agent-office` adds agent chat/task orchestration. This product is read-only, and providers differ in whether they expose stable parent/subagent identities and relationships. A visual cluster can imply collaboration or shared context that the source may not establish.

## Decision

Represent each provider-established agent identity as one character, including a top-level agent and separately identified subagents. Group characters into a session room/desk cluster only when the provider establishes the relationship. Never infer additional agents or hierarchy from tools, timing, task text, or visual role. Role/mood flourishes may be playful and explicitly labeled as inferred, but are decorative only and must not affect factual status, sort order, or actions.

## Consequences

- Sparse provider data may produce fewer characters or no subagent cluster; the office must not fill that gap with invented workers.
- Session and agent identity are distinct domain concepts; multiple agents can belong to one session.
- Layout remains generated from observed relationships in V1, not a user-editable persistent floor plan.

## Alternatives considered

1. **One character per session.** Rejected because it hides parallel agents when provider identity/link data is available.
2. **Infer agents and relationships from activity patterns.** Rejected because it implies facts the adapter cannot establish.
3. **Make inferred role/mood part of state.** Rejected because playful interpretation must not be confused with provider-reported lifecycle.
