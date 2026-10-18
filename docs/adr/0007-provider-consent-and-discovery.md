# ADR 0007: Provider consent and session discovery

- **Status:** Accepted
- **Date:** 2026-10-17

## Context

The initial prototype only started `codex app-server`, created an empty ephemeral thread, and accepted activity for thread IDs it created. The product requirement is read-only discovery of existing sessions where supported, without a companion app or undocumented scraping. OpenAI's app-server protocol documents `thread/list`; VS Code's Canvases documentation establishes that canvases are supported in the editor/Agents window and in the Copilot App, but does not establish broad Copilot conversation enumeration from an extension. The implementation now lists existing threads metadata-first and subscribes active threads after explicit opt-in.

## Decision

Provider integrations are independently enabled. Codex discovery may launch an extension-managed local stdio app-server only after explicit user enablement; the process is not a separate companion app, reads no auth/config files, and stops with the extension. Validate that `thread/list` plus notifications can provide metadata-only discovery and reported parent/subagent relationships for existing threads. Copilot support may ship as hosting-conversation-only when that is the supported scope; do not use undocumented enumeration. Report per-provider scope and actual capability, distinguishing unsupported, unavailable, confirmed empty, stale, and disconnected states. Read-only open/focus navigation is allowed only through documented host/provider actions.

## Decision update (2026-10-17)

An active paid GitHub Copilot plan is not a requirement: the Copilot App officially supports third-party BYOK model providers, and VS Code supports provider routes beyond Copilot. GitHub sign-in may remain required by a host. Keep host, harness/activity source, model route, billing route, and discovery source distinct. A Copilot CLI session proxied to a Codex model is not a Codex CLI thread. Reuse concrete patterns from the inspirations (normalized statuses/freshness, provider adapter contract, reported hierarchy, and map/list visualization), but do not import their file-based Codex bridge, transcript reads, orchestration model, or assets without separate evidence/license review.

## Protocol clarification (2026-10-18)

Codex `thread/closed` reports app-server runtime unload/subscription closure, not persisted conversation completion. The [CLI 0.163.0 unsubscribe tests](https://github.com/openai/codex/blob/129b8ec7ee6f4511557a4856279f529025c25af4/codex-rs/app-server/tests/suite/v2/thread_unsubscribe.rs) exercise unsubscribe/unload followed by later resume. Map this signal to unmonitored/unknown, not a completed agent or abandoned office cluster. A turn outcome, archive, subscription close, stale signal, and explicitly ended provider agent/session remain separate facts. ADR 0008's departure/abandonment rules require a genuine provider end signal; unsupported Codex end semantics are not synthesized from `thread/closed`.

The hosting adapter now uses the documented SDK session-event subscription, discarding content-bearing event fields. `session.idle` is an explicit idle signal; `subagent.started/completed/failed` provide per-invocation identity, and `session.shutdown` is distinct from an assistant turn ending. Supported installed contracts were checked against the bundled SDK declarations; unsupported per-agent detail remains unknown.

## Consequences

- Codex may offer wider session discovery than Copilot; the product promises truthful coverage, not parity.
- Enabling Codex starts a local process and therefore requires clear consent, diagnostics, metadata-first existing-thread discovery, and deterministic unsubscribe/cleanup. The product never creates a thread or starts a model turn.
- The Codex discovery gate must verify supported CLI versions, archive/terminal handling, process lifecycle in both canvas hosts, and absence of transcript reads in metadata-only mode.
- The app-server list response includes a `preview` that may contain the first user message even in the metadata-oriented path. The adapter must discard it before normalization; `useStateDbOnly: true` avoids the metadata-repair rollout scan but does not remove content-bearing fields from the response.
- Codex CLI-owned sessions and Copilot CLI sessions that route model calls through a Codex/OpenAI proxy are distinct discovery sources. No plan is made to enumerate sessions based on model vendor alone.
- Phase 0 found reusable designs in the three reference projects: AVO-style normalized statuses/freshness, Pixel Agents' explicit provider/event seam and reported hierarchy, and Agent Office's expressive map/list layout. Their Codex-file bridge is not native Codex thread discovery; transcript-reading hooks and orchestration controls are not adopted.
- Phase 0 evidence (2026-10-17) confirms CLI 0.163.0 `thread/list` pagination/archive filtering using `useStateDbOnly`, `thread/resume` with `excludeTurns`, idle `thread/status/changed` delivery, unsubscribe, and clean SIGTERM. The list object includes `preview` (usually first user message); never forward or display it. `ThreadStatus` distinguishes `notLoaded`, `idle`, `systemError`, and `active`; the separate turn-completed event has `completed`, `interrupted`, `failed`, and `inProgress`. Track thread availability/archive separately from turn outcome; do not treat idle/archive as session completion.
- The active VS Code Insiders Copilot extension host successfully spawned this canvas's local Codex process after user action. Copilot App session `0cdd3db3-e118-4e38-8254-9460f64dd627` in the target worktree launched the project extension; its renderer health endpoint succeeded. The App canvas action launched the local Codex app-server and created an empty ephemeral idle thread without a model turn; SIGTERM stopped the child. The user closed the canvas and its HTTP listener stopped, while the extension process remained alive with the session. The App SDK declares canvas `onClose`; its direct outcome was not captured, but Copilot App session shutdown was verified to log session cleanup and stop the extension normally. Whole-app shutdown/crash cleanup and host consent for executing project extension code remain unverified. Phase 0 is approved to proceed to Phase 1. The user accepts standard host/workspace trust and deliberate use of this project canvas as consent to project-extension execution; first-party Copilot App docs do not specify a separate pre-execution trust prompt, so none is claimed. Codex process startup still requires explicit opt-in. Normal shutdown and tested provider-child exit paths are verified, without a universal hard-crash cleanup guarantee. The agreed renderer scale, privacy wording, and navigation gates are resolved; see [PLAN.md](../../PLAN.md), [docs/phase-0-feasibility.md](../phase-0-feasibility.md), and [docs/phase-0-host-consent-lifecycle.md](../phase-0-host-consent-lifecycle.md).
- VS Code and Copilot App share one product goal, but may require different packaging if one artifact/runtime contract is not supported in both.

## Alternatives considered

1. **Observe only extension-created threads.** Rejected as insufficiently useful for the requested session dashboard if supported discovery is feasible.
2. **Scrape UI, history files, or undocumented APIs.** Rejected as brittle, privacy-invasive, and unsupported.
3. **Require identical provider coverage across hosts before release.** Rejected because actual host APIs differ; known limits should be disclosed rather than hidden or compensated with fake activity.
