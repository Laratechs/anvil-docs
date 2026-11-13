# Releases and upgrades

How Anvil is versioned, and what to do when you move a server to a new
release.

## Releases

A release is a git tag `vMAJOR.MINOR.PATCH` on `main` with an entry in
[CHANGELOG.md](../CHANGELOG.md) that lists breaking catalog changes explicitly.
Until v1.0.0 a minor version may break, as semver allows for v0.x; patch
versions don't.

`anvil version` reports the tag for a binary built from it, whether by
`go install github.com/Laratechs/anvil/cmd/anvil@v0.1.0`, `make build`, or
`go build` in a clean checkout of the tag. Any other build is a **development
build**, with a version that isn't a bare tag: `dev`, a `git describe` such as
`v0.1.0-3-gabc1234` or `v0.1.0-dirty`, or a Go pseudo-version such as
`v0.1.1-0.20261106120000-abcdef123456`. A development build counts as newer
than every release: a catalog's `requires_anvil` constraint isn't checked
against it, so run a release to test a catalog's constraint.

### Cutting a release

Move the changelog's `Unreleased` entries under the new version, then tag the
commit that lands it:

```
git tag -a v0.2.0 -m "anvil v0.2.0"
git push origin v0.2.0
```

`TestUpgrade` upgrades from the latest `v*` tag behind `HEAD`, so every release
becomes the next one's baseline.

## Upgrading a server

1. **Read the [changelog](../CHANGELOG.md)** entries between your release and
   the new one. **Breaking catalog changes** are what your catalog must adapt
   to; **Breaking changes** are what the CLI, API or server configuration did.
2. **Check your catalog.** If its `requires_anvil` is set, it must allow the new
   release.
3. **Start the new server.** It refuses to start rather than run with a
   configuration or catalog it can't honor, and names what to change: a removed
   environment variable and the setting that replaced it, an attribute the
   catalog no longer declares, or a version constraint that rules it out.
4. **Existing services converge at their next apply.** They don't change on
   their own. Each converges on the new release at its next apply, when its
   request is repeated. A service last applied with another catalog revision
   re-applies at the same generation
   ([How Anvil works](how-it-works.md#idempotency)).

`TestUpgrade` in the [validation harness](../e2e/README.md) checks that this
converges with nothing to add, change or destroy.

## Older releases

What changed in configuration and data across releases, for a server that
upgrades from one of them.

### Removed configuration

The MVP's `ANVIL_REGISTRY`, `ANVIL_REPO_VISIBILITY` and `ANVIL_AWS_*`
variables are no longer read. The server refuses to start while one is set, and
names the setting that replaces it:

| Removed | Replacement |
| --- | --- |
| `ANVIL_REGISTRY` | `registry` in `settings "service"` |
| `ANVIL_AWS_PARENT_ID` | `parent_id` of an `aws` binding |
| `ANVIL_AWS_REGION` | `region` of an `aws` binding |

The error names the replacement for every removed variable; these are the
common ones. Some variables are simply ignored:

- `ANVIL_GCP_FOLDER_ID`, `ANVIL_GCP_ORG_ID`, `ANVIL_GCP_BILLING_ACCOUNT` and
  `ANVIL_GCP_APIS` configured a GCP project per service, which Anvil no longer
  creates. They are ignored with a warning.
- `ANVIL_GCP_MEMBER_TEMPLATE`, `ANVIL_GCP_ROLES`, `ANVIL_AWS_GROUP_TEMPLATE`
  and `ANVIL_AWS_PERMISSION_SET_ARNS` went with team access, and are ignored.

The [changelog](../CHANGELOG.md) has the rest.

### The built-in catalog

Anvil no longer builds a catalog in. `source = "builtin"` is refused, and the
same catalog is
`git::https://github.com/Laratechs/anvil-catalog.git?ref=v0.3.0`. A service
last applied by a release that still built one in keeps a `builtin-<hash>`
catalog revision until its next apply.

### Settings that moved to bindings

Earlier releases took where Cloud Run services land (`project_id`, `region`,
`workload_identity_provider`) from `settings "cloud_gcp"`. They are a gcp
binding now.

Keep the values in settings for the first start of the new release. The server
migrates existing gcp deployments onto a binding named `gcp` made from them
(revision 1, with no Terraform changes) and offers the gcp deployment with it.
It then logs a warning naming the file and line, asking you to remove the
attributes, which it ignores from then on. With no existing gcp deployments it
makes no binding, and the warning gives the `anvil binding create` command that
holds the same values instead.

### Deployments created before bindings

Deployments created before they recorded a binding are migrated when the server
starts. For each deployment definition with a `binding { }` block:

- the values it declares are taken from the server's settings for that
  definition (`settings "cloud_gcp"`, as configured);
- they are stored as the binding named after the provider (`gcp`) at revision
  1, and recorded by every such deployment;
- nothing is re-applied, and the deployments render as before.

A second start changes nothing, and a provider with no such deployments gets no
binding. The migration never picks one of the operator's other bindings.

If the settings are missing, aren't a valid binding, or a binding with the
provider's name already says something else, the server still starts. It logs
each deployment it left unbound with the reason, and those deployments' applies
(including archive and force delete) fail until you fix the settings and
restart the server.
