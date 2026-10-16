# ADR 0001: Provider integration boundaries

- **Status:** Accepted for initial implementation
- **Date:** 2026-10-16

## Context

The product must distinguish observable provider state from user-entered or preview content while respecting the narrow interfaces available in each host. The implemented adapters use the installed Copilot SDK session hooks and Codex app-server stdio protocol.

The installed Copilot SDK author guide lists extension hooks including session start/end, prompt submission, pre/post tool use, failures, errors, and subagent lifecycle. Their documented inputs include sensitive prompt, tool, and response content, so adapters must discard payloads and derive only approved metadata. Those callbacks are session-scoped and do not imply account-wide access. OpenAI documents Codex app-server as the rich-client interface for authentication, conversation history, approvals, and streamed agent events; it uses JSON-RPC and supports stdio. The docs explicitly mark WebSocket transport experimental/unsupported. These are different integration surfaces and must remain separate adapters.

## Decision

Use a provider-neutral session/agent model behind independent, capability-reporting adapters. Discovery is permitted only through supported provider protocols, with explicit provider enablement where it launches a local process. Preserve provider/source provenance and represent missing values as unknown; do not enumerate via scraping, undocumented APIs, or auth/config-file inspection.

- Copilot consumes supported hooks for the hosting conversation. Broader Copilot session enumeration is not established by available evidence; do not promise it or use undocumented discovery.
- Codex may use an explicitly enabled, extension-managed local stdio app-server. The official protocol documents `thread/list` and lifecycle notifications, making broader existing-thread discovery a validation target. Restrict to metadata and provider-reported relationships; do not access transcript content unless separate prompt-summary consent is enabled. Do not use a remote WebSocket listener or read auth/config files.
- Adapters report independently whether a provider is unsupported, unavailable, connected with no sessions, stale/disconnected, or returning sessions. A confirmed empty result requires successful discovery.
- One character represents each provider-established agent identity, including a top-level agent and distinct reported subagents, grouped by their provider-established session relationship. Do not infer agents or hierarchy from tool events or text.
- Preserve source, identity, timestamp, and lifecycle provenance in normalized records. Unknown values remain unknown. Inferred playful cues may be decorative and clearly labeled, but cannot change factual status or actions.
- The renderer reports freshness and source coverage; preview/mock entries are optional, off by default, visibly labeled, and never counted as provider activity.

## Consequences

- The extension can work with a Copilot App session without requesting a Copilot token, while support remains limited to that session.
- Codex can be integrated through a documented client protocol, but users need a supported local Codex CLI installation and valid Codex access. A ChatGPT subscription alone is not assumed sufficient.
- Codex process launching and permissions require explicit user approval and a robust stop/reconnect lifecycle. The initial lifecycle uses explicit enablement and creates only empty ephemeral threads; it never sends a prompt or starts a model turn.
- Provider adapters can be tested independently with recorded/synthetic protocol fixtures, even where live accounts are unavailable.
- The normalized event model avoids binding the UI to provider-specific protocol details.

## Alternatives considered

1. **Keep seeded/manual statuses as the product.** Rejected: it does not satisfy real Copilot/Codex integration and risks misleading users.
2. **Use an API key for both providers.** Rejected: neither user's request nor the product's local signed-in Copilot/Codex surfaces imply that a shared API-key integration is available; this also adds secret handling and costs.
3. **Poll product UI or inspect local history/config files.** Rejected: brittle, privacy-invasive, unsupported, and likely to expose sensitive content.
4. **Use Codex WebSocket app-server.** Rejected for initial integration because official docs identify it as experimental/unsupported and warn against unauthenticated exposure; local stdio is the preferred candidate.
5. **Treat VS Code's Copilot MCP support as Copilot App integration.** Rejected: it documents a separate product and does not establish Copilot App canvas/provider activity API support.

## Inspiration-project observations

These references demonstrate patterns, not verified capabilities of this product:

- `KbWen/agent-virtual-office` describes real event/status integrations including Codex CLI/App, with actual session state and no invented dialogue.
- `pixel-agents-hq/pixel-agents` describes a provider-neutral hook-provider interface and normalized events; its README calls Claude the reference provider and Codex roadmap work.
- `Pixel-Process-UG/agent-office` describes richer chat/task orchestration, but labels itself early development. Those control features are outside this read-only product scope.

## Feasibility gates

- Prove Codex `thread/list` and notification behavior against supported CLI versions, including whether metadata-only discovery can avoid transcript reads and how to represent archive/terminal states.
- Verify local process execution and canvas-extension lifecycle in both VS Code and the Copilot App. Provider consent must be independent of canvas opening.
- No supported general Copilot session-enumeration API has been established. Copilot's current-session-only support is acceptable for V1 if accurately labeled.

## Revisit when

The installed Copilot SDK changes available event signatures, Codex documents a stable alternative transport or lifecycle protocol, or user decisions in PLAN.md change the process/consent/history requirements.
