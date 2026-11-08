# How Anvil is tested

Anvil is a thin layer between people, GitHub, Terraform and a catalog.
Most of what can go wrong happens where those meet, so Anvil is tested in
layers. Each layer checks a boundary the one below it can't see, and the
cheap layers run on every change.

| Layer | What it checks | Runs against | When |
| --- | --- | --- | --- |
| [Unit tests](#unit-tests) | Anvil's own logic: merge rules, lifecycle, the request pipeline, the API, configuration | Fakes for GitHub and Terraform | `go test ./...`, every change |
| [Contract tests](#contract-tests) | Anvil's side of the [catalog contract](catalog-contract.md): the root modules it generates really apply | Real Terraform, a fixture catalog with no providers | `go test ./...`, every change |
| [Catalog content tests](#testing-a-catalog) | What a catalog's definitions build | `anvil catalog render`, real providers, mocked | The catalog's `tests/run.sh`; Anvil's CI on every change and nightly |
| [Validation harness](#validation-harness) | User workflows end to end | The real binary, Terraform, GitHub and clouds | `ANVIL_E2E=1`, before landing a change to something a user does |

## Principles

- **Test workflows, not functions, at the top.** The harness drives
  Anvil through the CLI, the way an engineer or operator does. It never
  calls the API or GitHub directly, so it tests what people run.
- **Assert on contracts, not prose.** Tests check exit codes, `-json`
  output, API status codes and the state on GitHub: the things scripts
  and other tools depend on. Wording belongs to unit tests, so rewording a
  message never breaks the harness.
- **Repeating a request is a test case.** Requests describe desired
  state, so most scenarios send the same request again and check that
  nothing changed: no new operation, no new generation, no Terraform run.
- **Upgrades converge with no changes.** `TestUpgrade` builds the last
  release, creates a service with it, and hands the same data to the new
  server. The repeated request must apply with nothing to add, change or
  destroy. That catches moved state, lost settings and broken migrations
  before a release does.
- **Each side of a contract tests its own side.** Anvil tests that
  whatever a catalog declares renders and applies. A catalog tests what
  its own definitions build. Neither needs the other's internals.
- **A change and its scenario land together.** A change that adds or
  changes something a user does extends the harness in the same commit.
- **Clean up only what you created.** Harness scenarios get names from the
  harness, remove them even when they fail, and never touch anything else.
- **The code wins.** Where a document and the code disagree, the
  document is the bug. The docs are checked too: see
  [Checking the docs](#checking-the-docs).

## Unit tests

```
go test ./...
golangci-lint run ./...
```

Unit tests use fakes for GitHub and Terraform (`internal/provision/provisiontest`)
and need no network or credentials. CI runs them with `-race`, because the
dispatcher and worker pool are concurrent.

## Contract tests

The contract tests check Anvil's side of the catalog contract with a
fixture catalog, `internal/catalog/testdata/contract`, whose components
use only `terraform_data`. They need Terraform on your `PATH`, but download
no providers and create nothing. Anvil generates a root module from the
fixture, applies it, checks that clouds are wired in, exports reach the
service and status outputs have the shape the CLI reads, then destroys it
with the teardown root. They run as part of `go test ./...` and are
skipped when Terraform isn't installed.

## Testing a catalog

A catalog tests what its definitions build. The Laratechs catalog,
[Laratechs/anvil-catalog](https://github.com/Laratechs/anvil-catalog),
does it with `tests/run.sh`: for each case, `anvil catalog render`
generates a service's root module, and `terraform validate` and
`terraform test` run on it with mock providers. That needs no
credentials and creates nothing, but downloads the real providers.

Anvil's CI runs those tests with the Anvil under test against the catalog
tag servers run, on every change, and against the catalog's `main`
nightly. A change on either side that breaks the other shows up before it
is released.

To run a catalog against the real thing, point the validation harness at
it with `ANVIL_E2E_CATALOG` (see below).

## Validation harness

```
ANVIL_E2E=1 go test ./e2e/ -v -timeout 30m
```

The harness builds the `anvil` binary, starts `anvil server` with its own
data directory, runs CLI commands, and checks what really changed on
GitHub and in the cloud. It catches what only shows up against the real
thing: Terraform providers, GitHub's API, the template repository, the
catalog and the binary's wiring. It creates and deletes real
repositories, so it runs only when asked, never in `go test ./...`.

Scenarios run against one of two catalogs: the catalog under test, for
what a real catalog builds, and a small engine catalog with no providers,
for what Anvil itself does (bindings, migrations, catalog loading). The
[validation harness reference](../e2e/README.md) lists every scenario,
what it protects, and the rules for adding one.

## Checking the docs

`go test ./...` also checks the Markdown that can be published to the
documentation site:

- Every relative link points at a file that exists, and every `#anchor`
  at a heading in it.
- Nothing names an internal host, address or project. The published site
  is public.

`make docs-check` builds the documentation site from this checkout, which
catches a page the site maps that was moved or renamed.
