---
name: canvas-provider-validation
description: "Use when changing Copilot hosting-session hooks, Codex discovery/subscriptions, activity normalization, provider health, process recovery, metadata privacy, or provider lifecycle tests in this canvas. Verifies protocol evidence, independent sources, and cleanup without model turns or session control."
---

# Validate an activity provider

Apply the [repository guide](../../../AGENTS.md). Read [ADR 0001](../../../docs/adr/0001-provider-integration-boundaries.md), [ADR 0007](../../../docs/adr/0007-provider-consent-and-discovery.md), and the [glossary](../../../GLOSSARY.md) before changing the adapter interface. Read [ADR 0002](../../../docs/adr/0002-activity-data-and-retention.md) and [ADR 0004](../../../docs/adr/0004-local-data-and-privacy-boundaries.md) when fields or data lifetimes change.

## 1. Establish the external contract

Use official SDK/protocol documentation and the supported CLI's schema to establish available methods, field meanings, notifications, timestamps, and supported versions. Record unsupported/unknown capabilities rather than guessing commands or reading history/auth/config files. Source-model vendor and billing do not identify the harness; a Copilot session using a proxy-backed model remains Copilot-sourced activity.

Identify the accepted ADR covering the work before implementation; if coverage is missing or the decision changes, follow the repository guide's ADR approval gate. The result is an ADR-backed adapter change with evidence and explicitly selected metadata fields. Existing Phase 0 reports are versioned evidence, not proof that a newer host or CLI behaves identically.

## 2. Test through the adapter interface

Use synthetic protocol responses and an injected child-process adapter, not a mock of internal methods. Add the smallest regression for the changed behavior and verify its failure before implementation. Select cases relevant to the change:

| Area | Evidence to require |
|---|---|
| Discovery | All pages, duplicates, malformed/cycling cursors, active/archive distinctions, and explicit failure rather than silently reporting empty |
| Privacy | Content-bearing sentinel values in previews/turns/tool payloads/paths never reach returned metadata, renderer state, events, logs, or persistent state |
| Identity | Distinct provider/session/agent identities and only provider-reported parent links |
| Lifecycle | Idle/archive/turn completion do not manufacture session closure; preserve turn outcomes separately from thread state |
| Health | Missing CLI, confirmed empty, partial monitoring failure, stale/future/out-of-order signals, and provider independence |
| Recovery | Request timeout, process exit/start-stop races, failed subscriptions, bounded unsubscribe/stop, and restart behavior |

Copilot hooks remain hosting-session scoped and ignore content arguments. Codex uses supported metadata-first listing (`useStateDbOnly`) and turns-excluded resume, discards content before returning records, and only accepts notifications for tracked IDs. Resume/subscription failures are not proof that the entire provider disconnected.

## 3. Validate locally and live only within consent

Run targeted checks, then `npm run check`. For a changed live protocol path, use the installed CLI only after the required provider/process opt-in. Do not create threads, start model turns, archive/close user sessions, or send task prompts to prove dashboard behavior. Avoid bulk-resuming private sessions simply to exercise scale; fixtures are appropriate for bulk tests.

Keep live output to counts, safe field names, versions, and generic outcomes. Never retain real titles, IDs, previews, transcript text, or raw protocol logs in test artifacts or issues. Unsubscribe and stop only the child processes created for this check; verify exit and remove temporary fixtures.

## 4. Record the supported scope

After each development slice, update both the [product plan](../../../PLAN.md) and [progress tracker](../../../docs/implementation-progress.md): align current implementation/gaps and next steps with the accepted ADR; record that ADR, methods/versions tested, commands/results, blockers, and untested failure/host paths. Preserve source-level privacy wording: dropping content in an adapter is not an end-to-end host/model-route no-logging or zero-egress guarantee. Use [canvas-development](../canvas-development/SKILL.md) for host reload, canvas actions, and reopen verification when wiring or UI changes.
