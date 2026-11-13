# Validation harness

`e2e/` drives Anvil the way an engineer does: it builds the `anvil` binary from
this checkout, starts `anvil server` with its own data directory, runs CLI
commands, and checks what actually changed on GitHub. It complements the unit
tests, which use fake GitHub and Terraform: the harness catches what only shows
up against the real thing (Terraform providers, GitHub's API, the template
repository, the catalog, the binary's wiring).

It creates and deletes real repositories named `e2e-<random>` in the
organization, so it only runs when asked. `go test ./...` and CI skip it.

**Run it when** a change adds or changes something a user does. Add or extend a
scenario in the same commit ([Adding a scenario](#adding-a-scenario)).

## Running it

```
ANVIL_E2E=1 go test ./e2e/ -v -timeout 30m
ANVIL_E2E=1 go test ./e2e/ -v -run 'ServiceLifecycle/create'   # one scenario or step
```

**You need** what a dev server needs:

- Terraform on your `PATH`.
- `gh auth login` with the `repo`, `read:org`, `workflow` and `delete_repo`
  scopes. `TestCloudRun`'s image checks and cleanup also need `read:packages`
  and `delete:packages`:
  `gh auth refresh -s delete_repo,read:packages,delete:packages`.

The harness runs a fake identity provider, which its servers trust and its
CLI signs in to with the real `anvil login`; the CLI's credentials live in
the run's directory, not yours. It overrides `ANVIL_OIDC_*` and
`ANVIL_CONFIG_DIR` for this. A server named by `ANVIL_E2E_URL` has a real
identity provider instead: run `anvil login` against it first, as an admin.

The harness's CLI is signed in as an admin. A scenario about what a role may
do gets a CLI signed in as someone else from `h.as(t, authtest.User{...})`.

Otherwise the server reads the same environment as in production, so `ANVIL_CONFIG` (an
HCL configuration file, as `anvil server -config`) and any `ANVIL_*` variable
test those configurations.

Servers the harness starts get a gcp binding (`e2e-gcp`) holding whatever
`settings "cloud_gcp"` in `ANVIL_CONFIG` still sets for `project_id`, `region`
and `workload_identity_provider`. Those moved to bindings, which is the step an
operator takes after upgrading ([Setting up Cloud Run](../docs/gcp-setup.md)).
A server named by `ANVIL_E2E_URL` needs its own gcp binding.

| Variable | Purpose |
| --- | --- |
| `ANVIL_E2E` | `1` to run the harness |
| `ANVIL_E2E_CATALOG` | The catalog under test (default `anvil-catalog` beside this repository; see [Catalogs](#catalogs)). Overrides `ANVIL_CATALOG` and `catalog { source }` for the harness's servers |
| `ANVIL_E2E_URL` | Test an already running server, such as a deployment, instead of starting one |
| `ANVIL_E2E_BASELINE_CATALOG` | Catalog the `TestUpgrade` baseline runs, when it has no built-in catalog (default `ANVIL_E2E_CATALOG`). Set it to the catalog the baseline was released with when the catalog under test needs a contract the baseline doesn't read, such as a contract 3 catalog after a contract 2 baseline |
| `ANVIL_E2E_BASELINE` | Ref `TestUpgrade` upgrades from (default the latest `v*` tag, else where `HEAD` branched from `main`, or `HEAD~1` on `main`) |
| `ANVIL_GITHUB_ORG` | Organization to check repositories in (default `Laratechs`) |
| `GH_TOKEN`, `GITHUB_TOKEN` | Your GitHub token, for the harness's GitHub checks and for the CLI to follow CI (default `gh auth token`) |

**When a run fails**, it keeps its directory (printed at the end) with
`server.log` and the server's data, including each service's Terraform logs.
A failed scenario also prints the logs of its repository's failed CI runs,
since cleanup deletes the repository and its runs with it.

Every scenario removes what it created, even when it fails. If a run is killed,
list leftovers with
`gh repo list Laratechs --json name --jq '.[].name' | grep '^e2e-'`.

## Catalogs

Scenarios run against one of two catalogs:

- **The catalog under test**, `ANVIL_E2E_CATALOG`. The harness's own server
  runs it, and so do the scenarios about what a real catalog builds
  (`TestServiceLifecycle`, `TestCloudRun`, `TestBindings`, `TestMovedSettings`,
  and this checkout's server in `TestUpgrade`). It takes any source
  `ANVIL_CATALOG` takes: a directory or a `git::https://...?ref=<tag>` source.
  It defaults to `anvil-catalog` beside this repository's main checkout
  (`../anvil-catalog`, also from a worktree), so test a catalog change by
  checking it out there, or point the variable at it:

  ```
  ANVIL_E2E_CATALOG=$HOME/src/anvil-catalog ANVIL_E2E=1 go test ./e2e/ -v -timeout 30m
  ANVIL_E2E_CATALOG='git::https://github.com/Laratechs/anvil-catalog.git?ref=v1.0.0' ANVIL_E2E=1 go test ./e2e/ -v -timeout 30m
  ```

- **The engine catalog**, [`testdata/catalog`](testdata/catalog), for scenarios
  that test Anvil itself (bindings, migrations, catalog loading, options, force
  delete) whatever catalog is deployed. Its service, its `e2eslot` and
  `e2eplatform` deployments and its `e2edb` add-on are each one
  `terraform_data`, so they download nothing and create nothing on GitHub or in
  a cloud account. Its servers ignore `ANVIL_SETTINGS` and `ANVIL_CONFIG`, which
  configure a real catalog.

## Scenarios

Each scenario's doc comment, above its `Test` function, has the full steps and
what it asserts. "Own server" scenarios start their own server, so they skip
with `ANVIL_E2E_URL`.

| Scenario | Catalog | What it protects |
| --- | --- | --- |
| `TestServiceLifecycle` | Under test | The whole life of a service: create, a repeated request that changes nothing, archive, restore, and force delete. Checks the repository, its topic and CI file, no team access, and that status lives only under `status`. A developer's force delete is refused, naming the admin group |
| `TestForceDeleteAfterFailedCreate` | Engine, own server | A create that fails before Terraform writes any state leaves the service `failed`, and force delete still removes the record. Also proves an HCL configuration file's settings reach Terraform, and that an undeclared attribute stops the server naming the file, line and attribute |
| `TestServiceDeploy` | Engine, own server | A deployment's type is fixed: `service deploy` defaults to platform-managed, then refuses another type or a second deployment. A self-managed service can't be archived, and its force delete names and warns about its own cloud |
| `TestAddon` | Engine, own server | Add-ons: services share one instance and each gets a tenant. Archive is refused, detach keeps the instance for the others, and force deleting the last tenant removes the instance |
| `TestBindings` | Under test | An operator manages a binding through the CLI: schema validation, revisions, a repeated create storing nothing, update, list and delete |
| `TestCloudBinding` | Engine, own server | Bindings on deployments: a deployment records its binding's revision, a binding update re-applies nothing, `service migrate` moves one service on confirmation, and a binding in use can't be deleted |
| `TestBindingMigration` | Engine, own server | Deployments created before bindings are migrated onto one at start: same generation, nothing re-applied, a second start storing nothing |
| `TestMovedSettings` | Under test, own server | A configuration file that still sets where Cloud Run services land in `settings "cloud_gcp"` warns, with the `anvil binding create` command, and offers the gcp deployment only once that binding exists |
| `TestCloudRun` | Under test | The real Cloud Run path: create, deploy by CI, public and private, rolling back by re-running an earlier deploy job ([docs/gcp.md](../docs/gcp.md#rolling-back)), archive and restore, stateful resources named before a delete, and the force delete's image cleanup. Runs only when the server offers the gcp deployment; reads GCP with Application Default Credentials |
| `TestCatalogRequirements` | Engine, own server | A catalog whose `terraform_version` constraint rules out the server's Terraform stops the server, naming the file, constraint and version |
| `TestCatalogRenamedAttribute` | Engine, own server | A catalog still using a renamed attribute (`keep_on_delete`) stops the server, naming the file, the old attribute and the new one |
| `TestCatalogRequired` | Own server | Anvil builds no catalog in: with none configured, or `builtin`, the server refuses to start and says what to set |
| `TestRemovedVariables` | Engine, own server | A removed MVP variable stops the server and names its replacement |
| `TestDroppedOption` | Engine, own server | An option the catalog no longer declares is dropped with a warning in the status, and the service still applies |
| `TestSignIn` | Under test | Signing in and roles: a command before `anvil login` says to sign in, login stores credentials only the user can read, `whoami` shows who the server takes the caller to be and their role, a GitHub token or no token is answered `401`, a viewer can list but not create, a developer can't write bindings, and `logout` signs out and revokes the sign-in at the identity provider. Skips with `ANVIL_E2E_URL` |
| `TestUpgrade` | Under test, own servers | Upgrades converge: a service made by the baseline release is repeated against this checkout's server and applies with nothing to add, change, destroy or import, keeping every status value |

`TestUpgrade` can't see rendering changes made in Go that leave the catalog's
files alone, since those don't re-apply.

## Adding a scenario

The harness grows with Anvil: a change that adds or changes something a user
does adds or extends a scenario in the same commit, and a row above.

- **Pick the catalog by what the scenario protects.** Anvil's own behavior (the
  engine) runs on the engine catalog: `engineCatalog` copies it into the
  scenario's directory, where the scenario may change the copy, and
  `startEngineServer` runs a server on it. What a real catalog builds
  (repositories, Cloud Run, a binding schema) runs on `ANVIL_E2E_CATALOG`,
  through the harness's server or `h.catalog`. When an engine scenario needs
  something the engine catalog lacks, add it there, keeping it free of providers
  and real resources.
- **One file per capability** (`service_test.go`, `cloud_test.go`, ...), **one
  `Test` per user workflow**, with `t.Parallel()`.
- **Document the scenario** in the doc comment above its `Test` function: what
  it protects and each step it checks. The table above is the summary.
- **Get service names from `h.newService(t)`.** It registers the cleanup, and
  cleanup only ever deletes names it handed out.
- **Act through the CLI** (`h.mustAnvil`, `h.anvil` with stdin for prompts),
  never by calling the API or GitHub directly, so the harness tests what users
  run.
- **Assert on contracts, not prose:** exit codes, `-json` output (declared in
  the harness's own structs, not imported, so API changes show up here), and the
  state on GitHub (`h.repo`, `h.repoHasFile`; add helpers like them for other
  systems). The CLI's wording is the unit tests' job.
- **Use `steps`** for workflows whose steps depend on each other; it stops at
  the first failure.
- **Wrap reads of external systems** that lag behind a change in `eventually`.
- **Clean up what force delete can't.** A scenario that creates something force
  delete can't remove (an AWS account) must clean it up itself, and say how in
  its doc comment.
