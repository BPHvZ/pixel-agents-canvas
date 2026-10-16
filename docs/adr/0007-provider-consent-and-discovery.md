# ADR 0007: Provider consent and session discovery

- **Status:** Proposed
- **Date:** 2026-10-16

## Context

The existing Codex adapter starts `codex app-server` but creates an ephemeral thread and accepts activity only for thread IDs in its `ownedThreads` set. The product requirement is broader: discover existing sessions where supported, without a separate companion app or undocumented scraping. OpenAI's app-server protocol documents `thread/list`; VS Code's Canvases documentation establishes that canvases are supported in the editor/Agents window and in the Copilot App, but does not establish broad Copilot conversation enumeration from an extension.

## Decision

Provider integrations are independently enabled. Codex discovery may launch an extension-managed local stdio app-server only after explicit user enablement; the process is not a separate companion app, reads no auth/config files, and stops with the extension. Validate that `thread/list` plus notifications can provide metadata-only discovery and reported parent/subagent relationships for existing threads. Copilot support may ship as hosting-conversation-only when that is the supported scope; do not use undocumented enumeration. Report per-provider scope and actual capability, distinguishing unsupported, unavailable, confirmed empty, stale, and disconnected states. Read-only open/focus navigation is allowed only through documented host/provider actions.

## Consequences

- Codex may offer wider session discovery than Copilot; the product promises truthful coverage, not parity.
- Enabling Codex starts a local process and therefore requires clear consent, diagnostics, and deterministic cleanup.
- The Codex discovery gate must verify supported CLI versions, archive/terminal handling, process lifecycle in both canvas hosts, and absence of transcript reads in metadata-only mode.
- VS Code and Copilot App share one product goal, but may require different packaging if one artifact/runtime contract is not supported in both.

## Alternatives considered

1. **Observe only extension-created threads.** Rejected as insufficiently useful for the requested session dashboard if supported discovery is feasible.
2. **Scrape UI, history files, or undocumented APIs.** Rejected as brittle, privacy-invasive, and unsupported.
3. **Require identical provider coverage across hosts before release.** Rejected because actual host APIs differ; known limits should be disclosed rather than hidden or compensated with fake activity.
