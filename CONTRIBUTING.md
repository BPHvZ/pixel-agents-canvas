# Contributing

Thanks for helping improve Pixel Agents Office. The project is a read-only dashboard of observed Copilot and Codex activity; contributions must preserve provider identities and reported relationships, and keep observed facts separate from clearly labeled office fiction.

## Before opening a change

- Check [PLAN.md](PLAN.md), [implementation progress](docs/implementation-progress.md), and the relevant accepted decision in [docs/adr/](docs/adr/). Every feature or work item needs an accepted ADR that covers it. If none does, propose/update an ADR and obtain approval before implementation.
- Keep data minimization and privacy boundaries intact: never collect or store prompts, transcripts, tool payloads, local paths, credentials, or Codex previews. Use only approved metadata. Treat provider titles as potentially sensitive and redact them in examples.
- Prefer focused changes with tests at the public module interface. New external inputs should be validated and narrowed from `unknown`; do not bypass type checks.

## Local development

The project requires Node.js `^22.13.0` or `>=24` (see `package.json`). From the repository root:

```sh
npm ci
npm run check
```

`npm run check` runs lint, strict TypeScript checking, and tests. For browser-facing changes, also run the relevant browser checks and manually inspect the renderer at a narrow viewport and with keyboard navigation. The local scenario gallery under `dev/office-demo/` is for development only; do not use its fixtures as product fallback behavior or include demo-only files in release artifacts.

## Pull requests

Open ordinary contributor PRs against `develop`, not `main`. Both protected branches require a pull request, the strict `Checks / check` job to pass, and resolved review conversations; approvals are not required. Admins are subject to the same rules. Keep the PR focused, describe user-visible behavior and privacy implications, link related issues, and report checks run and any limitations. Use the default PR template. Apply existing labels when relevant. `release:minor` and `release:major` are for the deliberate release-promotion PR from `develop` to `main`, not ordinary feature PRs; see [docs/releasing.md](docs/releasing.md) for the release process.

Do not include real prompts, transcripts, tool output, credentials, local filesystem paths, or unredacted screenshots/logs in issues, PRs, commits, or test fixtures. Redact or synthesize examples before sharing.
