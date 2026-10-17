---
name: canvas-development
description: "Use when implementing or changing this repository's office canvas, renderer, browser UI, actions, SDK wiring, panel lifecycle, or presentation storage. Guides typed implementation, factual-versus-fictional behavior, and local/host verification."
---

# Develop the office canvas

Use the available editor, terminal, browser, and documented host interfaces; this workflow requires no named agent tool or particular model. Read the [repository guide](../../../AGENTS.md) and [extension guide](../../../.github/extensions/pixel-agents-canvas/AGENTS.md). Stop before implementation if the requested behavior changes an accepted product boundary without user approval.

## 1. Select one behavior

Read the relevant [plan](../../../PLAN.md), [progress item](../../../docs/implementation-progress.md), and ADR. For visuals, read [ADR 0008](../../../docs/adr/0008-stateful-office-ambience.md); it owns vignette eligibility/interruption, props, dialogue, motif/privacy controls, abandoned spaces, and the desk-setup exception. For provider semantics, also use [canvas-provider-validation](../canvas-provider-validation/SKILL.md).

Identify the public module interface to exercise, the externally observable result, and which checks can prove it. The outcome of this step is a bounded behavior with a verification path, not a rewrite of the whole office.

## 2. Implement a typed vertical slice

- Inspect existing source/types/tests. Add a behavioral regression at the public interface, confirm it catches the missing/incorrect behavior, then implement the slice.
- Keep SDK wiring, domain normalization, browser code, and fictional presentation state separate. Factual state must be unchanged by a vignette, caption, alias, prop, or motif.
- Add concrete types for new events/records and narrow untrusted inputs from `unknown`. Extend validation and tests with the type; do not use a declaration or assertion to pretend an unsupported SDK/provider field exists.
- For interaction, expose factual status through text and keyboard-accessible controls. For motion, verify interruption and reduced motion. For storage/lifecycle, cover idempotent reopen, state lifetime, cleanup, and failure paths defined by the extension guide.

This step is complete when the new behavior passes its targeted check and existing relevant behavior is preserved.

## 3. Verify locally

Run the smallest relevant test during iteration, then the repository's `npm run check` before code delivery. For browser changes, serve the real renderer/module over loopback HTTP using test-only metadata and verify initial render, refresh, hostile text handling, keyboard operation, reduced motion, and narrow viewport behavior for the changed surface. Keep fixture data out of shipped office state and stop test helpers afterward.

## 4. Verify in a real host when applicable

When SDK wiring, renderer assets/routes, actions, or lifecycle changed:

1. Use the host's documented project-extension reload/restart operation, if available and safe for the user's active session.
2. Discover the current canvas capabilities and verify the changed action/schema, rather than assuming the previous provider reloaded.
3. Open a stable panel instance with schema-valid input, invoke a safe read-only action, then reopen the same instance and verify preserved state/server reuse.
4. Exercise the changed close/shutdown path where supported without terminating unrelated user sessions.

If an operation is unavailable or unsafe, record exactly which host checks remain unperformed. Local tests, screenshots from fixtures, or a type-only SDK declaration are not substitutes for this evidence.

## 5. Close the slice honestly

Update the affected documentation and progress item with checks and limitations. Distinguish approved design, locally tested implementation, host-verified behavior, and release readiness. Deliver the change summary, checks run, and remaining gaps; preserve the user's branch/worktree and unrelated files.
