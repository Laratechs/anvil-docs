# Releases and upgrades

## Releases

A release is a git tag `vMAJOR.MINOR.PATCH` on `main` with an entry in
[CHANGELOG.md](../CHANGELOG.md) that lists breaking catalog changes
explicitly. Until v1.0.0 a minor version may break, as semver allows for
v0.x; patch versions don't.

`anvil version` reports the tag for a binary built from it, whether by
`go install github.com/Laratechs/anvil/cmd/anvil@v0.1.0`, `make build`, or
`go build` in a clean checkout of the tag. Any other build is a
**development build** with a version that isn't a bare tag: `dev`, a
`git describe` such as `v0.1.0-3-gabc1234` or `v0.1.0-dirty`, or a Go
pseudo-version such as `v0.1.1-0.20261106120000-abcdef123456`.
A development build counts as newer than every release: a catalog's
`requires_anvil` constraint isn't checked against it, so run a release to
test a catalog's constraint.

To release, move the changelog's `Unreleased` entries under the new
version, then on the commit that lands it:

```
git tag -a v0.2.0 -m "anvil v0.2.0"
git push origin v0.2.0
```

`TestUpgrade` upgrades from the latest `v*` tag behind `HEAD`, so every
release becomes the next one's baseline.

## Upgrading

Read the [changelog](../CHANGELOG.md) entries between your release and the
new one first. **Breaking catalog changes** are what your catalog must
adapt to, and **Breaking changes** are what the CLI, API or server
configuration did. Check that your catalog's `requires_anvil`, if it sets
one, allows the new release.

The server refuses to start rather than run with a configuration or
catalog it can't honor, and names what to change: a removed environment
variable and the setting that replaced it, an attribute the catalog no
longer declares, or a version constraint that rules it out.

Existing services don't change on their own. Each converges on the new
release at its next apply, when its request is repeated; a service last
applied with another catalog revision re-applies at the same generation
([How Anvil works](how-it-works.md#idempotency)). `TestUpgrade` in the
[validation harness](../e2e/README.md) checks that this applies with
nothing to add, change or destroy.

