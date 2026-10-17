# ADR 0001: Provider integration boundaries

- **Status:** Accepted for initial implementation
- **Date:** 2026-10-16

## Context

The product must distinguish observable provider state from user-entered or preview content while respecting the narrow interfaces available in each host. The implemented adapters use the installed Copilot SDK session hooks and Codex app-server stdio protocol.

The installed Copilot SDK author guide lists extension hooks including session start/end, prompt submission, pre/post tool use, failures, errors, and subagent lifecycle. Their documented inputs include sensitive prompt, tool, and response content, so adapters must discard payloads and derive only approved metadata. Those callbacks are session-scoped and do not imply account-wide access. OpenAI documents Codex app-server as the rich-client interface for authentication, conversation history, approvals, and streamed agent events; it uses JSON-RPC and supports stdio. The docs explicitly mark WebSocket transport experimental/unsupported. These are different integration surfaces and must remain separate adapters.

## Decision

Use a provider-neutral session/agent model behind independent, capability-reporting adapters. Discovery is permitted only through supported provider protocols, with explicit provider enablement where it launches a local process. Preserve provider/source provenance and represent missing values as unknown; do not enumerate via scraping, undocumented APIs, or auth/config-file inspection.

- Copilot consumes supported hooks for the hosting Copilot CLI conversation only. Broader Copilot session enumeration is not established by available evidence; do not promise it or use undocumented discovery. The harness/session remains the activity source even when it routes inference to an OpenAI/Codex model through a proxy.
- Codex CLI-owned threads may use an explicitly enabled, extension-managed local stdio app-server. The official protocol documents `thread/list` and lifecycle notifications, making existing-thread discovery feasible where the supported runtime permits it. Restrict to approved metadata and provider-reported relationships; discard `preview` and turns. Do not use a remote WebSocket listener or read auth/config files.
- Adapters report independently whether a provider is unsupported, unavailable, connected with no sessions, stale/disconnected, or returning sessions. A confirmed empty result requires successful discovery.
- One character represents each provider-established agent identity, including a top-level agent and distinct reported subagents, grouped by their provider-established session relationship. Do not infer agents or hierarchy from tool events or text.
- Preserve source, identity, timestamp, and lifecycle provenance in normalized records. Unknown values remain unknown. Inferred playful cues may be decorative and clearly labeled, but cannot change factual status or actions.
- The renderer reports freshness and source coverage; preview/mock entries are optional, off by default, visibly labeled, and never counted as provider activity. Clearly labeled fictional office ambience is a separate presentation layer governed by [ADR 0008](./0008-stateful-office-ambience.md); it is never normalized or reported as provider activity.

## Phase 0 approval (2026-10-17)

Phase 0 is approved to proceed to Phase 1. The user accepts standard host/workspace trust and deliberately opening this project canvas as consent to project-extension execution. Host docs do not establish a separate Copilot App project-loader approval prompt; product messaging must not imply one. Codex process execution is distinct and requires explicit user opt-in. Tested graceful shutdown and parent/stdio child-exit paths are sufficient for Phase 0; avoid promises of universal cleanup after arbitrary host crashes. See [phase-0-host-consent-lifecycle.md](../phase-0-host-consent-lifecycle.md).

## Consequences

- The extension can work with a Copilot App session without requesting a Copilot token, while support remains limited to that session.
- Codex CLI-owned thread activity uses the local Codex app-server adapter and requires supported CLI access. ChatGPT/Codex billing, a model route through a proxy, and the session's harness are separate facts. For example, Codex model billing through a proxy inside a Copilot CLI session does not make that session discoverable through Codex `thread/list`; a ChatGPT subscription alone does not guarantee local Codex CLI authentication.
- Codex process launching and permissions require explicit user approval and a robust stop/reconnect lifecycle. The Phase 0 probe created an empty ephemeral thread only to verify host routing; the product adapter is read-only, discovers existing threads, and does not create threads or start model turns.
- Provider adapters can be tested independently with recorded/synthetic protocol fixtures, even where live accounts are unavailable.
- The normalized event model avoids binding the UI to provider-specific protocol details.

## Alternatives considered

1. **Keep seeded/manual statuses as the product.** Rejected: it does not satisfy real Copilot/Codex integration and risks misleading users.
2. **Use an API key for both providers.** Rejected: neither user's request nor the product's local signed-in Copilot/Codex surfaces imply that a shared API-key integration is available; this also adds secret handling and costs.
3. **Poll product UI or inspect local history/config files.** Rejected: brittle, privacy-invasive, unsupported, and likely to expose sensitive content.
4. **Use Codex WebSocket app-server.** Rejected for initial integration because official docs identify it as experimental/unsupported and warn against unauthenticated exposure; local stdio is the preferred candidate.
5. **Treat VS Code's Copilot MCP support as Copilot App integration.** Rejected: it documents a separate product and does not establish Copilot App canvas/provider activity API support.

## Inspiration-project observations

These references were reviewed against current repository source on 2026-10-17, not just README claims. They are implementation examples, not evidence that this product's host exposes identical capabilities. Their concrete patterns are accepted as design inputs for the provider seam, status normalization, freshness, and office layout:

- [`KbWen/agent-virtual-office`](https://github.com/KbWen/agent-virtual-office) has useful status normalization, local-file freshness filtering, and session merging. Its Codex CLI/App adapters rely on helper-written status files or a manual bridge; they do **not** enumerate native Codex threads. Reuse its explicit status vocabulary and stale-entry concept, not its synthesized file/branch identities or bridge as proof of Codex discovery.
- [`pixel-agents-hq/pixel-agents`](https://github.com/pixel-agents-hq/pixel-agents) has a useful normalized `AgentEvent` provider contract and explicit subagent/team relationships. Current registered provider is Claude-only and its fallback/hooks read transcript or hook content; Codex is roadmap, not shipped. Reuse the adapter seam and provider-established hierarchy principle, but keep transcript handling and Claude-specific assumptions out of this metadata-only product.
- [`Pixel-Process-UG/agent-office`](https://github.com/Pixel-Process-UG/agent-office) has a concrete persistent office data model and a map/list layout, but its agents are office-owned, orchestrated workers—not discovered external session identities. It also includes task assignment/chat/runtime execution, which remain outside our read-only scope. Its code is MIT; asset rights must be checked separately before reuse.

Common transferable patterns: independent provider adapters, normalized lifecycle state, local freshness/health indicators, and clear scope disclosures. Do not copy repository code/assets without checking each license; all three codebases report MIT, but graphics/fonts/assets may carry separate terms.

## Feasibility gates

- Prove Codex `thread/list` and notification behavior against supported CLI versions, including whether metadata-only discovery can avoid transcript reads and how to represent archive/terminal states.
- Verify local process execution and canvas-extension lifecycle in both VS Code and the Copilot App. Provider consent must be independent of canvas opening.
- No supported general Copilot session-enumeration API has been established. Copilot's current-session-only support is acceptable for V1 if accurately labeled.

## Revisit when

The installed Copilot SDK changes available event signatures, Codex documents a stable alternative transport or lifecycle protocol, or user decisions in PLAN.md change the process/consent/history requirements.
