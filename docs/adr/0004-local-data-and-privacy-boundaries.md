# ADR 0004: Local data and privacy boundaries

- **Status:** Proposed
- **Date:** 2026-10-16

## Context

ADR 0002 establishes lifecycle metadata in memory as the initial default, excludes prompts/tool payloads, and disallows disk history. The user is open to more detailed information only if it stays on-device and is protected. That condition is necessary but not sufficient: consent, least privilege, exposure in the UI/logs, retention, deletion, and whether the Copilot App canvas can technically enforce local-only handling must also be addressed. Copilot hooks may expose sensitive prompt/tool fields; Codex app-server events may expose conversation content. Provider payloads must not be copied wholesale.

## Decision

- The product is local-first: no external transmission of session content, prompts, generated summaries, or activity timelines, including cloud summarization, content telemetry, or remote aggregation.
- Provider metadata is the default; no prompt, transcript, tool input/result, file content, or credential is displayed or retained.
- Prompt-based summarization is a separate explicit opt-in, off by default. It may be offered only if end-to-end on-device transient processing is demonstrable in each host, raw prompt text is discarded immediately, only the summary is shown, and nothing content-bearing is logged or persisted. Persist only the consent preference.
- Clear all activity state on disable/close. Diagnostics contain non-sensitive operational status only. If a host cannot meet the boundary, keep prompt summarization disabled there.
- The local Codex app-server process is an extension-managed provider adapter, not a separate companion app. It starts only after explicit provider enablement, uses local stdio, and stops with the extension; no arbitrary remote server or auth-file reads.

## Consequences

- The current implementation remains within the smaller data footprint already accepted by ADR 0002.
- Richer explanations of activity are constrained until a privacy review and technical local-only validation pass.
- “On-device” must be an evidence-based property of the full host/extension/provider path, not a marketing assumption based only on launching a local process.
- Codex thread discovery is governed by ADR 0001 and explicit provider opt-in; discovery may include existing threads only through the supported app-server API and must remain metadata-only unless prompt-summary consent is enabled.
- The canvas must not transmit session content to external services. If either host cannot enforce that for prompt summarization, the setting remains unavailable there.

## Alternatives considered

1. **Capture detailed activity by default.** Rejected: it conflicts with data minimization and exposes private work unnecessarily.
2. **Allow detailed capture whenever a provider supplies it.** Rejected: availability is not consent, and it does not establish local-only handling or safe retention.
3. **Never support detailed information.** Deferred rather than selected: the user is open to protected on-device detail, but feasibility and safeguards have not yet been proven.

## Revisit when

The canvas host's data handling is verified, a concrete detailed-information use case is defined, and consent/protection/retention/deletion controls are specified and approved.
