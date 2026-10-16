# ADR 0002: Activity data and retention

- **Status:** Accepted for initial implementation
- **Date:** 2026-10-16

## Context

An agent office is most useful when it can explain who is active and why. Capturing prompt text, tool calls, file content, or conversation history would introduce significant privacy risk and is not necessary to show presence. The current prototype stores mutable status in process memory, which is acceptable for a prototype but needs an explicit product retention rule.

## Decision

The initial product model stores only normalized lifecycle metadata in memory for the running extension process. No event history is written to disk. Because the installed Copilot hooks expose prompt text, tool arguments/results, and response strings, handlers must not derive task summaries from these fields in v1; show generic activity labels instead. Provider event payloads must never be copied wholesale. Stale state becomes `unknown` after a bounded timeout. Any future history feature or content-derived summaries require separate explicit opt-in and a retention/deletion design.

## Consequences

- Restarting the extension clears office state; provider adapters must reconnect and rehydrate only what their supported APIs provide.
- Users can understand presence and freshness without exposing private conversation contents.
- Cross-session audit/history views are out of scope until separately approved.
- Any future metadata history preference requires a separate explicit product decision.

## Alternatives considered

1. **Persist all provider events or conversations.** Rejected: excessive, unnecessary collection.
2. **Persist metadata by default.** Rejected for the initial release until there is a concrete user-facing history use case and retention/deletion requirements.
3. **Ephemeral metadata only.** Accepted: least-data default and simple lifecycle semantics.
