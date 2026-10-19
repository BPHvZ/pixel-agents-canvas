# Use rolling source-release drafts

Every merge to `main` updates one draft covering all pull requests since the last published release; the first draft is fixed at `v0.1.0`, and later batches default to patch with `release:minor` and `release:major` overrides. Drafts are published manually as pre-releases below `1.0.0` and provide tagged source snapshots only—not an installable canvas or marketplace release—because this repository has no distribution package.
