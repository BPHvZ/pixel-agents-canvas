# ADR 0003: Product scope and Copilot App host constraints

- **Status:** Accepted
- **Date:** 2026-10-17

## Context

The product must be a usable, installable GitHub Copilot App canvas, not a demo that merely resembles an integration. It must support real Copilot and Codex activity without requiring an active paid GitHub Copilot plan. This does not mean “no GitHub account”: the GitHub Copilot App requires sign-in, but its official BYOK documentation says a Copilot plan is not needed when using a third-party model provider. A proxy-backed model route may also differ from the harness/activity source. Existing `PLAN.md` decisions limit Copilot SDK hook visibility to the hosting conversation and use an explicitly enabled local Codex CLI adapter for Codex-owned threads. Host distribution, permissions, runtime, and routing behavior must be verified; no broader capability can be inferred from another product.

The inspiration projects show distinct scope choices: `agent-virtual-office` emphasizes real event-driven status and compact visualization; `agent-office` includes agent chat/task management and calls itself early development; `pixel-agents` describes both extension and standalone delivery, but its README lists Codex as roadmap. These observations inform alternatives but do not establish features available to this project.

## Decision

- The product is one installable canvas experience supported in VS Code and the GitHub Copilot App. Target a single artifact, but use host-specific packaging over reduced provider access if validation proves one packaging path cannot serve both. Same product intent does not promise identical host capabilities.
- Meaningful use must not require an active paid GitHub Copilot plan. GitHub account sign-in may still be a host requirement, and third-party model providers/BYOK/proxy routes may be used. Report host availability separately from Copilot-plan status.
- Keep five facts distinct wherever known: host, harness/session activity source, model route, billing route, and discovery source. A Copilot CLI session using a proxy to an OpenAI/Codex model remains Copilot CLI-sourced activity; do not relabel it a Codex CLI session or imply GitHub model billing.
- V1 is a useful read-only dashboard: session/agent identity when available, activity source and discovery source, lifecycle/waiting state, safe task summary, and freshness. Open/focus is offered only where a public route is verified; otherwise the UI states it is unavailable. No launching, steering, task assignment, or orchestration.
- Include sessions not launched by the extension only where supported APIs provide them. Codex app-server discovery is a feasibility target after explicit provider opt-in; Copilot coverage may be limited to the hosting conversation. Unsupported, unavailable, confirmed-empty, stale, and disconnected are distinct states.
- The primary office emphasizes active sessions. Provider-reported terminal sessions are hidden by default; an opt-in view may show terminal sessions observed during the current host lifetime as sleeping/off-duty. No idle timeout may fabricate completion.
- Room/desk clusters group provider-established session relationships only. The main canvas stays focused; detailed source coverage is available in an optional, hidden-by-default secondary view, with a compact health indicator in the office.
- Preview remains an optional, explicitly labeled test/onboarding aid, never a substitute for provider support.

## Phase 0 approval (2026-10-17)

Phase 0 is approved to proceed to Phase 1. The user accepts normal host/workspace trust and deliberately opening this project canvas as consent to project-extension execution. VS Code workspace trust and Copilot CLI project-extension trusted-folder/explicit-opt-in behavior are documented; Copilot App project-canvas docs do not establish a separate pre-execution consent prompt, so do not claim one exists. Starting the Codex app-server remains a separate explicit user opt-in. Normal shutdown and tested provider-child cleanup paths are verified; no universal guarantee is claimed for arbitrary host crashes. See [phase-0-host-consent-lifecycle.md](../phase-0-host-consent-lifecycle.md).

## Consequences

- Product messaging must distinguish a real provider connection from preview, unavailable, and disconnected states.
- Control-plane features remain out of scope even though some inspiration projects offer them.
- Installation and runtime instructions must be tested against the actual Copilot App SDK/host version. Any capability claims need a cited, version-appropriate source or reproducible verification.
- If a paid GitHub Copilot plan is required for meaningful use despite a supported third-party model route, or the host prevents the local Codex path, the product requirement is unmet; escalate rather than conflating the plan requirement with GitHub sign-in.

## Alternatives considered

1. **Standalone product with optional canvas integration.** Rejected for this product direction: the installable canvas is the core target.
2. **Canvas plus a standalone preview as equivalent product paths.** Rejected: preview cannot replace actual provider integrations and may confuse product status.
3. **Interactive agent orchestration in v1.** Rejected: materially expands permissions and safety scope beyond read-only visualization.

## Revisit when

Copilot App host capabilities or distribution/plan requirements change, a model-routing change confuses harness identity with provider activity, Codex local-process support changes, or the user explicitly changes the read-only product requirement.

## V1 acceptance bar

The dashboard is useful without preview data: it shows discovered activity-source/session/agent identities, lifecycle and waiting states, a safe task summary where available, and source/freshness. Open/focus is offered only where a public route is verified; otherwise the UI states it is unavailable. Model/billing details are omitted from the default office unless a reliable host-reported details view is explicitly added. No arbitrary product cap is set; practical scale is established through rendering/performance tests. V1 is single-user in the current host context.
