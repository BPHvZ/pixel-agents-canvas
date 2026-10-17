# Implementation progress

This checklist tracks the product plan in [PLAN.md](../PLAN.md) and decisions in [docs/adr](./adr). Check an item only when its evidence or verification is recorded. Keep this file current as each vertical slice lands; do not mark a phase complete while a gate is unresolved.

## Status snapshot — 2026-10-17

**Overall: implementation in progress; not release-ready.** Work remains in the original waddle worktree on `develop`. Phase 0 approval is a feasibility decision, not completion of the later product/release gates.

| Phase | Status | Remaining acceptance work |
|---|---|---|
| 0 — Feasibility | Approved | Keep version-specific evidence and privacy/host limitations explicit |
| 1 — Domain/core | In progress | Unified provider capabilities/availability integration and verification |
| 2 — Codex discovery | Initial slice implemented | Recovery/reconnect, concurrent-pagination behavior, and cross-version validation |
| 3 — Copilot/navigation | Partial | Validate current hosting-session wiring after reload; retain unsupported cross-session navigation disclosure |
| 4 — Office UI | Design approved; initial renderer implemented | Agent/session clustering, factual feed/coverage, accessibility, preferences/motifs, and ADR 0008 ambience |
| 5 — Release | Pending | Fresh verification in both hosts, provider combinations, updated UI scale/accessibility checks, and release documentation |

### Delivered evidence

