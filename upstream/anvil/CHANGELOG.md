# Changelog

Releases are git tags `vMAJOR.MINOR.PATCH` ([Releases and upgrades](docs/releases.md)).
Until v1.0.0 a minor version may break, as semver allows for v0.x.

Each entry lists **Breaking catalog changes** explicitly: changes a catalog
(its `catalog.hcl`, definitions, modules or the values Anvil passes them)
must adapt to, or that change what an existing service's Terraform plans.
Other breaking changes, to the CLI, API or server configuration, are
listed under **Breaking changes**.

## Unreleased

### Breaking catalog changes

- **Catalog contract 2 replaces contract 1,** which Anvil no longer
  reads. Where a service runs is declared with
  `deployment "<name>" { type = ... }` in place of `cloud "<provider>"`;
  `type` is required and is `"platform-managed"` or `"self-managed"`. The
  service reads `children.deployment`, whose entries have `name` and
  `type` where `children.cloud`'s had `provider`. Two deployments may now
  declare the same Terraform provider. To move a catalog, set
  `contract = 2`, rename the blocks keeping their labels, add a `type`
  and rename the reference; generated addresses don't change, so
  existing services re-apply with nothing to change
  ([Moving from contract 1](docs/catalog-contract.md#moving-from-contract-1))
  (#37).
- A Terraform `provider "<name>"` may be declared by only one definition
  (and once in it). Previously a second declaration silently replaced the
  first's configuration; now the catalog fails to load, naming both files.
  Declare each provider in one definition (#21).
- A cloud's provider label must match `^[a-z][a-z0-9]{0,19}$`, the pattern
  the API accepts for a provider, so every cloud that loads can be
  requested. Labels such as `my_cloud`, or longer than 20 characters, no
  longer load (#21).
- A definition's `status { }` may only set the keys Anvil declares (a
  service: `repository_url`, `ci_commit`, `image`; a cloud: `provider`,
  `kind`, `id`, `url`, `public`, `console_url`). Any other key used to be
  ignored; now the catalog fails to load, naming the key (#23).
- `lifecycle { archive_targets }` is only for the service. On a cloud it
  used to be accepted and ignored (clouds aren't archived on their own);
  now the catalog fails to load (#25).
- `lifecycle { keep_on_delete }` is renamed `destroy_on_delete`: it lists
  the addresses a force delete destroys (they stay in state for the
  teardown; everything else is forgotten), which the old name said the
  opposite of. Behavior is unchanged. A catalog still using
  `keep_on_delete` fails to load, with an error naming the new attribute;
  rename it (#24).
- A cloud's provider `config` may only use `anvil.*` and `binding.*`, so
  one binding revision always configures the provider the same way. A
  cloud whose provider config reads `settings.*` (or `options.*` or a
  component) no longer loads; move the value into the cloud's
  `binding { }` block and read it as `binding.<x>`. The service's provider
  config is unchanged. The built-in aws cloud did this: its `region` moved
  from settings to its binding block (see Breaking changes).
- The built-in gcp and aws clouds declare `binding { }` blocks and read
  where they land as `binding.*` (#20): the gcp cloud's `project_id`,
  `region` and `workload_identity_provider`, and all of the aws cloud's
  former settings. Their component inputs read `var.binding.<key>` instead
  of `var.settings.<key>`, with the same values; component names and
  module addresses are unchanged, so no resource changes. The gcp cloud's
  `google` provider now gets `project` and `region` from the binding. The
  gcp cloud keeps `public` as a setting; the aws cloud has no settings.
- Every generated root module declares `variable "binding"`, and
  `terraform.tfvars.json` carries a `binding` object (each binding-needing
  cloud's binding by definition key). It changes no resource (#17).
- Each element of `children.cloud` (the generated `local.children_cloud`)
  has a `binding` attribute next to `provider` and `exports`: the binding
  revision the cloud uses, as `{ name, revision }`, or `null` for a cloud
  whose definition takes no binding. A service definition that only reads
  `exports` is unaffected, and it changes no resource (#18).

### Breaking changes

- **`anvil cloud` and `anvil project` are removed,** with
  `-cloud` on `anvil service create`. Use `anvil service deploy NAME` and
  `anvil service create -deploy NAME`; `-type` chooses the type, and
  `-deployment=<name>` a deployment by name on a server that offers
  several of a type. `anvil cloud get` has no replacement:
  `anvil service get` shows the deployment (#38).
- **A service has one deployment.** A request for a second, or for
  another type, is a `409`. Services that already have two keep them.
- **API:** `POST /v1/services/{name}/deployment` replaces
  `POST /v1/services/{name}/clouds`, and takes `type` and `deployment`
  where that took `provider`. `POST /v1/services` takes `type` and
  `deployment` where it took `cloud`. `GET
  /v1/services/{name}/clouds/{provider}` and the deprecated
  `POST /v1/services/{name}/projects` are removed. Field errors name
  `deployment` where they named `cloud` (#38).
- Anvil no longer builds a catalog in (#11). Its content moved, with its
  history, to [Laratechs/anvil-catalog](https://github.com/Laratechs/anvil-catalog);
  tag `v0.1.0` is the catalog this release used to build in, unchanged.
  `catalog { source }` (`ANVIL_CATALOG`) is now required, and the server
  refuses to start without it or with `source = "builtin"`, saying what to
  set. Upgrade by setting it before starting the new release:

  ```hcl
  catalog {
    source = "git::https://github.com/Laratechs/anvil-catalog.git?ref=v0.1.0"
  }
  ```

  Existing services converge with no Terraform changes (the same modules
  at the same addresses; `TestUpgrade` checks it). Their
  `status.catalog_revision` changes from `builtin-<hash>` to the commit
  at their next apply. The catalog repository is public, so the server
  fetches it with no credentials; it needs git on its `PATH`. A dev
  server needs a checkout: `ANVIL_CATALOG=../anvil-catalog anvil server`.
  `anvil catalog render` needs `-catalog` too.
- The catalog's content tests (every cloud combination through terraform
  validate and an apply with mock providers) moved to the catalog
  repository as `tests/run.sh`, which renders with `anvil catalog render`.
  Anvil's CI runs it against the catalog tag servers run, and nightly
  against the catalog's `main`. `ANVIL_TEST_CATALOG` and
  `TestCatalogAppliesWithMocks` are gone.
- Where the built-in clouds land is a cloud binding now, not settings
  (#20). A cloud is offered only while a valid binding for its provider
  exists, and its definition has no `enabled_when` any more:

  | Cloud | Binding (required in bold) | Settings |
  | --- | --- | --- |
  | gcp | **`project_id`**, `region` (`us-central1`), **`workload_identity_provider`** | `public` |
  | aws | **`email_template`**, `parent_id` (`""`), `portal_url`, `region` (`us-east-1`) | none |

  To upgrade, start the server with your settings unchanged: it migrates
  existing clouds onto a binding made from them (#19, below), then warns
  asking you to remove them from `settings "cloud_gcp"` /
  `settings "cloud_aws"`. With no existing clouds of a provider it makes
  no binding; the warning then gives the exact `anvil binding create`
  command, values included, and the cloud isn't offered until a binding
  exists. An aws binding made with only `region` (since #17)
  becomes invalid, as `email_template` is required: add it with
  `anvil binding update -set email_template=... NAME`. With the same
  values, existing services re-apply with no Terraform changes.
- A setting attribute the catalog doesn't declare stops the server from
  starting, naming the definition and attribute, and the file and line when
  it comes from a `settings` block (or `ANVIL_SETTINGS` and its path).
  Before, it was silently dropped, so a setting the catalog renamed lost the
  operator's value. A server configuration with stale settings must remove
  or rename them; the error lists the settings the definition declares.
  One exception: an attribute the definition's `binding { }` block
  declares instead moved to bindings, so the server still starts (the
  binding is created through it), ignores the value and logs a warning
  with the file and line asking to remove it, and, while no valid binding
  for the provider exists, the `anvil binding create` command holding the
  values (#20, #19).
- The MVP's settings variables are removed. The server refuses to start
  while one is set, naming its replacement, so no value is silently lost.
  Set each in the configuration file's `settings` block (or
  `ANVIL_SETTINGS`), or in a cloud binding, instead:

  | Removed variable | Replacement |
  | --- | --- |
  | `ANVIL_REGISTRY` | `settings "service" { registry = ... }` |
  | `ANVIL_REPO_VISIBILITY` | `settings "service" { visibility = ... }` |
  | `ANVIL_AWS_REGION` | `region` of an aws binding (`anvil binding create -provider=aws -set region=...`) |
  | `ANVIL_AWS_PARENT_ID` | `parent_id` of an aws binding |
  | `ANVIL_AWS_EMAIL_TEMPLATE` | `email_template` of an aws binding |
  | `ANVIL_AWS_PORTAL_URL` | `portal_url` of an aws binding |
- API: service bodies no longer have the MVP's deprecated top-level
  `repository_url`, `image`, `gcp_project` and `aws_account`. Read
  `status.repository_url`, `status.image` and `status.clouds` (one entry
  per cloud, with its `provider`) instead. The CLI already read only
  `status`, so v0.1.0's CLI works against this server.
- Archiving a service (`anvil service delete` without `-force`, or
  `DELETE /v1/services/{name}` without `force=true`) now tears down its
  clouds' resources to save cost: the same `destroy_on_delete` set a force
  delete destroys (for Cloud Run, the Cloud Run service, its image
  repository with its images, and its service accounts), before archiving
  the repository. Before, clouds kept running. The service and its clouds
  stay on record, with no cloud in `status.clouds` while archived;
  restoring (`anvil service create`) runs a full apply that recreates
  them, so a restored Cloud Run service has a new image repository and
  serves the placeholder until CI deploys again. An archive is now
  refused (`409`), like a force delete, while the service has a cloud
  whose definition has no `destroy_on_delete` (the AWS account). A
  service archived by an earlier release is torn down the next time it is
  re-applied (archiving it again after an upgrade); one with an AWS
  account keeps it, with a warning (#26).

### What's in it

- **Self-managed GCP projects.** Catalog v0.3.0 has `gcpproject`:
  `anvil service deploy -type=self-managed NAME` gives a service a GCP
  project of its own, in the folder a `gcpproject` binding names, with an
  image repository and a CI identity, and sets the CI variables so the
  template's new `push` job publishes each merge's image there. Delivery
  is the team's: nothing deploys it
  ([Self-managed projects](docs/gcp-setup.md#self-managed-projects)).
  Examples and CI now pin catalog `v0.3.0`, which needs this release
  (#41).
- **Deleting a service's own cloud.** `anvil service delete -force`
  deletes a self-managed deployment's cloud with everything in it, and
  says so before asking for the service name. Archiving such a service
  is refused, as an archive would delete the cloud and a restore couldn't
  bring its contents back. Service bodies give each deployment's `type`
  in `status.clouds` (#41).
- **`anvil service migrate NAME`** moves a service's deployment to the
  latest revision of its binding and applies it, which is how a change
  to where deployments land reaches a running service. It names the
  values that change and the deployment's stateful resources, and asks
  for the service name. `anvil service list` has a `BINDING` column that
  marks services behind their binding, `anvil service get` says so too,
  and service bodies list them under `binding_updates`
  (`POST /v1/services/{name}/migrate`). Ordinary requests still never
  move a deployment (#39, #40).
- **Deployments.** Where a service runs is its deployment, which is
  platform-managed (on the shared infrastructure the platform team runs)
  or self-managed (a cloud of the service's own). `anvil service deploy`
  gives an existing service one, platform-managed unless `-type` says
  otherwise, and `anvil service create -deploy` does it at creation. A
  service has one deployment and its type can't change; a service
  without one can get either later. `anvil service get` shows the
  deployment's options and binding (#36, #37, #38).
- The documentation is published at
  <https://laratechs.github.io/anvil-docs/>, from this repository's docs
  which every push to `main` that changes docs updates (the
  `publish-docs` workflow, with a deploy key on `anvil-docs`; see the
  README's "Publishing the docs"). The README is now a short entry
  point: what was in it is one file per page under `docs/` (how Anvil
  works, the CLI, the API, running the server, releases and upgrades,
  decisions and limitations), Cloud Run is split into
  [what a service gets](docs/gcp.md) and the operators'
  [setup](docs/gcp-setup.md), and [docs/testing.md](docs/testing.md)
  explains how Anvil is tested. `go test ./...` checks the docs' links and
  refuses internal hosts and names in them, and CI builds the site from
  every change's docs.
- The catalog contract v1 is published as
  [docs/catalog-contract.md](docs/catalog-contract.md): what a catalog
  may declare and rely on, as implemented, and its known limitations
  (#34). `CONTEXT.md` defines a cloud binding (where a provider's clouds
  land) and narrows a setting to how something is deployed, and
  `anvil binding` help no longer describes a binding in GCP terms, nor
  the deprecated `anvil project create -cloud` help a provider as
  "gcp" or "aws".
- Existing clouds are migrated onto bindings when the server starts. For
  each cloud definition with a `binding { }` block, clouds that record no
  binding get one made from the values the block declares in the server's
  settings for that definition (`settings "cloud_gcp"` as configured,
  though the catalog otherwise ignores them since #20): the
  binding named after the provider (`gcp`) at revision 1, or the revision
  of it that already says the same. Recording it is not a new generation,
  queues nothing and changes no Terraform. Settings that say how a cloud is
  deployed (gcp `public`) stay settings. A second start changes nothing,
  and a provider without such clouds gets no binding. When the settings
  are missing or not a valid binding, or the provider's binding says
  something else, the server starts, warns naming each unbound cloud and
  why, and their applies, archives and force deletes fail with an error
  saying to fix the settings and restart; such clouds no longer render
  with the provider's only valid binding, as #18 had them do (#19).
- A cloud references a binding revision. A new cloud whose definition
  takes a binding records the binding it lands with and that binding's
  current revision: `anvil cloud create -binding NAME` (and
  `anvil service create -cloud ... -binding NAME`, `"binding"` in the API
  requests) chooses it, and without one the provider's only valid binding
  is used; none, or several, is a field error. Applies, archives and
  force deletes render the cloud from its recorded revision, so updating
  a binding never re-applies existing clouds, and only clouds created
  afterwards get the new revision. `anvil cloud get` and the cloud body's
  `spec.binding` show it as `{name, revision}`. An existing cloud keeps
  its binding (naming another is a `409`); force delete releases it, so
  the binding can then be deleted. Clouds created before this release
  record none and keep rendering with the provider's only valid binding
  until they are migrated (#19) (#18).
- Cloud definitions declare what a binding for their provider carries in a
  `binding { }` block (Terraform type constraints with `optional()`
  defaults, like settings and options), and read it as `binding.<x>`, with
  defaults applied, and `binding.name`. Binding writes are checked against
  the block (an undeclared attribute, a missing required one, or a wrong
  type is a field error naming the attribute) and stored in the declared
  types. A cloud with a binding block can be requested only while a valid
  binding exists for its provider; a cloud without one takes no binding.
  `GET /v1/catalog` and `anvil catalog show` list each binding schema, and
  `anvil catalog render -bindings FILE` supplies bindings to render with.
- A provider block takes an optional `version` constraint, written into
  the generated root module's `required_providers`.
- A definition can mark the resources that hold data with
  `lifecycle { stateful = [...] }` (component-relative addresses, checked
  like `destroy_on_delete`), on the service and on clouds. `anvil service
  delete` names them before you confirm: a force delete all of them, an
  archive its clouds'. Service bodies list them under `stateful` (each
  with its root-module `address`, and its `cloud` provider for a cloud's),
  and `anvil catalog show -json` under each definition's `stateful`. The
  built-in gcp cloud marks its image repository. This changes no
  Terraform, so existing services plan no changes (#27).
- `catalog.hcl` takes two optional version constraints, checked when the
  catalog loads: `requires_anvil` (against Anvil's release; development
  builds aren't checked) and `terraform_version` (against the server's
  Terraform, and added to the generated root module's `required_version`
  beside Anvil's `>= 1.6`). The server refuses to start, naming the
  constraint and the actual version, when one isn't met.
- Concurrent requests no longer fail with "Failed to load plugin schemas"
  (#35). A new service's first `terraform init` reused the cached provider
  only after downloading it again and rewriting the cached binary in
  place, which broke it for any service applying at that moment. The
  server now sets `TF_PLUGIN_CACHE_MAY_BREAK_DEPENDENCY_LOCK_FILE=true`
  with its plugin cache, so inits reuse what is cached (a service's
  `.terraform.lock.hcl` then records only the server platform's hash), and
  runs one `terraform init` at a time; applies still run in parallel.
- A cloud carries its catalog definition's `title`: `title` on
  `GET /v1/services/{name}/clouds/{provider}` and on each of a service's
  `status.clouds`. The CLI names clouds by it ("Cloud Run service" for
  the built-in gcp cloud) instead of hard-coded labels, so a catalog's new
  provider shows its own name; before a cloud exists, progress lines name
  it by provider ("Applied (gcp cloud)").
- The CLI's hints and help are catalog-neutral: `anvil service get` no
  longer suggests `gcloud auth print-identity-token` for a private URL
  (it says the URL requires credentials its cloud accepts) or
  `go run .` after cloning, and `anvil cloud` help points to
  `anvil catalog show` instead of describing GCP and AWS.
- Re-applying a service with the gcp cloud no longer changes its Cloud Run
  service. The API returns a service-level `scaling` block (Cloud Run's
  default, 0 minimum instances) that the built-in `gcp-cloud-run`
  component didn't declare, so every re-apply, such as after a catalog
  change, planned removing it. The component now declares that default.
- Ctrl+C at `anvil service delete`'s confirmation prompt ends the command
  ("stopped at the confirmation; nothing was changed"). It used to be
  ignored until you pressed Return, and the terminal status
  (OSC 7501) kept showing the command as waiting on you.

## v0.1.0 (2026-11-06)

The first release: the baseline catalogs name in `requires_anvil` and the
upgrade scenario (`TestUpgrade`) upgrades from.

### Breaking catalog changes

None: this is the first release. The catalog contract (v1) is provisional
until anvil 1.0.

### What's in it

- `anvil server` runs the API and a worker pool, configured by an HCL file
  (`anvil server -config`, or `ANVIL_CONFIG`), or with no configuration in
  dev mode. It acts on GitHub as a GitHub App, or a token for development.
- `anvil service create|get|list|delete` create a repository from the
  template with CI that publishes a versioned image to ghcr.io, archive and
  restore it, and force delete it. Every change is an operation that is safe
  to repeat; `anvil operation wait` picks one back up. Services have no
  owning team.
- `anvil cloud create|get` add a cloud to a service. The `gcp` cloud is a
  Cloud Run service in the organization's shared project that the
  repository's CI deploys to, public by default (`-option public=false`
  per service, `cloud_gcp.public` for the default). The `aws` cloud is an
  AWS account.
- A catalog defines what services and clouds are made of. The default
  catalog is built in; a server can pin another with `catalog.source`.
  `anvil catalog show` and `anvil catalog render` inspect it.
- `anvil version` prints the client's and the server's versions.
