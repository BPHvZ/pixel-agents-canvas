# ADR 0003: Product scope and Copilot App host constraints

- **Status:** Proposed
- **Date:** 2026-10-16

## Context

The product must be a usable, installable GitHub Copilot App canvas, not a demo that merely resembles an integration. It must support real Copilot and Codex activity, and meaningful use must not require a Copilot subscription. Existing `PLAN.md` decisions limit Copilot visibility to the hosting session and use an explicitly enabled local Codex adapter. The canvas host's distribution, permissions, runtime, and subscription behavior are version-sensitive and must be verified; no broader capability can be inferred from VS Code documentation or other products.

The inspiration projects show distinct scope choices: `agent-virtual-office` emphasizes real event-driven status and compact visualization; `agent-office` includes agent chat/task management and calls itself early development; `pixel-agents` describes both extension and standalone delivery, but its README lists Codex as roadmap. These observations inform alternatives but do not establish features available to this project.

## Decision

- Treat the installable Copilot App canvas as the core product and source of product behavior. A preview/sample mode may be offered only as an optional, explicitly labeled onboarding/testing aid; it must never be the only working mode or masquerade as provider activity.
- Keep v1 read-only: visualize observable Copilot/Codex sessions; do not launch agents, assign tasks, send prompts, or orchestrate work.
- Support the hosting Copilot session and the opt-in local Codex integration described in ADR 0001, without requiring a Copilot subscription for meaningful use. State clearly that Codex access depends on local CLI availability and user access; a ChatGPT subscription is not assumed to grant it.
- Treat host/install/distribution availability and subscription independence as release validation gates. If the current canvas host cannot meet them, report the limitation and revisit product viability rather than substituting a demo or silently changing the target product.

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
