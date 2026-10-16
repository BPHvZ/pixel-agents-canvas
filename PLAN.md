# Pixel Agents Office: Product plan

**Status:** Approved for implementation under conservative defaults (user instruction: proceed autonomously)
**Last updated:** 2026-10-16

## Product goal

Ship a public, installable GitHub Copilot App canvas extension that visualizes real AI-agent activity in a delightful pixel-art office. GitHub Copilot (the current Copilot App session) and OpenAI Codex must be supported through their actual local/runtime interfaces. The office must not imply that a provider is connected when it is not. A clearly labeled preview mode may be available for users who have not configured either provider, but it is not the product's integration story.

## Implementation status

The canvas now consumes metadata-only Copilot session hooks, and includes an explicitly enabled local Codex app-server adapter that tracks only threads it creates. Provider modules and state tests are present. Remaining release work is protocol fixture testing, runtime integration validation/reload, README alignment, and final app-host verification.

## Proposed architecture

1. **Canvas shell and renderer** — Keep the Copilot SDK `createCanvas` extension as the app entry point and serve the pixel-art renderer over loopback. Separate the renderer, state model, and provider adapters into focused modules. The UI shows connection state, last-event time, and a truthful disconnected/preview state; no hard-coded live/working claims.
2. **Canonical event model** — Normalize provider events into a small internal model: provider/agent identity, lifecycle (`idle`, `working`, `waiting`, `completed`, `failed`, `unknown`), safe task summary, timestamps, and source. Do not retain prompts, tool arguments/results, file contents, or credentials. Status is derived from events and expires to `unknown` after a configurable stale timeout rather than remaining indefinitely active.
3. **Copilot adapter (native, no separate credential)** — The installed SDK author guide confirms `joinSession({ hooks })` supports `onSessionStart`, `onSessionEnd`, `onUserPromptSubmitted`, `onPreToolUse`, `onPostToolUse`, `onPostToolUseFailure`, `onErrorOccurred`, and subagent lifecycle hooks. Convert lifecycle/tool activity to office events while returning no permission decisions or prompt modifications. The documented hook inputs include prompt text, tool args/results, and response text; handlers must deliberately discard those fields after extracting only status/timestamps and, if explicitly approved, a redacted tool label. This observes the session that hosts the extension; it is not an account-wide Copilot monitor and cannot see unrelated sessions. Verify exact signatures against installed `agent-author.md` and generated types before implementation.
4. **Codex adapter (opt-in local bridge)** — Investigate a user-controlled local `codex app-server` stdio integration using its documented JSON-RPC lifecycle/notification protocol, reusing the user's existing Codex CLI sign-in. Start only after explicit enablement; detect missing CLI, unsupported versions, unauthenticated state, and disconnects and show them accurately. Do not bind Codex app-server to a network interface, store/retrieve auth files, or claim that a ChatGPT subscription automatically grants Codex CLI access. Confirm app-server stability/protocol and distribution support before committing to this adapter.
5. **Provider boundary and UI controls** — Each adapter reports capabilities/connection state and emits normalized events. The canvas has provider enable/disable, health, and reset controls. Manual/sample agents may be offered as a clearly marked preview path only; never represent them as connected providers.
6. **Installable packaging** — Project extension remains discoverable at `.github/extensions/pixel-agents-canvas/extension.mjs`. Document repository installation/reload and host/API requirements. Avoid requesting secrets. If Codex requires local executable permissions, explain and obtain consent through the supported UX before launching it.

## Decisions already made for this proposal

- Treat this as a real integration product; demo data is not evidence of provider support.
- Copilot support is scoped to the hosting session exposed to the extension, not all user sessions.
- Codex support is a separately enabled local adapter, not an API-key integration or automatic subscription bridge.
- Activity is privacy-minimized: lifecycle metadata only by default; no prompt or tool payload capture.
- The office should degrade gracefully with neither provider available and visibly distinguish preview, connected, and disconnected states.

## Implementation defaults (approved autonomously)

