# Anvil catalog contract

The catalog contract is the only interface between the Anvil engine and a
catalog. This document describes contract 2, the only version Anvil
reads. It is provisional until Anvil 1.0: it may still break during
v0.x, and every break is listed under **Breaking catalog changes** in the
[changelog](../CHANGELOG.md). The decisions behind it are recorded in
[#11](https://github.com/Laratechs/anvil/issues/11),
[#36](https://github.com/Laratechs/anvil/issues/36) and their sub-issues.

**Deployments and clouds.** A catalog declares where a service runs with
`deployment` blocks. A deployment is either platform-managed, on the shared
infrastructure the platform team runs, or self-managed, in a cloud of the
service's own such as a GCP project. A service has at most one. Some
names predate deployments, from when every deployment was called a
cloud: the `cloud_<name>` key, service bodies' `spec.clouds` and
`status.clouds`, and a binding's `provider`, which is the deployment's
name. Where this document says "cloud" for the engine's behavior, read
"deployment".

This document describes what Anvil implements. Where it and the code
disagree, the code is right and this document is a bug.

## Purpose and scope

The contract is the only thing a catalog may rely on from Anvil, and the
only thing Anvil may rely on from a catalog.

- **Anvil owns** the resources (services, their deployments, and cloud
  bindings), their lifecycle phases and state machine, the status
  vocabulary, the API and CLI, running Terraform, and generating each
  service's root module.
- **A catalog owns** what a service and each deployment are made of: the
  schemas for settings, bindings and options; the providers its modules
  need and how binding values configure them; the Terraform modules
  (components) and their wiring; exports; and the values it reports for
  each status key.

## Versioning and requirements

A catalog declares the contract version it targets, and the Anvil and
Terraform versions it needs, in `catalog.hcl`. Anvil checks all three when
it loads the catalog, and the server refuses to start if any check fails,
naming the constraint and the actual version.

```hcl
# catalog.hcl, at the catalog root
catalog {
  contract          = 2
  requires_anvil    = ">= 0.1, < 0.2" # optional
  terraform_version = ">= 1.9"        # optional
}
```

- **`contract`** (required): Anvil supports a range of versions, today
  2 to 2. A version outside the range is a load error that names the
  supported range.
- **`requires_anvil`**: a version constraint checked against Anvil's
  release version. Anvil tags releases `vMAJOR.MINOR.PATCH` from v0.1.0;
  until 1.0, minor versions may break, as semver allows for v0.x. A
  development build (any version that isn't a bare tag) counts as newer
  than every release and isn't checked.
- **`terraform_version`**: a version constraint checked against the
  server's Terraform at load, and added to the generated root module's
  `required_version` beside Anvil's own floor, `>= 1.6`, which always
  applies.
- A constraint that doesn't parse is a load error.

**Source and pinning.** The operator chooses the catalog with
`catalog { source = ... }` in the server configuration (or
`ANVIL_CATALOG`):

- a local directory, for development; or
- `git::<url>?ref=<tag or commit>`. The ref is required. A ref that names
  a branch is refused unless `allow_branch = true`
  (`ANVIL_CATALOG_ALLOW_BRANCH`), for development. Anvil fetches it as its
  GitHub identity, so the repository may be private.

The source is required: Anvil builds no catalog in. The Laratechs catalog
is [Laratechs/anvil-catalog](https://github.com/Laratechs/anvil-catalog), a
public repository. Its `tests/run.sh` tests its content with
`anvil catalog render`, and Anvil's CI runs it against the tag servers
run.

**Recording.** Each service records, as `status.catalog_revision`, the
catalog revision of its last successful apply: the commit SHA, or
`local`. A service last applied by an Anvil that still built a catalog in
keeps `builtin-<hash>` until its next apply.

**Additive within a version** (Anvil may ship them without a contract
version bump): new optional attributes or blocks, new names definitions may
reference, new status keys, new manifest fields.

**Breaking, needs a new version** (after Anvil 1.0): removing or renaming
anything in this document, changing a status key's meaning or type, making something
optional required, or changing generated root-module addresses
(`module.<key>_<component>`), which would move Terraform state. Anvil will
support the old version alongside the new one, so a catalog and Anvil
never have to change in the same step.

## Catalog layout

A catalog is a directory, or the root of a Git repository, with this
shape:

```
catalog.hcl              required: the catalog block
definitions/*.hcl        required: exactly one service block, any number of deployment blocks
components/<name>/       optional: local Terraform modules
  main.tf                required for a local module
  anvil.json             optional: the component manifest
```

- Definition files are read in name order. Only `definitions/*.hcl` is
  read; subdirectories are ignored.
- The service is defined once, and each deployment name at most once,
  across all files.
- A component's `module` is either a path starting `./` or `../`
  (resolved from the definition file; the directory must contain
  `main.tf`), or any other Terraform module source, such as `git::` or a
  registry address, passed through as written.
- Anvil copies a fetched catalog into its cache with `.git` removed.
  Modules must not depend on Git metadata or on files outside the catalog
  directory.

## Definition schema

A definition file holds `service { ... }` and
`deployment "<name>" { ... }` blocks. The name must match
`^[a-z][a-z0-9]{0,19}$`, the pattern the API accepts, so every deployment
that loads can be requested.

```hcl
deployment "gcp" {
  type  = "platform-managed"
  title = "Cloud Run service"
  # binding, settings, options, providers, components, exports, status
}
```

| Element | Kinds | Required | Meaning |
| --- | --- | --- | --- |
| `type` | deployment | yes | `"platform-managed"`: the service runs on the platform, the shared infrastructure the platform team runs, such as a Cloud Run service in the shared project. `"self-managed"`: the service gets a cloud of its own, such as a GCP project, which Anvil bootstraps and the service's team deploys into. A literal string. |
| `title` | both | no | Human name, such as "Cloud Run service". Defaults to the definition's name (`service`, `deployment "gcp"`). Anvil names the deployment by it in the API and CLI. |
| `settings { }` | both | no | Operator values, as Terraform type constraints with `optional()` defaults. For the service, values every service shares; for a deployment, how it is deployed wherever it lands, such as the gcp `public` default. |
| `binding { }` | deployment | no | The values a binding for this deployment carries: where it lands, such as the platform's project and region, or the folder new projects are created in. Same syntax as settings. An attribute may not be called `name`, which is the binding's own name. |
| `options { }` | deployment | no | Requester choices for one service's deployment, same syntax as settings. |
| `enabled_when` | deployment | no | A boolean expression over `settings` only; false hides the deployment. |
| `provider "<name>" { source, version, config }` | both | at least `source` | A Terraform provider: `source` and `version` (a version constraint) are literal strings; `config` is an object of expressions. A definition declares a provider once. A deployment can't declare one the service declares; two deployments may declare the same one (see below). |
| `component "<name>" { module, inputs }` | both | at least one | A Terraform module: `module` is a literal string, `inputs` an object of expressions. Names are identifiers, unique per definition. |
| `exports` | deployment | no | An object of strings offered to the service (see [Exports, archive and delete](#exports-archive-and-delete)). |
| `status { }` | both | no | Values for the status keys Anvil declares (see [Status](#status)). |
| `lifecycle { archive_targets, destroy_on_delete, stateful }` | see [Exports, archive and delete](#exports-archive-and-delete) | no | Lists of definition-relative addresses. `archive_targets` is for the service only. |

Any other attribute or block is a load error, including `type`, `options`,
`binding`, `enabled_when` or `exports` on the service, a deployment
without a `type`, a `cloud` block, `archive_targets` on a deployment, an
unknown status key, and the old `keep_on_delete` (now
`destroy_on_delete`). Literal-only fields (`type`, `title`, `source`,
`version`, `module`, the lifecycle lists) are evaluated without variables.

**Providers shared by deployments.** A managed deployment and a cloud on
the same provider both need its Terraform provider, configured
differently, so two deployments may each declare it. A service's root
module configures each provider once, and a service has one deployment,
so the two never meet. A service from before that rule with two
deployments that declare the same provider fails to render, naming both.

## Names a definition may reference

Expressions are Terraform expressions, evaluated by Terraform. Anvil only
checks which root names they use and rewrites them; any other root name
is a load error.

| Name | Available in | Value | Rewritten to |
| --- | --- | --- | --- |
| `anvil.name` | both | The service name, `^[a-z][a-z0-9-]*[a-z0-9]$`, 3 to 25 characters | `var.anvil.name` |
| `anvil.description` | both | The service description, may be `""` | `var.anvil.description` |
| `anvil.lifecycle` | both | `"active"` or `"archived"` | `var.anvil.lifecycle` |
| `anvil.org` | both | The GitHub organization Anvil serves | `var.anvil.org` |
| `settings.<x>` | both | This definition's settings, defaults applied | `var.settings.<key>.<x>` |
| `binding.name` | deployment with a `binding { }` block | The name of the binding this deployment uses | `var.binding.<key>.name` |
| `binding.<x>` | deployment with a `binding { }` block | A value of the binding revision this deployment uses, defaults applied; `<x>` must be declared in the block | `var.binding.<key>.<x>` |
| `options.<x>` | deployment | This deployment's options, defaults applied; an unset option without a default is `null` | `var.options.<key>.<x>` |
| `component.<c>.<output>` | both | An output of a component in the same definition | `module.<key>_<c>.<output>` |
| `children.deployment` | service | A list with one `{ name, type, binding, exports }` per deployment the service has; `binding` is `{ name, revision }`, or `null` for a deployment whose definition has no `binding { }` block | `local.children_cloud` |

`<key>` is `service` or `cloud_<name>`. A deployment's key keeps the
`cloud_` prefix contract 1 gave it, in generated addresses and in the
server's `settings "<key>" { }` blocks, so that moving a catalog to
contract 2 moved no Terraform state. All of Terraform's functions
are available, except in `enabled_when`, which Anvil evaluates itself with
only `length`, `contains` and `lower`.

A provider's `config` in a deployment may use only `anvil.*` and `binding.*`,
so one binding revision always configures the provider the same way. The
service's provider config has no such limit.

A definition cannot reference another deployment's components, binding or
options. Deployments reach the service only through exports.

## Settings, bindings and options

Three kinds of value reach a definition, one per audience. The catalog
declares each schema; Anvil supplies the values and checks them against
it.

| Value | Declared in | Supplied by | Answers | Where it lives |
| --- | --- | --- | --- | --- |
| Setting | `settings { }` in any definition | Operator | How every service, or every cloud of a provider, is deployed | Server configuration, `settings "<key>" { }` or the `ANVIL_SETTINGS` JSON file |
| Binding | `binding { }` in a deployment definition | Operator | Where its deployments land | A cloud binding resource in Anvil, for the provider named after the deployment |
| Option | `options { }` in a deployment definition | Requester | What one service's deployment chooses | Stored on the service |

### Settings

- Values are converted to the declared types, with defaults applied, when
  the server starts. A conversion failure, an attribute the definition
  doesn't declare, or a key the catalog has no definition for stops the
  server, naming the file and line when it can. A definition with no
  entry gets its defaults.
- One exception: an attribute the definition's `binding { }` block
  declares (and its `settings { }` block doesn't) is where clouds land,
  which bindings say now. The server starts, ignores the value, and warns,
  naming the file and line, asking to remove it and, while no valid
  binding for the provider exists, giving the `anvil binding create`
  command that holds the values.
- `enabled_when` is evaluated once, at start.
- The API never shows settings values.

### Cloud bindings

A cloud binding is an Anvil resource that says where one provider's
clouds land, such as the shared GCP project, region and Workload Identity
provider. Settings say how a cloud is deployed; its binding says where. A
service's cloud is a cloud definition plus, when the definition declares
a `binding { }` block, a binding revision. A cloud definition without the
block takes no binding.

- Operators create, update, list, show and delete bindings through the
  API (`/v1/bindings`) and CLI, for example
  `anvil binding create -provider=gcp -set project_id=... gcp-shared`.
  Binding writes need no Terraform and answer at once. A write that
  repeats the latest revision's values changes nothing.
- Anvil checks a binding against its provider's `binding { }` block on
  every write (an undeclared attribute, a missing required one, a wrong
  type, or a provider the catalog has no cloud for is a field error naming
  it) and stores the values in the declared types, without defaults. It
  checks again on every read, against the loaded catalog, and reports the
  result as the binding's `status` (`valid`, `errors`). An invalid binding
  can't be chosen for new clouds, and applies that use it fail with an
  error naming the binding and revision. For a provider whose cloud
  declares no `binding { }` block, values are stored as given.
- A cloud definition with a `binding { }` block can be requested only
  while its `enabled_when` (if any) holds and at least one valid binding
  exists for its provider; `GET /v1/catalog` says which is missing.
- A new cloud records the binding it lands with and that binding's latest
  revision. Requesters choose it with `-binding` on `anvil service deploy`
  and `anvil service create`
  (`anvil service deploy -binding=gcp-shared orders`), or
  `binding` in the API request. Without one, the provider's only valid
  binding is used; none, or several, is a field error.
- Bindings are versioned. Updating one stores a new, immutable revision,
  which clouds created afterwards use. Existing clouds keep the revision
  they recorded, and applies, archives and force deletes render with it,
  so a binding update never re-applies running services. An existing
  cloud keeps its binding: naming another is a `409`.
- An operator moves a service to its binding's latest revision with
  `anvil service migrate`, one service at a time. It records the latest
  revision and applies the service, so Terraform changes, or replaces,
  whatever the new values touch. The latest revision must be valid. A
  service body lists the deployments that are behind under
  `binding_updates`.
- Binding defaults are applied when a cloud renders, not stored, so a
  catalog that changes a `binding { }` default changes existing clouds on
  their next apply, as for options.
- Deleting a binding is refused (`409`) while any cloud records one of its
  revisions. A force delete releases the service's clouds' bindings.
- Binding values are configuration, not secrets: the API returns them, and
  credentials stay in the server environment (see
  [Known limitations](#known-limitations)).
- **Migration.** Clouds created before clouds recorded a binding are
  migrated when the server starts: for each cloud definition with a
  `binding { }` block, the values that block declares are read from the
  server's settings for that definition, stored as the binding named after
  the provider at revision 1 (or the existing revision that says the
  same), and recorded by every such cloud, with no Terraform change. When
  that fails, the server starts, warns naming each unbound cloud, and
  their applies fail until the settings are fixed and the server
  restarts.

### Options

- Requesters set options with `-option name=value` on
  `anvil service create` and `anvil service deploy`, or `options` in
  the API request. An unknown name or a value of the wrong type is
  rejected with a field error listing the valid names.
- Anvil stores only what the requester chose. Defaults are applied at
  every apply, so changing an option's default in the catalog changes
  existing services on their next apply. Catalog authors treat a default
  change as a migration.
- A stored option the catalog no longer declares is dropped when
  rendering, with a warning in the apply log, on the operation, and in
  the service's `status.warnings`, until an apply no longer finds it.

`GET /v1/catalog` (`anvil catalog show`) lists each definition's title,
`type`, components, whether it can be requested and why not, each option's name,
type and default, and each binding schema. It never shows settings
values.

## Status

Anvil declares the status vocabulary below; a catalog only supplies values
for it. An unknown key is a load error, every key is optional, and a value
of the wrong type fails the apply. Lifecycle phases (such as ready and
archived) belong to Anvil's state machine and are never set by a catalog.

Status is replaced as a whole after each successful apply and kept as it
was after a failed one.

**Service** (`status { }` in the service definition)

| Key | Type | What Anvil does with it |
| --- | --- | --- |
| `repository_url` | string, `https://github.com/<org>/<repo>` | Shown by `service get` and `service list`. The CLI derives the GitHub repository from it to follow CI. |
| `ci_commit` | string, a commit SHA | After an apply, the CLI waits for GitHub Actions runs on this commit before reporting the service deployed. Needs `repository_url` and a cloud with a `url`. |
| `image` | string, an image reference without a tag | Shown by `service get`. On force delete, if it is `ghcr.io/<org>/<package>`, Anvil deletes that package first, or prints the command to when its GitHub identity can't. |

**Deployment** (`status { }` in each deployment definition)

| Key | Type | What Anvil does with it |
| --- | --- | --- |
| `provider` | string | Defaults to the deployment's name. Set it only to that name: Anvil doesn't check it. |
| `kind` | string | Stored and returned by the API, such as `cloud_run_service`. Not interpreted. |
| `id` | string | The cloud's identifier, shown by the CLI and in delete summaries. |
| `url` | string | Where the service answers. The first cloud with a `url` is the deploy target: the CLI waits for CI and prints it. |
| `public` | bool | Whether `url` answers without authentication. The CLI's hint changes from opening the URL to saying it needs credentials the cloud accepts. |
| `console_url` | string | A link to the provider console, shown by the CLI. |

The API returns status only under each service (`status`) and each cloud
(`status.clouds`, each with its definition's `title`). An archived
service reports no cloud in `status.clouds`, as its clouds are torn down.

## Exports, archive and delete

**Exports.** A deployment's `exports` is an object of strings it offers
its service; without one it exports `{}`. The service sees every
deployment it has as `children.deployment`, a list of
`{ name, type, binding, exports }`, and decides what to do with them. The Laratechs catalog merges them into the
repository's Actions variables.

**Lifecycle addresses** are written relative to the definition: a
component name (`run`), or a component name and a resource address inside
it (`repository.github_repository.this`). Anvil rewrites them to
root-module addresses.

| Attribute | Kinds | When Anvil uses it |
| --- | --- | --- |
| `archive_targets` | service | While the service is archived, applies run with `-target` for each address only. |
| `destroy_on_delete` | both | On force delete, Anvil removes every other address from state (forgotten, not destroyed), then applies a configuration with the providers and no components, which destroys the listed addresses. |
| `stateful` | both | Addresses of resources that hold data, such as databases, buckets and image repositories. Anvil names them before an archive or force delete; they never change what is applied. |

- **Archive** tears down every cloud's resources to save cost, using the
  same `destroy_on_delete` set as a force delete: Anvil forgets the rest
  of each cloud's state, applies a configuration that has the service but
  no cloud components, targeted at those addresses, and then applies the
  service's `archive_targets`. The service and its clouds stay on record.
  **Restore** runs a full apply, which recreates the clouds.
- A cloud with no `destroy_on_delete` makes its service impossible to
  archive or force delete (`409`): Anvil refuses rather than forget the
  cloud's resources or leave them running. A service archived by a release
  from before archive tore clouds down keeps such a cloud running when it
  is next applied, with a warning.
- **Data loss.** `anvil service delete` names the `stateful` resources
  whose data is lost before you confirm. An archive names only its
  clouds' stateful resources, as it keeps the service's own, and says
  that restoring the service doesn't bring the data back; a force delete
  names all of them. A service body lists them under a top-level
  `stateful` array, each as `{ address, cloud? }`: the root-module
  `address`, and the `cloud` provider for a cloud's resource (absent for
  the service's own). An archived service lists only its own, as its
  clouds are torn down. `GET /v1/catalog` lists each definition's
  `stateful` addresses.
- The teardown configuration is rendered from the current catalog and the
  binding revision the cloud recorded, so a definition's providers must
  still be able to destroy resources that an older catalog created.

## Component manifest

An optional `anvil.json` at a module's root names its resource types in
requesters' terms for progress output. It never changes what is applied.

```json
{
  "labels": { "github_repository_file": "committing {key}" },
  "delete_labels": { "github_repository_file": "removing {key}" }
}
```

- `labels` maps a resource type to a label; `{key}` is replaced with the
  resource's `for_each` key.
- `delete_labels` replaces the default "deleting <label>" for a type.
- A type with no label is shown as its name without the provider prefix,
  with underscores as spaces: `google_service_account` reads "service
  account".
- Remote modules may carry a manifest too; Anvil reads it from
  `.terraform/modules` after `terraform init`. Resources in nested modules
  are labelled by the top-level component's manifest.
- Invalid JSON in a local manifest is a load error. Unknown fields are
  ignored.

## Engine behaviours

**Generated root module.** For each service, Anvil writes `main.tf.json`
and `terraform.tfvars.json` into its work directory, then runs
`terraform init` and `terraform apply`.

- There is one root module per service, holding the service definition
  and each of its clouds, and one Terraform state per service.
- Module addresses are `module.<key>_<component>`. Renaming a component or
  a deployment moves state, so it is a migration for the catalog, not a free
  change.
- Status blocks become outputs named `service` and `cloud_<provider>`;
  exports become `local.cloud_<provider>_exports`.
- `required_version` is `>= 1.6`, plus the catalog's `terraform_version`
  when it declares one. The variables `anvil`, `settings`, `options` and
  `binding` are typed `any`; `binding` holds an entry only for clouds whose
  definition has a `binding { }` block.
- Providers from all included definitions go into one `required_providers`
  (with each `version` constraint) and one provider block per name,
  without aliases. A service has at most one cloud per provider, so one
  binding configures each provider.
- With a state bucket configured, the backend is `gcs` with prefix
  `<state prefix>/<service>`; otherwise state is local.

**Credentials.** Anvil gives Terraform one identity of its own:
`GITHUB_TOKEN`, fresh for every command, plus Git credentials for
`https://github.com/` so `git::` modules in the organization can be
fetched. Every other provider authenticates from the server's
environment, for example Application Default Credentials for Google. A
catalog must not expect credentials in settings, bindings or options.

**Fetching.** Anvil fetches a `git::` catalog with a depth-1 fetch of the
ref and caches it under the data directory, once per commit. If the
remote is unreachable at start, Anvil loads the commit it last fetched for
that ref, and logs a warning.

## Requesting a deployment

Requesters ask for a deployment by type, with `anvil service deploy`
(`-type=platform-managed`, the default, or `-type=self-managed`) or
`anvil service create -deploy`. Anvil picks the deployment of that type
the catalog offers: one that is enabled and, if its definition takes a
binding, has a valid one. A catalog that offers several of a type makes
requesters name one (`-deployment=<name>`), so most catalogs offer one of
each. A service has one deployment, and its type can't change.

## Moving from contract 1

Contract 1 declared where a service runs with `cloud "<provider>"` blocks
without a type, and Anvil no longer reads it. To move a catalog: set
`contract = 2`, rename each `cloud "<provider>"` block to
`deployment "<provider>"` with the same label, give it a `type`, and read
`children.deployment` (whose entries have `name` where they had
`provider`) in the service. Keeping the labels keeps every generated
address, so existing services re-apply with no Terraform changes.

## Known limitations

- **A deployment's type is fixed.** A service can't move from a
  platform-managed deployment to a self-managed one, or back.
- **Old names.** Service bodies and generated names still say `cloud`
  for a deployment, as described at the top.

Contract 2 knowingly couples Anvil to GitHub and to its server environment.
[#33](https://github.com/Laratechs/anvil/issues/33) tracks each limitation
and possible solutions.

- **GitHub.** Anvil assumes the service is a GitHub repository in
  `anvil.org` and that CI is GitHub Actions: the CLI follows CI on GitHub,
  and force delete removes the `ghcr.io` package named by `status.image`.
  A catalog that builds services elsewhere loses those features but still
  works.
- **Credentials.** Provider credentials come from the server's
  environment, not from bindings, so one Anvil server holds one identity
  per provider. Bindings that need different identities, such as two GCP
  organizations, are not supported.
- **Undeclared options.** A stored option the catalog no longer declares
  can't be removed through the API yet: the option check rejects unknown
  names, `null` included.
