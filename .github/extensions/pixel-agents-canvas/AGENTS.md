# Canvas extension development

Apply the [repository guide](../../../AGENTS.md) as well. This subtree is a project extension, not a VS Code extension package or a standalone agent controller.

## Runtime contract

- Keep `extension.mjs` as the host entry point and focused on SDK wiring. Put domain/protocol logic, rendering, browser behavior, storage, and tests in sibling modules/assets. Read existing interfaces before introducing a second abstraction.
- The host resolves `@github/copilot-sdk/extension`. Keep SDK dependencies and a package manifest out of this extension directory; development tooling belongs at the repository root. Verify SDK changes against the supported contract, not a host installation path or guessed internal API.
- Treat `src/copilot-sdk-contract.d.ts` as a type-only projection of the SDK surface we use. Expanding that declaration does not make a runtime capability exist; confirm the actual SDK contract before expanding it.
- Keep `src/types.d.ts` and checked JavaScript consistent. Browser behavior belongs in `src/office-client.js` so it participates in lint/type checks, rather than hiding executable code in HTML strings. Validate JSON/protocol/HTTP inputs before using them.

## Panels and local HTTP

- Bind servers to `127.0.0.1` on an ephemeral port; return the HTTP URL without credentials or private state in it. Serve only explicit routes/assets and validate methods and inputs. Browser code has no privileged host bridge: use same-origin HTTP or event streams.
- Treat `open` as idempotent per `instanceId`, reusing its server and presentation state. `instanceId` identifies a panel, not a durable session/agent record.
- Stop instance-owned listeners when the SDK signals instance closure. A hidden/dismissed view is not necessarily a closed instance; do not destroy it merely because a host hides the presentation. Clean up provider children, subscriptions, listeners, and timers during supported session shutdown; never stop unrelated processes.
- Return raw action results and use documented `CanvasError` codes for expected failures. Describe actions truthfully and validate their schemas/inputs. Keep diagnostics content-free and off stdout, which is the SDK protocol channel.

## State and user experience

- Follow [ADR 0002](../../../docs/adr/0002-activity-data-and-retention.md) and [ADR 0008](../../../docs/adr/0008-stateful-office-ambience.md) for the different lifetimes of provider activity, open-canvas fiction, and user-selected preferences. Persist only approved preferences, not session history or titles.
- Store private preferences in the SDK-documented extension storage, keyed by stable domain identity and workspace where appropriate. Honor the documented Copilot-home override. Use versioned/validated records and unique same-directory temporary files with atomic replacement; surface corrupt/unrecognized data without overwriting it. Multiple hosts/workspaces may run concurrently.
- Use semantic HTML, keyboard-operable controls, visible focus, readable factual state/freshness, reduced-motion behavior, and responsive layouts. Escape text at HTML insertion sites; validate non-text values such as CSS colors rather than treating escaping as validation.

## Verification

Follow [canvas-development](../../../.agents/skills/canvas-development/SKILL.md) for the edit/test/reload loop and [canvas-provider-validation](../../../.agents/skills/canvas-provider-validation/SKILL.md) for provider changes. A successful local renderer check is not evidence that a Copilot host loaded the current extension.
