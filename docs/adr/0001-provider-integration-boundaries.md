# ADR 0001: Provider integration boundaries

- **Status:** Accepted for initial implementation
- **Date:** 2026-10-16

## Context

The product must distinguish observable provider state from user-entered or preview content while respecting the narrow interfaces available in each host. The implemented adapters use the installed Copilot SDK session hooks and Codex app-server stdio protocol.

The installed Copilot SDK author guide lists extension hooks including session start/end, prompt submission, pre/post tool use, failures, errors, and subagent lifecycle. Their documented inputs include sensitive prompt, tool, and response content, so adapters must discard payloads and derive only approved metadata. Those callbacks are session-scoped and do not imply account-wide access. OpenAI documents Codex app-server as the rich-client interface for authentication, conversation history, approvals, and streamed agent events; it uses JSON-RPC and supports stdio. The docs explicitly mark WebSocket transport experimental/unsupported. These are different integration surfaces and must remain separate adapters.

## Decision

Use a provider-neutral event model behind independent Copilot-session and Codex-local adapters:

- Copilot adapter consumes only supported callbacks from the session hosting the extension.
- Codex adapter is opt-in and local-only, using the stdio app-server protocol verified against the installed CLI schema and exercised in a live authenticated CLI. It will not use a remote WebSocket listener, scrape UI, or read Codex auth/config files.
- Both adapters emit metadata-only lifecycle events (identity, status, short safe task label, timestamp, source). Raw prompts, tool arguments/results, source content, and credentials are excluded by default.
- The renderer must clearly state provider connection and event freshness. Unknown/disconnected is not shown as working. Preview/mock entries are visibly labeled and never counted as real provider connections.
- If an adapter is unavailable or unsupported, it degrades to disconnected/unknown status with actionable diagnostics rather than silently simulating activity.

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

## Revisit when

The installed Copilot SDK changes available event signatures, Codex documents a stable alternative transport or lifecycle protocol, or user decisions in PLAN.md change the process/consent/history requirements.
