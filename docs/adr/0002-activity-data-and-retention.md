# ADR 0002: Activity data and retention

- **Status:** Accepted for initial implementation
- **Date:** 2026-10-16

## Context

An agent office is most useful when it can explain who is active and why. Capturing prompt text, tool calls, file content, or conversation history would introduce significant privacy risk and is not necessary to show presence. The current prototype stores mutable status in process memory, which is acceptable for a prototype but needs an explicit product retention rule.

## Decision

Keep provider-supplied, sanitized metadata summaries as the default; do not process prompt text by default. A persisted user preference may opt in to on-device, transient prompt summarization, but only after feasibility proves raw prompt text remains within the local host path. When enabled, show only the resulting summary, discard raw prompt text immediately, never log it, and keep the resulting summary and event timeline in memory only. The setting is off by default, visibly indicates processing, and can be disabled at any time. Persist only the consent preference, not activity data. All event payloads are field-selected, never copied wholesale; activity data is cleared when the extension/host closes. If local-only processing cannot be demonstrated in both hosts, prompt summarization remains unavailable there.

## Consequences

- Restarting the extension clears office state; provider adapters must reconnect and rehydrate only what their supported APIs provide.
- Users can understand presence and freshness without exposing private conversation contents.
- Cross-session audit/history views are out of scope until separately approved.
- Only the explicit prompt-summary consent preference may persist; all provider activity and generated summaries remain transient.

## Alternatives considered

1. **Persist all provider events or conversations.** Rejected: excessive, unnecessary collection.
2. **Persist metadata by default.** Rejected for the initial release until there is a concrete user-facing history use case and retention/deletion requirements.
3. **Ephemeral metadata only, including no prompt-derived summaries.** Rejected as a complete product rule: provider metadata remains the default, but users may explicitly opt in to transient on-device summarization if the host can enforce the boundary.
