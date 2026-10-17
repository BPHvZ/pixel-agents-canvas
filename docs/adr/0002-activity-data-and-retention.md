# ADR 0002: Activity data and retention

- **Status:** Accepted for initial implementation
- **Date:** 2026-10-16

## Context

An agent office is most useful when it can explain who is active and why. Capturing prompt text, tool calls, file content, or conversation history would introduce significant privacy risk and is not necessary to show presence. The current prototype stores mutable status in process memory, which is acceptable for a prototype but needs an explicit product retention rule.

## Decision

Keep provider-supplied metadata as the source of factual summaries and status; do not process prompt text or transcripts in V1. A bounded provider title/name may be displayed as a provider title, not guaranteed to be sanitized; discard Codex `preview` (usually the first user message), turns, and unapproved fields. Activity hooks may provide prompt/tool payloads; adapters ignore those payloads. Do not claim prompt data is local/transient/log-free based only on ignoring it. Prompt summarization is out of scope unless an end-to-end host/runtime/model-route audit and a later user decision approve it. All event payloads are field-selected, never copied wholesale. Provider activity and the factual event feed remain in memory and are cleared when the extension/host closes; fictional office props are in-memory presentation state cleared when the canvas closes. Persist only user-selected presentation preferences (such as local visual overrides and display toggles), not provider activity or scene history.

## Consequences

- Restarting the extension clears office state; provider adapters must reconnect and rehydrate only what their supported APIs provide.
- Users can understand presence and freshness without exposing private conversation contents.
- Cross-session audit/history views are out of scope until separately approved.
- User appearance/display preferences may persist, but provider activity, titles, generated summaries, and fictional scene history are not persisted as session history.

## Alternatives considered

1. **Persist all provider events or conversations.** Rejected: excessive, unnecessary collection.
2. **Persist metadata by default.** Rejected for the initial release until there is a concrete user-facing history use case and retention/deletion requirements.
3. **Add prompt-derived summaries in V1.** Deferred: host/runtime/model-route guarantees have not been established. Revisit only after the end-to-end audit and a separate product decision.
