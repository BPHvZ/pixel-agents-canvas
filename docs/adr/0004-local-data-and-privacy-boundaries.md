# ADR 0004: Local data and privacy boundaries

- **Status:** Proposed
- **Date:** 2026-10-16

## Context

ADR 0002 establishes lifecycle metadata in memory as the initial default, excludes prompts/tool payloads, and disallows disk history. The user is open to more detailed information only if it stays on-device and is protected. That condition is necessary but not sufficient: consent, least privilege, exposure in the UI/logs, retention, deletion, and whether the Copilot App canvas can technically enforce local-only handling must also be addressed. Copilot hooks may expose sensitive prompt/tool fields; Codex app-server events may expose conversation content. Provider payloads must not be copied wholesale.

## Decision

- Preserve ADR 0002's metadata-only, in-memory behavior as the default. Do not capture prompts, full transcripts, tool inputs/results, file contents, or credentials by default.
- Treat detailed content as a possible future, separately opt-in capability—not an approved implementation requirement. Before offering it, verify local-only processing end to end (including logs, crash reports, telemetry, host APIs, and any bridge), define protection and retention/deletion controls, minimize collected fields, and obtain explicit, understandable consent.
- Never persist detailed content or provider payloads as part of the current product plan. Any future persistence requires a separate ADR and explicit user approval.
- If the host/runtime cannot demonstrate that detailed data remains on-device and protected, do not expose the detailed mode; remain metadata-only.
- For all modes, clear transient state on disable/close and avoid logging sensitive provider data. Diagnostics should contain only non-sensitive operational status.

## Consequences

- The current implementation remains within the smaller data footprint already accepted by ADR 0002.
- Richer explanations of activity are constrained until a privacy review and technical local-only validation pass.
- “On-device” must be an evidence-based property of the full host/extension/provider path, not a marketing assumption based only on launching a local process.
- This ADR does not grant permission to inspect unrelated local session history or attach to Codex threads not created/owned by the extension.

## Alternatives considered

1. **Capture detailed activity by default.** Rejected: it conflicts with data minimization and exposes private work unnecessarily.
2. **Allow detailed capture whenever a provider supplies it.** Rejected: availability is not consent, and it does not establish local-only handling or safe retention.
3. **Never support detailed information.** Deferred rather than selected: the user is open to protected on-device detail, but feasibility and safeguards have not yet been proven.

## Revisit when

The canvas host's data handling is verified, a concrete detailed-information use case is defined, and consent/protection/retention/deletion controls are specified and approved.
