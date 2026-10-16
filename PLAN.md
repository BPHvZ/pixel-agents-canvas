# Pixel Agents Office: Product plan

**Status:** Approved for implementation under conservative defaults (user instruction: proceed autonomously)
**Last updated:** 2026-10-16

## Product goal

Ship a public, installable GitHub Copilot App canvas extension that meaningfully visualizes real AI-agent activity in a delightful pixel-art office. GitHub Copilot (the current Copilot App session) and OpenAI Codex must be supported through their actual local/runtime interfaces. Meaningful use must not depend on the user having a Copilot subscription; verify the host, install, and runtime constraints before claiming availability. The canvas is the product; any clearly labeled preview mode is optional onboarding/testing only and is never a substitute for real provider integrations. The office must not imply that a provider is connected when it is not. The initial product is read-only session visualization, not an agent launcher, task manager, or orchestration surface.

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

- Treat this as a real integration product; demo data is not evidence of provider support. Preview is optional and explicitly labeled, not the product.
- Support both Copilot and Codex while ensuring meaningful product use is not gated on a Copilot subscription; validate actual host/installation limits rather than assume cross-host or account-wide access.
- Keep the initial experience read-only: visualize observed sessions without assigning tasks, launching agents, or orchestrating work.
- Copilot support is scoped to the hosting session exposed to the extension, not all user sessions.
- Codex support is a separately enabled local adapter, not an API-key integration or automatic subscription bridge.
- Activity is privacy-minimized: lifecycle metadata only by default; no prompt or tool payload capture. Detailed information is not part of the default product; any future opt-in must be demonstrably on-device, protected, and separately reviewed for consent, retention, and deletion.
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

## Product scope and inspiration notes

The references below are examples, not product specifications. Feature descriptions are observations from their public project READMEs and may change:

- [agent-virtual-office](https://github.com/KbWen/agent-virtual-office) describes a compact pixel office driven by real session/CI events, status APIs and integrations including Codex CLI/App; it emphasizes not inventing agent dialogue and documents hook-driven activity. This supports the truthful, event-driven visualization direction.
- [agent-office](https://github.com/Pixel-Process-UG/agent-office) describes chat, task assignment, saved results, integrations, decisions and accessibility; its README labels the project early development. These broader control features are explicitly outside this product's initial read-only scope.
- [pixel-agents](https://github.com/pixel-agents-hq/pixel-agents) describes a provider-neutral hook-provider boundary, local provider hooks plus transcript scanning, an editable/persistent office, and extension/standalone delivery. Its README identifies Claude as the reference implementation and Codex as roadmap, so it is evidence for an architectural pattern, not proof of Codex support.

## Open validation gates

- Verify the actual Copilot App canvas installation/distribution and host API requirements, and confirm meaningful use without a Copilot subscription. Do not infer these guarantees from VS Code or another product's documentation.
- Verify what on-device boundaries are technically enforceable for this canvas and local Codex process. If the host cannot guarantee that detailed information stays local and protected, keep the metadata-only default and do not offer detailed capture.
- Compare provider-supplied explicit events/hooks with optional provider-local discovery. Any discovery must be opt-in, scoped, capability-reported, and must not enumerate unrelated/private history without a separately accepted decision.
- Confirm provider event coverage and truthful status mapping; missing/ambiguous signals must resolve to `unknown`/disconnected, not fabricated activity.

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
