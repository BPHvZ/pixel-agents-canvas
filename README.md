# Pixel Agents Canvas

A pixel-art office canvas for activity from the Copilot session hosting the extension and, after explicit opt-in, existing Codex CLI threads discovered through the local app-server.

## Install

In the GitHub Copilot App, open this repository as a project. The extension is discovered from `.github/extensions/pixel-agents-canvas/extension.mjs`. Reload extensions (or restart the app), then ask the agent to open the **Pixel Agents Office** canvas. The agent can also open it with the `pixel-agents-canvas` canvas ID.

## Use

- Copilot activity comes from SDK hooks for this hosting Copilot session only; it does not enumerate other sessions.
- Select **Enable local Codex** to start the local Codex CLI app-server. This is opt-in. The adapter paginates existing thread metadata from `thread/list`, including archived records; active threads are resumed with `excludeTurns: true` for status notifications. The extension never creates a thread or starts a model turn.
- Ask the agent to call `list_agents` for provider connections and discovered sessions. `enable_codex` starts the opt-in local source.

## Provider limits and privacy

Codex requires a locally installed, authenticated Codex CLI. A ChatGPT subscription alone does not guarantee CLI access. Codex app-server is launched over local stdio; no auth files are read and no network listener is opened. The adapter field-selects metadata and discards `preview`, transcript turns, file paths, and unapproved payload fields. Protocol details can change across CLI versions.

Copilot hooks expose only events from the session hosting this extension. Hook content (prompts, tool arguments/results, and source content) is ignored. Activity and office state are in-memory, not persisted as history. Provider titles may contain sensitive user text and should be treated accordingly. This source-level data-minimization claim does not guarantee that the host, model route, or provider never logs or transmits session content.

The canvas uses the Copilot SDK extension API and serves its renderer over an ephemeral loopback HTTP port. Extensions/hooks must be enabled in the Copilot App for it to load.

## Development checks

Use Node.js 24 (CI) or a compatible version listed in `package.json`:

```bash
npm ci
npm run check
```

`npm run lint` runs ESLint with zero warnings allowed. It rejects explicit `any` in TypeScript declarations and JSDoc, including nested arrays/generics and wildcard types, and rejects unsafe inferred values in application code. `npm run typecheck` checks application JavaScript and declarations in TypeScript strict mode with implicit `any` and unchecked indexing disallowed. Inputs from JSON/protocols use `unknown` and runtime validation. `npm test` includes negative regression tests for this policy. The same checks run on pushes to `develop` and pull requests.

Tooling dependencies live at the repository root; the project extension has no package manifest or installed SDK dependency. The host injects the SDK at runtime; the small local SDK declaration describes only the surface used here and does not replace host/runtime verification. The browser module is checked too, rather than hidden inside an HTML string.

The implementation is not release-complete. Provider recovery, full agent/session clustering, the accepted office-ambience UI, and fresh host reload verification remain tracked in [implementation progress](docs/implementation-progress.md).
