# Releasing

## What a release means

A GitHub release is a tagged source snapshot of this repository with generated notes. It does not package the canvas as a Copilot App installer or publish it to a marketplace. GitHub provides source archives for a published release; there are no separate binary assets. The local-only demo under `dev/office-demo/` and its demo-specific test are excluded from those archives by `.gitattributes` while remaining in the repository for development. The separate Copilot App installation procedure is documented in the [README](../README.md): it imports the canvas from the repository folder on `main`, while a compatible Gist URL is an optional alternative with no project-maintained mirror. New imports from `main` may include merged changes before a source release is published. Publishing a source release does not automatically update an existing canvas; update behavior is unspecified.

The repository is not yet release-complete. A draft can be created before the product is ready, but do not publish it until the remaining gates in [implementation progress](implementation-progress.md) are clear.

## Branch and promotion model

This repository uses a small, GitFlow-inspired two-branch promotion model, not full GitFlow. There are no permanent feature, release, or hotfix branches:

- Ordinary feature, fix, and documentation pull requests target `develop`.
- When a set of changes is ready for the source-release snapshot, open one promotion PR from `develop` to `main`. Use the [release promotion PR template](../.github/PULL_REQUEST_TEMPLATE/release.md) to prepare concise user-facing notes for the maintainer to curate into the release draft.
- `main` is the canonical source snapshot/import branch. Do not target it with ordinary change PRs. Merging a promotion PR does not publish a release.
- After the promotion merges, create a sync branch from the current `develop`, merge `main` into that branch, then open a PR from the sync branch to `develop`. Merge that PR with a merge commit. Starting from current `develop` keeps the sync PR eligible for the strict up-to-date check; merging `main` into the branch and preserving the PR's merge commit carries both histories and the promotion merge into `develop`, so the next promotion can merge cleanly. The sync PR targets `develop`, so it does not trigger the main-only Release Drafter workflow.

Both `develop` and `main` are protected: changes require a pull request, the `check` GitHub Actions check-run on an up-to-date branch, resolved conversations, and admin enforcement; zero approvals are required. Force pushes and branch deletion are disabled. Protection settings are GitHub repository settings, not enforced by the workflow files in this repository.

## Draft lifecycle

Only pushes to `main` update the one rolling GitHub Release draft. A promotion merge therefore captures the batch chosen for `main`; multiple promotion merges before publication are accumulated into the same draft. Release Drafter generates entries from PR titles, numbers, and authors, grouped by the existing version labels; it does not use PR bodies. After each workflow run, the maintainer reviews the draft and manually curates/copies concise user-facing release notes into it, excluding process checklists and internal evidence. The first promotion created the `v0.1.0` draft, which is tagged `v0.1.0`, has `prerelease=true`, targets `main`, was manually curated, and remains unpublished. Publication is a separate action gated on release readiness. The current `main` workflow still has the older `$BODY` change-template; this title-only configuration takes effect after a future `develop`→`main` promotion includes it.

After the first release is published, the next release batch defaults to a patch bump. Put one of these existing labels on the **promotion PR** before it merges to request a larger bump:

- `release:minor` — feature release
- `release:major` — breaking-change release

The labels on feature PRs merged to `develop` do not choose the version of a later promotion. Review the draft title, tag, and notes before publication. Published versions below `1.0.0` are marked as pre-releases; `1.0.0` and later are normal releases.

## Publishing

1. Open the repository’s [Releases page](https://github.com/BPHvZ/pixel-agents-canvas/releases).
2. Review the rolling draft, including the resolved version and generated notes.
3. When the release-readiness gates are satisfied, publish the reviewed draft manually. Publication makes the tagged source snapshot and GitHub-generated source archives available; it does not install or update a Copilot App canvas or publish it to a marketplace. The App's separate initial-install path is described in the [README](../README.md).

## Branch protection policy

Both protected branches accept changes only through pull requests with the `check` GitHub Actions check-run passing on an up-to-date branch and all review conversations resolved. No approvals are required. Admin enforcement is enabled, and force pushes and branch deletion are disabled. Repository access and protection rules are managed in GitHub settings; verify those settings there rather than treating this document or the workflow as enforcement.