To avoid blocking delivery, use these conservative defaults unless the user later directs otherwise:

1. Launch and manage `codex app-server` as a local stdio child process only after the user explicitly enables Codex from the canvas; never connect to an arbitrary pre-existing server.
2. Observe only Codex threads created/owned by this extension; do not enumerate or attach to unrelated history/threads.
3. Keep activity in memory only; no persisted history.
4. Keep preview as an explicit, clearly labeled mode that is off when real providers are connected and can never appear connected.

These defaults limit ambient access and avoid silently attaching to private conversations.

## Delivery phases and acceptance criteria

### Phase 0 — Architecture approval and API feasibility
- **Complete:** User authorized autonomous implementation under documented conservative defaults.
- Copilot hook names and broad input types are confirmed by the installed SDK `docs/agent-author.md`; verify exact generated types and canvas host behavior at implementation time.
- Verify Codex app-server lifecycle notification names/payloads, auth prerequisites, CLI detection, and supported stdio launch/termination behavior against current official docs and local CLI.
- Record any SDK/protocol caveats in ADRs before implementing adapters.

### Phase 1 — Provider-neutral core and honest UI
- Extract renderer, state store, event normalization, and provider contract from `extension.mjs`.
- Add connection/last-event states, stale timeout, privacy-safe task summaries, accessible status text, and accurate preview/disconnected labels.
- Unit-test normalization, state transitions, stale detection, and data minimization.

### Phase 2 — Copilot session adapter
- Subscribe via confirmed SDK hooks/events without blocking or changing permissions.
- Map lifecycle to status and test start/prompt/tool/end/error transitions with synthetic fixtures.
- Verify no prompt/tool payload persists or appears in the office by default.

### Phase 3 — Codex local adapter
- Implement only after Phase 0 feasibility and user approval.
- Add explicit enable/consent and CLI/version/auth diagnostics; use local stdio only.
- Normalize thread/turn/item events, recover from process exit, and shut down the child on disable/close.
- Test with mocked JSON-RPC fixtures and an authenticated local Codex CLI where available; report inability to test live integration honestly.

### Phase 4 — Release readiness
- Validate extension discovery, canvas open/actions, responsive/accessible renderer, both adapters independently, both enabled, and neither enabled.
- Add troubleshooting, permissions/privacy, provider availability, installation, and limitations docs.
- Publish only after product behavior matches labels and all provider acceptance tests pass.

## Risks / constraints

- Canvas and extension APIs are experimental and can change with the Copilot App/SDK release.
- Copilot session hooks can only report events visible to the hosting session and do not grant broad account monitoring.
- Codex app-server is documented as the rich-client interface; transport and event protocol stability/availability must be verified for the selected installed CLI. Some transports (notably WebSocket) are explicitly experimental/unsupported; prefer stdio and do not expose a listener.
- A ChatGPT subscription is not a guarantee of Codex CLI/app-server access; Codex CLI authentication/plan availability is account- and product-dependent.
- Local child-process execution requires careful consent, lifecycle cleanup, and error handling; never forward untrusted tool output into commands.
- No installable Copilot App extension can make provider events appear if the host/runtime does not expose them.

## Primary references

- Copilot SDK extension docs: `/Applications/GitHub Copilot.app/Contents/Resources/copilot-sdk/docs/extensions.md` and `canvas.d.ts` (installed SDK; verify version-specific APIs at implementation time).
- OpenAI Codex app-server: <https://developers.openai.com/codex/app-server/> — describes rich-client auth, history, approvals, streamed events, JSON-RPC, and experimental WebSocket limitations.
- OpenAI Codex SDK: <https://developers.openai.com/codex/sdk/> — documents TypeScript SDK for controlling local Codex threads; this is not assumed to be the activity observer for sessions outside the extension's control.
- GitHub Copilot MCP information (context only; VS Code documentation is not evidence of Copilot App canvas hook support): <https://docs.github.com/en/copilot/customizing-copilot/extending-copilot-chat-with-mcp>.
