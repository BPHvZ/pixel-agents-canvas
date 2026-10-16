# Pixel Agents Office: Product plan

**Status:** Product refinement approved; implementation not yet authorized by this document
**Last updated:** 2026-10-16

## Product goal

Deliver a genuinely useful, installable, read-only session dashboard in a pixel-art office—not a demo presented as a product. Target one canvas experience in both VS Code and the GitHub Copilot App, and do not require a Copilot subscription for meaningful use. Show all Copilot/Codex coding-agent sessions only where supported host/provider APIs make them observable; disclose coverage differences rather than inventing activity. An optional preview is solely an explicitly labeled onboarding/test aid.

## Product definition

### V1 dashboard

The office is the primary view and must remain useful without sample data. For each observable session and provider-identified agent, show identity when available, provider and discovery source, provider-reported lifecycle/waiting state, safe task summary when available, last activity/freshness, and open/focus navigation when supported. Make missing fields explicit instead of fabricating values. Distinguish unsupported provider, supported-but-unavailable integration, connected with confirmed no sessions, stale/disconnected source, and discovered sessions.

Represent each distinct provider-established agent identity—including separately identified subagents—as a character, grouped into a session room/desk cluster only when the relationship is provider-reported. Do not infer extra workers or hierarchy from tool events/text. Room layout is generated, not user-editable in V1, and does not imply shared files or workspace. Playful role/mood cues may be activity-derived if clearly marked as inference and strictly decorative; they never alter factual lifecycle, sorting, or actions.

Show active sessions by default. Hide provider-reported terminal sessions; offer a setting to show terminal sessions observed during the current host lifetime as sleeping/off-duty. Never infer completion from an idle timeout. Keep a compact source-health indicator in the office; expose detailed coverage in an optional, hidden-by-default secondary view.

### Interaction and boundary

Read-only means the extension never launches a model turn, sends/steers a prompt, assigns work, stops/pauses an agent, or orchestrates. Users may open/focus an underlying conversation only when a documented host/provider navigation API supports it. One user/current host context only in V1; no shared-office synchronization. Do not impose an arbitrary product cap; establish practical performance limits by testing.

### Data and consent

Provider metadata is the default source for sanitized task summaries. Prompt summarization is a separate setting, off by default, persisted as a preference only. When explicitly enabled, it must process on-device/transiently, display only the summary, immediately discard raw prompt text, avoid content-bearing logs, and allow disablement. Keep activity timeline and all discovered activity in memory only; clear it when the extension/host closes. No session content, prompts, summaries, or activity timeline may be sent externally. If these properties cannot be demonstrated in a host, prompt summarization stays unavailable there.

Enable providers independently. Codex discovery can start an extension-managed local `codex app-server` over stdio only after explicit user enablement; it is not a separate companion app, stops with the extension, and does not read auth/config files. Copilot support may be limited to the hosting conversation. Do not require equal coverage; show the source limitations. A ChatGPT subscription is not assumed to grant Codex CLI access.

## Current implementation and gap

The current canvas listens to hooks from its hosting Copilot App session and displays one generic Copilot entry. It starts an opt-in Codex app-server, creates an ephemeral thread, and accepts events only for thread IDs in its `ownedThreads` set. It does not discover existing Codex threads or unrelated Copilot sessions, model multiple provider-identified agents/subagents, or meet the full V1 usefulness bar. Existing preview-like rendering and any seeded labels are not a product substitute. No implementation code is authorized by this refinement.

## Proposed architecture

1. **Canvas shell and host packaging** — Keep the canvas as the product surface. Validate supported extension packaging, process/runtime permissions, and lifecycle in both target hosts. A single artifact is the goal; allow host-specific packaging that shares product/core code if required rather than weakening access or requiring a Copilot subscription.
2. **Provider-neutral domain model** — Normalize provider sessions, agent identities, reported parent/session relationships, lifecycle, safe summary, timestamps, freshness, discovery source, and capabilities. Preserve provenance and represent absence/unknown explicitly.
3. **Independent adapters** — Copilot consumes supported hosting-session hooks; Codex uses an explicitly enabled local stdio app-server candidate. Adapter states must distinguish unsupported, unavailable, confirmed empty, stale/disconnected, and active discovery.
4. **Office and coverage views** — Main view maps provider-established agents into session clusters and prioritizes active work. An optional hidden-by-default view explains provider scope, availability, discovered session count, freshness, and known limitations. Both views expose accessible textual status; animation is supplementary.
5. **Privacy boundary** — Field-select provider metadata; never copy full payloads. Default to metadata summaries and transient in-memory activity. Gate prompt summarization behind explicit consent and demonstrable local-only transient handling. Persist only that setting.

## Delivery phases and acceptance criteria

