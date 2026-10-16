# ADR 0003: Product scope and Copilot App host constraints

- **Status:** Proposed
- **Date:** 2026-10-16

## Context

The product must be a usable, installable GitHub Copilot App canvas, not a demo that merely resembles an integration. It must support real Copilot and Codex activity, and meaningful use must not require a Copilot subscription. Existing `PLAN.md` decisions limit Copilot visibility to the hosting session and use an explicitly enabled local Codex adapter. The canvas host's distribution, permissions, runtime, and subscription behavior are version-sensitive and must be verified; no broader capability can be inferred from VS Code documentation or other products.

The inspiration projects show distinct scope choices: `agent-virtual-office` emphasizes real event-driven status and compact visualization; `agent-office` includes agent chat/task management and calls itself early development; `pixel-agents` describes both extension and standalone delivery, but its README lists Codex as roadmap. These observations inform alternatives but do not establish features available to this project.

## Decision

- The product is one installable canvas experience supported in VS Code and the GitHub Copilot App. Target a single artifact, but use host-specific packaging over reduced provider access if validation proves one packaging path cannot serve both. Same product intent does not promise identical host capabilities.
- Meaningful use must not require a Copilot subscription. Enable providers independently; report each host/provider's actual access and coverage.
- V1 is a useful read-only dashboard: session/agent identity when available, provider and discovery source, lifecycle/waiting state, safe task summary, freshness, and documented open/focus navigation where supported. No launching, steering, task assignment, or orchestration.
- Include sessions not launched by the extension only where supported APIs provide them. Codex app-server discovery is a feasibility target after explicit provider opt-in; Copilot coverage may be limited to the hosting conversation. Unsupported, unavailable, confirmed-empty, stale, and disconnected are distinct states.
- The primary office emphasizes active sessions. Provider-reported terminal sessions are hidden by default; an opt-in view may show terminal sessions observed during the current host lifetime as sleeping/off-duty. No idle timeout may fabricate completion.
- Room/desk clusters group provider-established session relationships only. The main canvas stays focused; detailed source coverage is available in an optional, hidden-by-default secondary view, with a compact health indicator in the office.
- Preview remains an optional, explicitly labeled test/onboarding aid, never a substitute for provider support.

## Consequences

- Product messaging must distinguish a real provider connection from preview, unavailable, and disconnected states.
- Control-plane features remain out of scope even though some inspiration projects offer them.
- Installation and runtime instructions must be tested against the actual Copilot App SDK/host version. Any capability claims need a cited, version-appropriate source or reproducible verification.
- If the canvas host requires a subscription or prevents the Codex/local provider path, the current product requirement is unmet; this is a decision to escalate, not permission to weaken the requirement.

## Alternatives considered

1. **Standalone product with optional canvas integration.** Rejected for this product direction: the installable canvas is the core target.
2. **Canvas plus a standalone preview as equivalent product paths.** Rejected: preview cannot replace actual provider integrations and may confuse product status.
3. **Interactive agent orchestration in v1.** Rejected: materially expands permissions and safety scope beyond read-only visualization.

## Revisit when

Copilot App host capabilities or distribution/subscription rules change, Codex local-process support changes, or the user explicitly changes the read-only product requirement.

## V1 acceptance bar

The dashboard is useful without preview data: it shows discovered provider/session/agent identities, lifecycle and waiting states, a safe task summary where available, source/freshness, and open/focus navigation where supported. No arbitrary product cap is set; practical scale is established through rendering/performance tests. V1 is single-user in the current host context.
