# Releasing

## What a release means

A GitHub release is a tagged source snapshot of this repository with generated notes. It does not package the canvas as a Copilot App installer or publish it to a marketplace. GitHub provides source archives for a published release; there are no separate binary assets. The separate Copilot App installation procedure is documented in the [README](../README.md): it imports the canvas from the repository folder on `main`, while a compatible Gist URL is an optional alternative with no project-maintained mirror. New imports from `main` may include merged changes before a source release is published. Publishing a source release does not automatically update an existing canvas; update behavior is unspecified.

The repository is not yet release-complete. A draft can be created before the product is ready, but do not publish it until the remaining gates in [implementation progress](implementation-progress.md) are clear.

## Draft lifecycle

Every merge to `main` updates one rolling GitHub Release draft. It contains the merged pull requests since the last published release, so multiple merges before publication are grouped into one release. The first draft is created as `v0.1.0` after the next merge and includes all previously unreleased pull requests.

After the first release is published, the next release batch defaults to a patch bump. Add one of these labels to a pull request before it merges to request a larger bump:

- `release:minor` — feature release
- `release:major` — breaking-change release

Generated notes use pull request titles and group changes into Breaking Changes, Features, and Other Changes, so use descriptive PR titles. Review the draft title, tag, and notes before publication. Published versions below `1.0.0` are marked as pre-releases; `1.0.0` and later are normal releases.

## Publishing

1. Open the repository’s [Releases page](https://github.com/BPHvZ/pixel-agents-canvas/releases).
2. Review the rolling draft, including the resolved version and generated notes.
3. When the release-readiness gates are satisfied, publish the draft. Publication makes the tagged source snapshot and GitHub-generated source archives available; it does not install or update a Copilot App canvas or publish it to a marketplace. The App's separate initial-install path is described in the [README](../README.md).

## Main-branch policy

Changes reach `main` through pull requests. The `Checks / check` job must pass on an up-to-date branch, and all review conversations must be resolved. Approvals are not required because the repository owner is the only account with write/admin access; the owner reviews and merges each PR. Public contributors can propose changes through fork PRs, but write access must remain owner-only to preserve owner-only merge authority.