### Phase 0 — Feasibility / release gates
- Verify current official app-server `thread/list`, metadata fields, lifecycle notifications, parent/subagent representation, archive/terminal semantics, pagination, and supported CLI versions. Demonstrate discovery of existing threads without reading transcript content in metadata-only mode.
- Verify explicit process consent, local stdio launch/stop, host lifecycle, and no external session-data transmission in both canvas runtimes.
- Verify official host navigation/open-focus capability, or document its absence.
- Verify canvas extension installation/packaging and useful operation without a Copilot subscription. Test whether one artifact works in both hosts; decide packaging accordingly.
- Confirm the host's prompt hook delivery and ensure opt-in summarization can be transient/on-device with raw prompt discard. Otherwise omit that setting per host.
- **Gate:** if a required capability is unsupported, narrow and clearly label that source's coverage; do not substitute simulation. Revisit product viability only if no provider path can meet the minimum usefulness bar.

### Phase 1 — Domain and provider-neutral core
- Implement/test session-versus-agent identity, provider-established hierarchy, provenance, partial/unknown values, terminal states, stale/fresh status, and independent provider availability.
- Test malformed, duplicate, out-of-order, and missing provider signals without implying false work or completion.

### Phase 2 — Codex existing-session discovery
- After Phase 0 validation, implement explicit opt-in local app-server lifecycle and list/subscribe metadata for supported existing threads.
- Do not access transcripts unless prompt-summary consent is enabled; even then enforce the separate privacy contract.
- Test pagination, process failure/restart, archive/completion, thread ownership boundaries, relationships, and cleanup with fixtures plus a live CLI where available.

### Phase 3 — Copilot and navigation adapters
- Implement the documented hosting-conversation hooks and expose their narrow scope.
- Add open/focus only when confirmed by a supported host/provider API; do not call guessed internal commands.
- Ensure providers work independently and a missing Copilot entitlement does not block Codex functionality.

### Phase 4 — Product UI and consent
- Build clustered agent representation, active-first filter, opt-in current-run sleeping/off-duty view, optional coverage panel, safe summaries, freshness, and explicit per-source states.
- Add prompt-summary consent only where local-only transient handling is proven; persist preference only and show a processing indicator.
- Meet keyboard, screen-reader, reduced-motion, responsive, and readable status acceptance criteria.

### Phase 5 — Distribution and release verification
- Test installation and lifecycle in VS Code and Copilot App, provider combinations (Copilot only, Codex only, both, neither), no Copilot entitlement, no-session/unsupported/offline states, open/focus, and practical scale.
- Document installation, consent, data boundaries, provider-specific coverage, limitations, and troubleshooting. Publish only with product behavior aligned with labels; preview remains off by default and visibly separate.

## Decisions already made

See ADRs 0001–0007. In brief: read-only local-first dashboard; one product targeting both hosts with truthful host-specific scope; no Copilot subscription gate; independent providers; explicit Codex process consent; supported API discovery only; transient timeline; metadata summaries by default; explicit opt-in prompt processing only if locally enforceable; provider-established agent identities/relationships; active sessions by default; optional coverage and inactive-session views; no simulation as fallback.

## Unresolved validation questions

These are research/acceptance gates, not silently assumed product decisions:

- Does Codex app-server `thread/list` expose enough safe metadata for useful summaries/status without transcript reads, and can it report subagent identities/links across supported CLI versions?
- Can canvas extension lifecycle launch and manage a local child process consistently in both hosts, with user consent and deterministic cleanup?
- What session-opening/navigation command is officially supported in each host/provider?
- Can the same installable artifact work in both hosts without a Copilot subscription, or is shared-core host-specific packaging required?
- Can prompt text be summarized on-device transiently in both hosts without host-side external processing, content logs, or retained raw text?
- What practical maximum agent/session count meets performance and accessibility expectations?

## Inspiration and evidence

The public READMEs are inspiration, not product requirements. `agent-virtual-office` describes real session/CI status integrations and playful reactions, emphasizing actual status and no invented dialogue. `agent-office` advertises chat, task assignment, saved results, integrations, and decisions while warning that it is early development; those control features are outside this product's read-only scope. `pixel-agents` describes one character per agent terminal and separate characters for observable subagents/teammates, a provider-neutral hook-provider interface, and persistent editable layouts; its README lists Codex as roadmap rather than shipped support. These examples support exploring grouped characters and adapter boundaries, but do not prove this host can observe equivalent signals.

## Primary references

- VS Code 1.142 canvases preview: https://code.visualstudio.com/updates/v1_142#_canvases-preview — canvases work in editor and Agents window and extensions are supported in Copilot App; VS Code preview availability is described for local Copilot-harness sessions. This is not proof of cross-session observability.
- VS Code API reference: https://code.visualstudio.com/api/references/vscode-api — public extension API inventory; no general chat-session enumeration API has been established in this refinement.
- Copilot App canvas extension docs: https://docs.github.com/en/copilot/how-tos/github-copilot-app/working-with-canvas-extensions
- Codex app-server protocol: https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md — official protocol currently documents `thread/list`; validate method/schema against the selected supported CLI release.
- Inspirations: https://github.com/KbWen/agent-virtual-office, https://github.com/Pixel-Process-UG/agent-office, https://github.com/pixel-agents-hq/pixel-agents
- Project-specific Copilot SDK docs/types are versioned with the installed extension SDK and must be checked during implementation.
