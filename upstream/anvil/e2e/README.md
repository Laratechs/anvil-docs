# Validation harness

`e2e/` drives Anvil the way an engineer does: it builds the `anvil` binary
from this checkout, starts `anvil server` with its own data directory, runs
CLI commands, and checks what actually changed on GitHub. It complements the
unit tests, which use fake GitHub and Terraform: the harness catches what
only shows up against the real thing (Terraform providers, GitHub's API, the
template repository, the catalog, the binary's wiring).

## Catalogs

Scenarios run against one of two catalogs:

- **The catalog under test**, `ANVIL_E2E_CATALOG`: the harness's own
  server runs it, and so do the scenarios about what a real catalog builds
  (`TestServiceLifecycle`, `TestCloudRun`, `TestBindings`,
  `TestMovedSettings`, and this checkout's server in `TestUpgrade`). It
  takes any source `ANVIL_CATALOG` takes: a directory or a
  `git::https://...?ref=<tag>` source. It defaults to `anvil-catalog` beside this repository's main
  checkout (`../anvil-catalog`, also from a worktree), so test a catalog
  change by checking it out there, or point the variable at it:

  ```
  ANVIL_E2E_CATALOG=$HOME/src/anvil-catalog ANVIL_E2E=1 go test ./e2e/ -v -timeout 30m
  ANVIL_E2E_CATALOG='git::https://github.com/Laratechs/anvil-catalog.git?ref=v1.0.0' ANVIL_E2E=1 go test ./e2e/ -v -timeout 30m
  ```

- **The engine catalog**, [`testdata/catalog`](testdata/catalog): for
  scenarios that test Anvil itself (bindings, migrations, catalog loading,
  options, force delete) whatever catalog is deployed. Its service and its
  `e2eslot` and `e2eplatform` deployments are each one `terraform_data`, so they download nothing
  and create nothing on GitHub or in a cloud account. Its servers ignore
  `ANVIL_SETTINGS` and `ANVIL_CONFIG`, which configure a real catalog.

It creates and deletes real repositories named `e2e-<random>` in the
organization, so it only runs when asked. `go test ./...` and CI skip it.

## Running it

```
ANVIL_E2E=1 go test ./e2e/ -v -timeout 30m
ANVIL_E2E=1 go test ./e2e/ -v -run 'ServiceLifecycle/create'   # one scenario or step
```

You need what a dev server needs (Terraform on `PATH`, `gh auth login`
with the `repo`, `read:org`, `workflow` and `delete_repo` scopes, plus
`read:packages` and `delete:packages` for `TestCloudRun`'s image checks and
cleanup: `gh auth refresh -s delete_repo,read:packages,delete:packages`), and the
server reads the same environment as in production, so `ANVIL_CONFIG` (an
HCL configuration file, as `anvil server -config`) and any `ANVIL_*` variable
test those configurations. Servers the harness starts get a gcp binding (`e2e-gcp`) holding whatever `settings "cloud_gcp"` in `ANVIL_CONFIG` still sets for `project_id`, `region` and `workload_identity_provider`, which moved to bindings: the step an operator takes after upgrading ([Setting up Cloud Run](../docs/gcp-setup.md)). A server named by `ANVIL_E2E_URL` needs its own gcp binding.

| Variable | Purpose |
| --- | --- |
| `ANVIL_E2E` | `1` to run the harness |
| `ANVIL_E2E_CATALOG` | The catalog under test (default `anvil-catalog` beside this repository; see [Catalogs](#catalogs)). Overrides `ANVIL_CATALOG` and `catalog { source }` for the harness's servers |
| `ANVIL_E2E_URL` | Test an already running server, such as a deployment, instead of starting one |
| `ANVIL_E2E_BASELINE` | Ref `TestUpgrade` upgrades from (default the latest `v*` tag, else where `HEAD` branched from `main`, or `HEAD~1` on `main`) |
| `ANVIL_GITHUB_ORG` | Organization to check repositories in (default `Laratechs`) |
| `ANVIL_TOKEN` | Your GitHub token, for the CLI and the harness's GitHub checks (default `gh auth token`) |

A failed run keeps its directory (printed at the end) with `server.log`
and the server's data, including each service's Terraform logs.

Every scenario removes what it created, even when it fails. If a run is
killed, list leftovers with
`gh repo list Laratechs --json name --jq '.[].name' | grep '^e2e-'`.

## Scenarios

| Scenario | What it protects |
| --- | --- |
| `TestServiceLifecycle` | Create a service with no team (repository from the template, `anvil-managed` topic, CI file, no team access, topic or CODEOWNERS, `ready` at its generation, status only under `status` with no top-level `repository_url`, `image`, `gcp_project` or `aws_account`); a repeated request changes nothing; archive; restore; force delete removes the repository and the record |
| `TestForceDeleteAfterFailedCreate` | Engine catalog. Starts its own server from an HCL configuration file (`anvil server -config`) whose settings the service's component rejects at plan time (`settings "service" { reject = "e2e" }`), so it skips with `ANVIL_E2E_URL`; the rejected plan proves the file's settings reached Terraform. First, the same file with an undeclared attribute (`rejekt`) makes the server refuse to start, naming the file, line and attribute. A create whose first apply fails before Terraform writes any state leaves the service `failed`, and force delete still removes the record instead of leaving it stuck |
| `TestCloudBinding` | Engine catalog: starts its own server, whose `e2eslot` cloud is a `terraform_data` with id `<binding>:<zone>`, so it needs no cloud account and skips with `ANVIL_E2E_URL`. With two `e2eslot` bindings, `service deploy` without `-binding` is refused with a field error on `deployment` naming both; `service deploy -type=self-managed -binding=slot-a` records `spec.bindings.e2eslot` `slot-a` revision 1 and renders with it; `binding update` stores revision 2 and the existing service is not re-applied (same generation and last operation, still revision 1 and `slot-a:one`), nor by a repeated `service deploy`; a new service created with `-type=self-managed -binding=slot-a` records revision 2 and renders `slot-a:two`; the first service then lists `binding_updates` (revision 1 of 2) in `service get -json` and `slot-a r1 (behind r2)` in `service list`; `service migrate` without a confirmation names the changed value and changes nothing; `service migrate -confirm` moves it to revision 2 and `slot-a:two`, a repeat leaves its generation and last operation alone, and migrating the second service reports nothing to change; `binding delete` is refused while the clouds use it and succeeds after both services are force deleted |
| `TestBindings` | An operator manages a cloud binding (`aws` provider, which no scenario creates clouds for) through the CLI, asserting on `-json`: `catalog show` lists the aws cloud's binding schema (`email_template` required, ..., `region` a `string`); a `binding create` with an attribute the schema doesn't declare (`zone`) fails naming it and stores nothing; `binding create` stores revision 1 with its values and `status.valid`; a repeated create stores no revision; `binding update -set` stores revision 2, while `binding get -revision=1` still shows the old values; `binding list` shows it at revision 2; `binding delete` removes it, after which `binding get` fails |
| `TestMovedSettings` | `ANVIL_E2E_CATALOG`'s gcp cloud. Starts its own server, so it skips with `ANVIL_E2E_URL`. A configuration file that still sets where Cloud Run services land in `settings "cloud_gcp"` (`project_id`, `workload_identity_provider`, which moved to the gcp binding) doesn't stop the server: `server.log` warns naming the file and line and the `anvil binding create` command with those values; `catalog show` doesn't offer the gcp cloud until that binding is created, then does. Nothing is applied |
| `TestBindingMigration` | Starts its own servers with copies of the engine catalog whose `e2eslot` cloud it replaces (a `terraform_data` whose id is its zone), and `ANVIL_SETTINGS` `{"cloud_e2eslot": {"zone": "one"}}`, so it needs no cloud account and skips with `ANVIL_E2E_URL`. A cloud created while `e2eslot`'s zone was a setting records no binding; a server whose catalog moves zone to a `binding { }` block migrates it on start: binding `e2eslot` revision 1 with zone `one`, `spec.binding` `e2eslot` revision 1, same generation and last operation; a second start stores nothing and re-applies nothing; a re-apply (an option nothing reads) succeeds with 0 Terraform changes and the same id; force delete releases the binding, which can then be deleted |
| `TestCatalogRequirements` | Starts its own server, so it skips with `ANVIL_E2E_URL`. With a copy of the engine catalog whose `catalog.hcl` sets `terraform_version = ">= 99.0"`, the server refuses to start, and its error names `catalog.hcl`, the constraint and the version of the Terraform on `PATH` |
| `TestRemovedVariables` | Engine catalog. Starts its own server, so it skips with `ANVIL_E2E_URL`. With `ANVIL_REGISTRY` set (one of the MVP's removed `ANVIL_REGISTRY`, `ANVIL_REPO_VISIBILITY` and `ANVIL_AWS_*` variables), the server refuses to start, and its error names the replacement: `registry` in a `settings "service"` block |
| `TestCatalogRequired` | Starts its own servers, so it skips with `ANVIL_E2E_URL`. Anvil builds no catalog in: with `ANVIL_CATALOG` unset (and no configuration file) the server refuses to start, and its error says to set `catalog { source }` or `ANVIL_CATALOG` with an example `git::https://github.com/Laratechs/anvil-catalog.git?ref=` source; with `ANVIL_CATALOG=builtin` it refuses, and its error says the built-in catalog was removed and names `github.com/Laratechs/anvil-catalog` |
| `TestDroppedOption` | Starts its own servers, so it skips with `ANVIL_E2E_URL`. A server with a copy of the engine catalog that adds an `e2e_retired` option to the `e2eslot` cloud creates a service with `-type=self-managed -option e2e_retired=kept`; then a server with the engine catalog itself takes over the same data directory and state backend, and a change to the service still applies (`ready` at its generation) and lists the dropped option in the status's `warnings` |
| `TestServiceDeploy` | Engine catalog, which offers one platform-managed deployment (`e2eplatform`) and one self-managed (`e2eslot`). Starts its own server, so it skips with `ANVIL_E2E_URL`. A service created with no deployment has none; `service deploy` gives it the platform-managed one by default, with its status; `service deploy -type=self-managed` and `-deployment=e2eslot` are then refused (a deployment's type can't change, and a service has one), and with a repeated `service deploy -type=platform-managed` leave the generation and last operation as they were; `service deploy -type=self-managed` gives a second service `e2eslot`, which is then refused a platform-managed one; archiving that service is refused (an archive would delete its own cloud) and changes nothing, and `service delete -force` names the cloud, says everything in it is deleted, warns that it is the service's own cloud, and removes the service; `service create -deploy` creates a third with the platform-managed deployment |
| `TestCatalogRenamedAttribute` | Starts its own server, so it skips with `ANVIL_E2E_URL`. With a copy of the engine catalog whose service definition still uses `lifecycle.keep_on_delete` (renamed `destroy_on_delete`), the server refuses to start, and its error names `service.hcl`, the old attribute and the new one |
| `TestUpgrade` | Starts its own servers, so it skips with `ANVIL_E2E_URL`. Builds the baseline release (`ANVIL_E2E_BASELINE`), stamped with its `git describe` (the tag, for a release), checks its client and server report that version in `anvil version`, and creates a service (with the gcp cloud when the baseline offers it) through its CLI and server; then this checkout's server takes over the same data directory and state backend, and the repeated create converges (this checkout's server runs `ANVIL_E2E_CATALOG`; a baseline that still built a catalog in, such as v0.1.0, runs that one unless `ANVIL_CATALOG` is set, so moving from the built-in catalog onto `ANVIL_E2E_CATALOG` is covered too, and a later baseline runs `ANVIL_E2E_CATALOG` as well): when the catalog changed it re-applies with 0 to add, change, destroy or import (catches state moves, lost settings and broken migrations), otherwise it changes nothing; the service stays `ready` at its generation and keeps every status value the baseline reported. A gcp cloud the baseline created without a binding (a baseline from before #20, such as `ANVIL_E2E_BASELINE=e6de67c`) is migrated onto binding `gcp` revision 1 made from `settings "cloud_gcp"`, and the harness makes no gcp binding of its own on that server; one the baseline created with a binding keeps it. The harness gives either server its `e2e-gcp` binding only when its gcp cloud takes a binding and none is valid yet. Rendering changes in Go that leave the catalog's files alone don't re-apply, so it doesn't see them |
| `TestCloudRun` | Only when the server offers the gcp cloud (a valid gcp binding, which the harness creates from `ANVIL_CONFIG` as above, [Setting up Cloud Run](../docs/gcp-setup.md)); reads GCP with Application Default Credentials. Add a Cloud Run service to a service (`service deploy -binding=e2e-gcp` when the harness made that binding): `service get -json` shows the gcp binding revision in `spec.binding` and and the service's status name it by the catalog definition's title (`Cloud Run service`); it exists in the shared project with Anvil's labels, runs as `run-<name>`, has its own image repository; `service deploy` returns after the repository's CI deployed, every CI run on the repository (including the template's `Initial commit`) ends in success or is superseded, Cloud Run runs an image from that repository and the URL serves `Hello, world from <name>!` to anyone (refuses anonymous requests when the operator set `cloud_gcp.public` to `false`); `service deploy -option public=false` makes it refuse anonymous requests and `public=true` serves them again, with the option on the cloud's spec; the repository gets the `ANVIL_GCP_*` variables CI deploys with; before archive and before force delete, `service get -json` lists under `stateful` (for `cloud` `gcp`) exactly the addresses `catalog show -json` declares stateful for the gcp cloud (the image repository), and the delete's confirmation names each; archive removes the Cloud Run service and image repository from the shared project and archives the repository, while the service stays with the gcp cloud on its spec, none in `status.clouds` and no gcp entry in `stateful`, and `service get` shows the cloud `archived` with no status; restore (`service create`) recreates the Cloud Run service at the same id and its image repository, unarchives the repository, and the URL serves again (the placeholder, until CI next deploys); a repeated `-deploy` request without `-option` changes nothing; force delete removes the ghcr.io image or, as the GitHub App can't, prints the command to (which the harness runs), and removes the Cloud Run service, image repository, repository and record |

## Adding a scenario

The harness grows with Anvil: a change that adds or changes something a
user does adds or extends a scenario in the same commit, and a row above.

- Pick the catalog by what the scenario protects. Anvil's own behavior
  (the engine) runs on the engine catalog: `engineCatalog` copies it into
  the scenario's directory, where the scenario may change the copy, and
  `startEngineServer` runs a server on it. What a real catalog builds
  (repositories, Cloud Run, a binding schema) runs on `ANVIL_E2E_CATALOG`,
  through the harness's server or `h.catalog`. When an engine
  scenario needs something the engine catalog lacks, add it there,
  keeping it free of providers and real resources.
- One file per capability (`service_test.go`, `cloud_test.go`, ...), one
  `Test` per user workflow, with `t.Parallel()`.
- Get service names from `h.newService(t)`. It registers the cleanup, and
  cleanup only ever deletes names it handed out.
- Act through the CLI (`h.mustAnvil`, `h.anvil` with stdin for prompts),
  never by calling the API or GitHub directly, so the harness tests what
  users run.
- Assert on contracts, not prose: exit codes, `-json` output (declared in
  the harness's own structs, not imported, so API changes show up here),
  and the state on GitHub (`h.repo`, `h.repoHasFile`; add helpers like
  them for other systems). The CLI's wording is the unit tests' job.
- Use `steps` for workflows whose steps depend on each other; it stops at
  the first failure.
- Wrap reads of external systems that lag behind a change in `eventually`.
- A scenario that creates something force delete can't remove (an AWS
  account) must clean it up itself, and say how in its doc comment.
