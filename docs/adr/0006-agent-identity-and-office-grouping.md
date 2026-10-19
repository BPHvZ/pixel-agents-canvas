# ADR 0006: Agent identity and office grouping

- **Status:** Accepted
- **Date:** 2026-10-17

## Context

The inspiration projects use several visual models: `pixel-agents` describes one character per agent terminal and separate characters for observable subagents/teammates; `agent-virtual-office` maps observed signals into role-specific reactions; `agent-office` adds agent chat/task orchestration. This product is read-only, and providers differ in whether they expose stable parent/subagent identities and relationships. A visual cluster can imply collaboration or shared context that the source may not establish.

## Decision

Represent each provider-established agent identity as one character, including a top-level agent and separately identified subagents. Group characters into a session cluster only when the provider establishes the relationship. Never infer additional agents or hierarchy from tools, timing, task text, or visual role. Stable deterministic appearance, optional local visual overrides, nicknames, and fictional voice flavors distinguish characters without asserting provider-reported roles, capabilities, or task knowledge. Office vignettes may cross session clusters only as explicitly fictional decoration; they do not change cluster membership or imply actual collaboration.

## Consequences

- Sparse provider data may produce fewer characters or no subagent cluster; the office must not fill that gap with invented workers.
- Session and agent identity are distinct domain concepts; multiple agents can belong to one session.
- Activity identity follows the owning harness/source, not the model vendor. A proxy-routed Codex model in a Copilot CLI session is still a Copilot CLI activity source, not a Codex CLI thread.
- Layout remains generated from observed relationships in V1, not a user-editable persistent floor plan. A physical office area may be reused after a session ends, but a new session never inherits the old provider identity or cluster metadata.
- Local visual overrides are keyed by provider plus stable agent identity where available; session-scoped identities do not get fuzzy-merged across sessions. A nickname is prominent display text, while provider name/role remain separately available as factual identity.
- Users may customize visual traits and nickname, but not assign task focus, role, or priority fields that could be mistaken for provider observations.

## Alternatives considered

1. **One character per session.** Rejected because it hides parallel agents when provider identity/link data is available.
2. **Infer agents and relationships from activity patterns.** Rejected because it implies facts the adapter cannot establish.
3. **Make inferred role/mood part of state.** Rejected because playful interpretation must not be confused with provider-reported lifecycle.
