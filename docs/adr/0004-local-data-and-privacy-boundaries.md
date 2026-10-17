# ADR 0004: Local data and privacy boundaries

- **Status:** Accepted
- **Date:** 2026-10-17

## Context

ADR 0002 establishes lifecycle metadata in memory as the initial default, excludes prompts/tool payloads, and disallows disk history. The user is open to more detailed information only if it stays on-device and is protected. That condition is necessary but not sufficient: consent, least privilege, exposure in the UI/logs, retention, deletion, and whether the Copilot App canvas can technically enforce local-only handling must also be addressed. Copilot hooks may expose sensitive prompt/tool fields; Codex app-server events may expose conversation content. Provider payloads must not be copied wholesale. Phase 0 source review confirmed the adapter ignores Copilot hook payloads and selects limited Codex fields, but did not audit host/provider/proxy telemetry or logging end to end.

## Decision

- The dashboard adapter follows source-level data minimization: provider metadata is the default; no prompt, transcript, tool input/result, file content, or credential is displayed or intentionally retained by the adapter.
- This is **not** a host-wide zero-egress or no-logging guarantee. Copilot CLI hooks may receive prompt, tool input/result, and response fields; the inspected callbacks ignore those values and store generic status labels, but host/runtime/model-route telemetry and logging have not been audited end to end. Document this limitation wherever privacy boundaries are described.
- Prompt-based summarization is out of scope for V1 unless end-to-end host/runtime/model-route evidence proves transient on-device processing, immediate raw-text discard, summary-only display, and no content-bearing logs. Do not persist a prompt-summary consent setting unless the feature is later approved and implemented.
- Clear all adapter-owned activity state on disable/close. Diagnostics contain non-sensitive operational status only. If a host cannot meet the boundary, keep prompt summarization disabled there.
- The local Codex app-server process is an extension-managed provider adapter, not a separate companion app. It starts only after explicit provider enablement, uses local stdio, and stops with the extension; no arbitrary remote server or auth-file reads.

## Consequences

- The current implementation remains within the smaller data footprint already accepted by ADR 0002.
- Richer explanations of activity are constrained until a privacy review and technical local-only validation pass; prompt summaries remain unavailable in V1 unless the specified end-to-end audit passes.
- “On-device” must be an evidence-based property of the full host/extension/provider path, not a marketing assumption based only on launching a local process.
- Codex thread discovery is governed by ADR 0001 and explicit provider opt-in; discovery may include existing threads only through the supported app-server API and must remain metadata-only. Prompt summaries are out of scope for V1 unless a later end-to-end audit and approval meets the conditions above.
- The adapter does not intentionally expose or retain prompt/tool content in its own dashboard data flow. This does not constrain host or selected model-route processing; if local-only handling cannot be demonstrated for prompt summarization, the setting remains unavailable.

## Alternatives considered

1. **Capture detailed activity by default.** Rejected: it conflicts with data minimization and exposes private work unnecessarily.
2. **Allow detailed capture whenever a provider supplies it.** Rejected: availability is not consent, and it does not establish local-only handling or safe retention.
3. **Never support detailed information.** Deferred rather than selected: the user is open to protected on-device detail, but feasibility and safeguards have not yet been proven.

## Revisit when

The canvas host's data handling is verified, a concrete detailed-information use case is defined, and consent/protection/retention/deletion controls are specified and approved.