- `532e672`: approved ADR/UI refinement, merged into `develop` by `633e1b2`; covers the accepted scope rather than claiming the UI exists.
- `35e7fe7`: typed discovery/core and checked renderer/browser modules, ESLint/strict TypeScript, no-`any` policy regressions, and CI. Local `npm ci && npm run check` passed with **35 tests**; [implementation CI passed](https://github.com/BPHvZ/pixel-agents-canvas/actions/runs/39064977670). The local HTTP/Chrome check also verified module loading, polling updates, and a narrow viewport. This does not prove a host loaded the new extension.
- `d7bf978`: portable root/subtree agent instructions and two project-owned skills; [CI passed](https://github.com/BPHvZ/pixel-agents-canvas/actions/runs/39065651959).
- `f8bab81`: explicit accepted-ADR coverage gate and continuous product-plan/progress updates; links and skill frontmatter validated, and [CI passed](https://github.com/BPHvZ/pixel-agents-canvas/actions/runs/39066198324).

### Next implementation slices

1. Finish and test unified provider health/capability reporting and recovery/lifecycle handling (ADRs 0001/0007), keeping turn outcome distinct from session closure.
2. Complete hosting-session adapter verification and reload/open/action/reopen checks for the current code in both hosts (ADRs 0001/0003/0007). Record unavailable checks rather than reusing Phase 0 evidence as current-code validation.
3. Build provider-identified agent/session clusters and the factual roster/feed/coverage with accessibility and title visibility controls (ADRs 0002/0004/0005/0006).
4. Add the separately tested fictional-office layer, customization, motifs, and prop/abandoned-cluster lifecycle (ADR 0008); preserve factual state and feed throughout.

No product acceptance checkbox is advanced by this documentation-only status update. No new host or live-provider validation was performed for this update.

## Phase 0 — Feasibility and release gates

- [x] Confirm official Codex app-server protocol documents thread listing (`thread/list`). Evidence: [OpenAI Codex app-server protocol](https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md). This confirms the method exists; it does **not** yet prove that metadata-only live discovery works as required.
- [x] Confirm available VS Code Canvas docs do not establish general discovery of unrelated Copilot conversations; current Copilot extension hooks are hosting-session scoped. Evidence: [VS Code canvases preview](https://code.visualstudio.com/updates/v1_142#_canvases-preview), [VS Code API reference](https://code.visualstudio.com/api/references/vscode-api), and current hook implementation in `.github/extensions/pixel-agents-canvas/extension.mjs`.
- [x] Validate Codex `thread/list` and subscription notifications against installed CLI **0.163.0**; inspect safe summary fields, parent/subagent identity links, pagination, and terminal/archive semantics without reading transcripts. The generated v2 schema includes `ThreadListParams` cursor/limit/archive filters and `useStateDbOnly`, `ThreadListResponse` cursor fields, `Thread.parentThreadId`/source/status/timestamps, `thread/status/changed`, and archive/unarchive notification methods. `Thread.preview` may contain the first user message; the live probe deliberately ignored it. Live `thread/list` succeeded with `useStateDbOnly: true`; both current/archived filters and multiple pages worked (162 active rows were counted in memory only). `thread/resume` with `excludeTurns: true` succeeded, followed by `thread/unsubscribe`; `thread/status/changed` arrived during an idle wait (other background notifications also arrived). Process exited cleanly with code 0 on SIGTERM. No thread IDs, preview values, or transcript content were retained. Compatibility across additional CLI versions and pagination consistency under concurrent changes remain release validation; thread close/archive mapping must remain distinct from turn outcome. Schema confirms turn outcomes are separate (`completed`, `interrupted`, `failed`, `inProgress`) from ThreadStatus (`active`, `idle`, `systemError`, `notLoaded`).
- [x] Verify local stdio process startup/shutdown and extension cleanup in both VS Code and Copilot App runtimes. VS Code Copilot CLI custom-endpoint session: explicit action spawned Codex app-server, empty-thread creation succeeded without a turn, SIGTERM exited code 0, and only Codex disconnected. Copilot App: the same Codex app-server lifecycle succeeded; session shutdown stopped the host extension. Separately exercised the bundled Copilot App extension bootstrap with a test parent process; when that parent was terminated, its watchdog exited the child. Finally terminated the VS Code test extension process; it exited normally via its parent watchdog (`stopped-normally`). No real prompt or transcript content was used. Host consent policy and arbitrary host hard-crash guarantees are documented in [docs/phase-0-host-consent-lifecycle.md](./phase-0-host-consent-lifecycle.md); the isolated Codex stdio child exits on parent pipe closure after SIGKILL, and no universal cleanup guarantee is claimed. See [docs/phase-0-feasibility.md](./phase-0-feasibility.md).
- [x] Close the supported navigation feasibility question: user confirms there is no Copilot App canvas deep link and requires manual opening by session instruction. Use that flow; don't add a fake app deep link. VS Code public docs still lack supported cross-session open/focus API. Codex thread deep-link navigation remains unavailable unless a public host/provider route is later established; see [docs/phase-0-vscode-navigation.md](./phase-0-vscode-navigation.md).
- [x] Verify that no active paid GitHub Copilot plan is required for the observed Copilot CLI custom-endpoint route. Current Copilot App and VS Code session both use the custom endpoint via VibeProxy with ChatGPT billing and no paid Copilot plan; the project extension and canvas work in both. General BYOK is a separate documented route (VS Code Copilot harness requires `chat.agentHost.byokModels.enabled`).
- [x] Verify the VS Code canvas renders in the current Copilot CLI VibeProxy custom-endpoint session; extension loads, local renderers pass health, and the Copilot CLI session remains the activity source. Independently enabling Codex started the app-server and created an empty idle ephemeral thread without starting a turn. After SIGTERM, only Codex disconnected and Copilot CLI remained connected. This directly verifies the mixed custom-model/billing route plus independent activity sources without a paid Copilot plan.
- [x] Decide the precise V1 privacy statement: the dashboard adapter does not intentionally expose or retain prompt/tool text; this is a source-level data-minimization claim only, **not** a promise of zero host/runtime/provider/proxy egress or logging. Prompt summarization is out of scope pending an end-to-end audit. Evidence and limits: [docs/phase-0-privacy.md](./phase-0-privacy.md).
- [x] Close unsupported navigation scope: open the canvas from its owning session; no cross-session navigation to discovered threads without a documented API. Evidence: [docs/phase-0-vscode-navigation.md](./phase-0-vscode-navigation.md).
- [x] Establish practical renderer scale at 100 sessions/300 agents. All 300 synthetic fixture rows rendered; median page load plus two animation frames was 50.49 ms in Chrome 152, no page errors or horizontal overflow. Limits and method: [docs/phase-0-rendering-scale.md](./phase-0-rendering-scale.md).
- [x] Characterize host trust/extension consent and tested process lifecycle paths. VS Code workspace trust and Copilot CLI trusted-folder/explicit-opt-in gates are documented; Copilot App project-canvas extension consent is not specified by first-party docs. The user accepts deliberately opening this project canvas as consent to execute its extension; do not claim a separate App trust prompt. Normal shutdown cleanup is verified; an isolated parent-SIGKILL probe observed the Codex stdio child exit on pipe EOF, without a universal host-crash guarantee. Codex provider start remains separately explicit opt-in. Details: [docs/phase-0-host-consent-lifecycle.md](./phase-0-host-consent-lifecycle.md).
- [x] Phase 0 gate review: supported scope, evidence, and deferred items recorded. **GO: Phase 0 approved; proceed to Phase 1.** The user accepts standard host/workspace trust and their deliberate use of this project canvas as consent to project-extension execution; Codex process startup still requires separate explicit opt-in. The Copilot App's first-party docs do not promise a separate project-extension trust prompt, so product/privacy docs must not claim one exists. Whole-host abrupt-crash cleanup also has no universal guarantee; normal cleanup and tested child-process exit paths are acceptable for Phase 0, with graceful cleanup and restart safety required. Scale is measured at the agreed target; privacy wording and navigation scope are resolved. The custom-endpoint session plus independent Codex source have both been live-verified in VS Code and Copilot App.

## Phase 1 — Provider-neutral domain and core

- [x] Agree the public normalization seam before writing tests: `normalizeSnapshot(provider, source, snapshot)` returns normalized sessions and provider-identified agents; it does not infer hierarchy, read transcripts, or manage provider status.
- [x] Add the first vertical normalization slice with explicit provenance, source IDs, `null` for absent summary/time/name/parent fields, and `unknown` for unmapped lifecycle states. Evidence: `.github/extensions/pixel-agents-canvas/test/domain.test.js`.
- [x] Extend/test distinct session and agent identities, provider-established hierarchy, partial/unknown values, lifecycle, freshness, and independent provider availability. Evidence: `.github/extensions/pixel-agents-canvas/src/domain.js` and `test/domain.test.js` (Codex v2 schema generated from installed CLI 0.162.1).
- [x] Test duplicate, malformed, out-of-order, missing, stale, and future-dated signals without false activity/completion. Evidence: `test/domain.test.js` and `test/state.test.js`.
- [x] Add custom provider/domain/protocol types and checked JavaScript, including the separate browser module. Reproducible verification is now `npm run check`: ESLint (zero warnings), strict TypeScript with `noImplicitAny` and unchecked-index checks, and 35 tests. Lint rejects explicit `any` in declarations and JSDoc (including nested types and wildcard syntax); type-aware rules reject unsafe inferred values. Negative tests prove the policy. The SDK declaration is a type-only projection of the runtime-injected surface, not proof of host compatibility.
- [ ] Finish and verify independent provider capability/availability reporting through one adapter interface. Current wiring emits normalized Copilot/Codex status in `/state` and `list_agents`, with Codex connection/list/monitoring distinctions; capability reporting and end-to-end adapter/UI verification remain incomplete (ADRs 0001/0007).

## Phase 2 — Codex existing-session discovery

- [x] Implement the explicit opt-in local app-server lifecycle after Phase 0 approval. The `Enable local Codex` canvas control starts the provider; shutdown unsubscribes tracked threads and terminates the child.
- [x] Discover active and archived existing threads through paginated `thread/list`, using `useStateDbOnly: true`; field-select metadata, discard previews/turns/paths, resume active threads with `excludeTurns: true`, and preserve archive/turn/thread-close distinctions. Per-thread monitoring failures are distinct from provider process availability. Unit coverage: `test/codex-client.test.js`. CLI 0.163.0 live list/read-only verification was completed during Phase 0; a bulk live resume of all listed threads was intentionally not performed.
- [ ] Complete provider recovery/reconnect, concurrent-pagination stability, and cross-version lifecycle validation. Current fixtures cover pagination, content-field discard, archive vs close, turn outcome vs thread state, and unsubscribe; domain tests cover reported hierarchy.

## Phase 3 — Copilot and navigation adapters

- [ ] Implement supported hosting-conversation hooks with accurate narrow-scope labeling.
- [ ] Implement documented open/focus navigation only where supported.
- [x] Verify Codex app-server lifecycle works independently in the active VS Code Copilot CLI custom-endpoint session. Explicit enable action spawned `codex app-server`; `list_agents` reported connected; `start_codex_thread` returned an empty ephemeral idle thread without a model turn. SIGTERM exited the child, `list_agents` reported disconnected, and no process remains. The Copilot CLI source remained connected. This verifies the two activity sources are independently operable under the no-paid-plan custom endpoint route. Generic VS Code BYOK remains a distinct setup requiring `chat.agentHost.byokModels.enabled`.

## Phase 4 — Product UI and consent

- [ ] Render one character per provider-identified agent, clustered by reported session relationship.
- [x] Extract the renderer and browser behavior into checked sibling modules; add same-origin `/state` polling, render discovered session cards/figures, and remove thread creation. Tests cover script-safe title embedding and browser state validation. A local HTTP/Chrome smoke test verified module loading, session rendering, live polling updates, and a 390px viewport without overflow or page errors. Full clustering, per-agent identity, and the accepted fictional layer remain pending.
- [ ] Add active-first view and opt-in current-run sleeping/off-duty view for provider-reported terminal agents.
- [ ] Add compact source health and optional hidden-by-default coverage view.
- [ ] Add safe summaries, lifecycle/freshness, distinct source states, accessible text, keyboard support, responsive layout, and reduced motion.
- [x] Approve the UI presentation/design model: factual provider layer plus labeled fictional office ambience, task-title motifs, local visual identity, stateful props, idle-only vignettes, and explicit agent departure behavior. Evidence/decisions: [ADR 0005](./adr/0005-observable-activity-and-office-presentation.md), [ADR 0006](./adr/0006-agent-identity-and-office-grouping.md), [ADR 0008](./adr/0008-stateful-office-ambience.md). Implementation is in progress; see the following checked slice and remaining UI acceptance items.
- [ ] Implement the approved office UI and personalization; do not add prompt-summary consent or transcript-based task processing in V1.

## Phase 5 — Distribution and release

- [ ] Verify install/open/close lifecycle in VS Code and Copilot App after reloading the current implementation. Prior Phase 0 host evidence does not validate these new changes; the available canvas provider still advertised the previous thread-creation action before reload.
- [ ] Verify Copilot-only, Codex-only, both, neither, no entitlement, no sessions, unsupported, offline/stale, and confirmed-empty states.
- [ ] Verify open/focus, accessibility, reduced motion, and tested scale.
- [ ] Update installation, consent, privacy, provider coverage, limitations, and troubleshooting documentation.
- [ ] Release gate: labels match actual behavior; preview is optional and visibly separate; no unresolved release-blocking Phase 0 gates.

## Update protocol

Before starting each work item, identify its covering accepted ADR; if none applies or the decision must change, create or update an ADR and obtain approval before implementation. Reuse existing decisions for work within their scope.

After each development slice, update this tracker and [PLAN.md](../PLAN.md), not only at delivery. Keep the plan's current implementation/gaps and next steps aligned with accepted ADRs. Record the covering ADR, verified progress, commands/results, remaining work, and blockers here; add commit/PR references when useful. A checkbox is not complete merely because code exists; tests or reproducible host validation must pass.
