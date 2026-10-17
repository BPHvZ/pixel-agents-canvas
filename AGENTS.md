# Agent development guide

These repository instructions apply to any coding agent. More specific `AGENTS.md` files add guidance for their subtree. They require no particular editor, model, agent runner, or tool names.

## Start here

- Read [PLAN.md](PLAN.md) for approved scope, [GLOSSARY.md](GLOSSARY.md) for domain language, and [implementation progress](docs/implementation-progress.md) for verified work and remaining gates. Accepted design is not proof of implementation.
- Before changing a behavior, read its [ADR](docs/adr/): 0001/0007 for providers, 0002/0004 for privacy/retention, 0003 for host/product scope, 0005/0006/0008 for identity and office presentation. Update the relevant decision if the user approves a scope change; avoid parallel specifications.
- For canvas implementation or host lifecycle changes, follow [canvas-development](.agents/skills/canvas-development/SKILL.md). For discovery, provider events, privacy, or process recovery, follow [canvas-provider-validation](.agents/skills/canvas-provider-validation/SKILL.md). Read these files directly if your agent cannot discover skills.

## Product invariants

- This is a read-only dashboard of observed Copilot/Codex activity. Preserve provider identities and reported relationships; keep unknown, stale, unavailable, and confirmed-empty distinct.
- Host, activity-source harness, model route, and billing route are separate facts. Meaningful use must not require a paid Copilot subscription.
- Keep factual activity separate from labeled office fiction. Animation, dialogue, motifs, props, and local aliases must not invent provider work or alter factual state/feed entries. ADR 0008 owns the detailed rules.
- Use approved metadata only. Discard prompts, transcripts, tool payloads, Codex previews, paths, and credentials. Provider titles can still contain sensitive text. Prompt summarization is outside V1; adapter minimization is not a host-wide zero-egress claim.

## Engineering and verification

- Use concrete custom types for domain states/events. Accept external data as `unknown`, validate it, then narrow it. Explicit/implicit `any`, wildcard types, unsafe casts used to bypass validation, and disabling checks are not solutions.
- Keep runtime-compatible ES modules; root dependencies are development tooling. Follow the [extension-specific guide](.github/extensions/pixel-agents-canvas/AGENTS.md) for SDK, browser, server, and storage changes.
- Add behavior tests at public module interfaces; inject external process/time dependencies. For a bug, establish the failing behavior before fixing it. Keep synthetic activity confined to fixtures, never as a product fallback.
- Use the smallest existing relevant check while iterating. Before delivering code, run `npm run check` from the repository root (lint, strict typecheck, tests); see [README development checks](README.md#development-checks) and [package scripts](package.json). Install declared dependencies with `npm ci` only when needed. Documentation-only work needs link/frontmatter validation; run documentation tests if introduced.
- SDK declarations and unit/browser fixtures do not prove real host support. Report unperformed reload/open/action/reopen checks and other limitations explicitly.
- Update directly affected documentation and the progress tracker with commands/results. Mark a checkbox complete only with its evidence, not merely because code exists. Report partial work as partial.

## Workspace discipline

- Stay in the current worktree. Use the user-requested branch here; if another worktree holds it, resolve that with the user rather than silently moving work there. Preserve unrelated user files, local skills, and uncommitted changes.
- Keep commits scoped to the requested branch and purpose; commit/push/merge only when authorized. Never commit credentials, private logs, captured session content, or personal machine configuration.
- When delegating, give a bounded objective and preserve the user's chosen model/provider route. Do not select fallback models or alter account/global settings without authorization; unavailable tooling must be reported rather than worked around silently.
