# Pixel Agents Canvas

A pixel-art office canvas that reports privacy-preserving activity metadata from the Copilot session hosting the extension and, when explicitly enabled, threads created through the local Codex app-server.

## Install

In the GitHub Copilot App, open this repository as a project. The extension is discovered from `.github/extensions/pixel-agents-canvas/extension.mjs`. Reload extensions (or restart the app), then ask the agent to open the **Pixel Agents Office** canvas. The agent can also open it with the `pixel-agents-canvas` canvas ID.

## Use

- Copilot activity comes from SDK hooks for this hosting Copilot session only; it does not enumerate other sessions.
- Select **Enable local Codex** to start the local Codex CLI app-server. This is opt-in. Use **New Codex thread** to create an ephemeral empty thread; it does not begin a model turn. The canvas observes only threads created from this extension.
- Ask the agent to call `list_agents` for current connections. `enable_codex` and `start_codex_thread` are available as canvas actions.

## Provider limits and privacy

Codex requires a locally installed, authenticated Codex CLI. A ChatGPT subscription alone does not guarantee CLI access. Codex app-server is launched over local stdio; no auth files are read and no network listener is opened. The extension does not send a prompt or start a model turn. App-server support is based on the CLI protocol schema and may change between CLI versions.

Copilot hooks expose only events from the session hosting this extension. Hook content (prompts, tool arguments/results, and source content) is ignored. The roster retains only generic status labels in memory for the provider process lifetime; it is not persisted. Codex threads created elsewhere are deliberately not tracked.

The canvas uses the Copilot SDK extension API and serves its renderer over an ephemeral loopback HTTP port. Extensions/hooks must be enabled in the Copilot App for it to load.
