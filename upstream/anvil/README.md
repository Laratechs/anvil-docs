# Anvil

Anvil is the Laratechs Internal Developer Platform. Today it covers the
**minimally managed** scenario:

- An engineer asks for a new service with a name.
- Anvil creates a GitHub repository with a working Go app and CI that
  publishes a versioned container image.
- Optionally, Anvil also gives the service a **Cloud Run service** in the
  organization's shared GCP project, which its CI deploys to
  ([Running services on Cloud Run](docs/gcp.md)), or an **AWS account**.

Services have no owner: they belong to the organization, and any active
member can create, change or archive any of them. Anvil grants no team
access; organization members reach repositories through the org's base
permission, and cloud access is managed outside Anvil.

Anvil itself is a thin wrapper, and a single `anvil` binary. `anvil server`
runs the API and a pool of workers, and the other commands send it requests.
The server validates and authorizes requests, records them, and **Terraform
provisions everything**. Each service is its own Terraform root module with
its own state, so every repository setting, file and cloud
resource is tracked and can be re-applied.

Anvil's engine does not know what a service or a cloud is made of. That
comes from a **catalog**: its definitions name the Terraform modules a
service and each cloud are built from, the settings they need, and what they
report back. Every server names its catalog, pinned to a revision, with
`catalog.source` in its configuration file; the Laratechs catalog is
[Laratechs/anvil-catalog](https://github.com/Laratechs/anvil-catalog).
New repositories are created from a **GitHub template
repository** the catalog names (by default
[Laratechs/anvil-template-go](https://github.com/Laratechs/anvil-template-go)).
The **[catalog contract](docs/catalog-contract.md)** is the contract
between Anvil and a catalog: what a catalog may declare and rely on.

## Documentation

The documentation is published at <https://laratechs.github.io/anvil-docs/>,
from the files below. Its source is
[Laratechs/anvil-docs](https://github.com/Laratechs/anvil-docs), which
decides what's published and where; the words live here, beside the code.

| For | Read |
| --- | --- |
| Everyone | [How Anvil works](docs/how-it-works.md), the [glossary](CONTEXT.md), [Decisions and known limitations](docs/decisions.md), [How Anvil is tested](docs/testing.md) |
| Engineers using Anvil | [Using the CLI](docs/cli.md), [Running services on Cloud Run](docs/gcp.md), [HTTP API](docs/api.md) |
| Platform engineers running Anvil | [Running the server](docs/server.md), the [configuration file](anvil.example.hcl), [Setting up a GitHub App](docs/github-app.md), [Setting up Cloud Run](docs/gcp-setup.md), [Releases and upgrades](docs/releases.md) |
| Catalog authors | The [catalog contract](docs/catalog-contract.md), [Testing a catalog](docs/testing.md#testing-a-catalog), the [changelog](CHANGELOG.md) |
| Contributors | [Layout](#layout), [Development](#development), the [validation harness](e2e/README.md) |

## Layout

| Path | What it is |
| --- | --- |
| `cmd/anvil` | CLI. `commands.go` holds the command tree and its help text |
| `internal/server` | `anvil server`: configuration from the environment, wiring, recovery on start, graceful shutdown |
| `internal/api` | HTTP API |
| `internal/resource` | Resources (service, cloud), merge rules, lifecycle transitions and phase |
| `internal/operation` | Operation records |
| `internal/store` | State behind compare-and-swap writes; `File` keeps it in the data directory |
| `internal/provision` | Request pipeline (validate → authorize → admit → merge → queue) and `Reconcile`, which renders and applies |
| `internal/dispatch` | Service queue and worker pool, with a lease per service |
| `internal/service` | Request type and naming rules |
| `internal/github` | Anvil's GitHub identity (a GitHub App minting installation tokens, or a dev token) and a read-only client: requester identity, organization membership, name checks |
| `internal/catalog` | Fetches and pins the catalog, checks settings against its definitions, and generates each service's root module (`main.tf.json`) |
| `internal/terraform` | Runs the `terraform` CLI and reports its progress |
| `e2e` | The validation harness: scenarios run against the real binary, Terraform and GitHub ([e2e/README.md](e2e/README.md)) |
| `docs` | The documentation, published to the documentation site (below) |

## Development

```
go test ./...         # unit and contract tests, and the docs' links (no network)
golangci-lint run ./...
ANVIL_E2E=1 go test ./e2e/ -v -timeout 30m
                      # the validation harness: the real binary, Terraform and GitHub;
                      # creates and deletes e2e-* repositories (see e2e/README.md);
                      # tests the catalog in ../anvil-catalog unless ANVIL_E2E_CATALOG
                      # names another
make docs-check       # build the documentation site from this checkout (../anvil-docs)
make docs-publish     # mirror main's docs into ../anvil-docs and commit (CI does this on main)
```

[How Anvil is tested](docs/testing.md) explains what each layer is for.
Documentation changes land with the code they describe; see
[Publishing the docs](#publishing-the-docs).

## Publishing the docs

The documentation site is built from a mirror of this repository's docs
in [Laratechs/anvil-docs](https://github.com/Laratechs/anvil-docs), at
`upstream/anvil/`. Every push to `main` that changes docs publishes them:
the `publish-docs` workflow runs `make docs-publish` and pushes the mirror
to `anvil-docs`, whose `main` deploys the site. It pushes with a deploy key
on `anvil-docs`, the `ANVIL_DOCS_DEPLOY_KEY` secret; to set one up or
rotate it:

```
ssh-keygen -t ed25519 -N '' -C 'anvil publish-docs' -f anvil-docs-deploy
gh repo deploy-key add anvil-docs-deploy.pub --repo Laratechs/anvil-docs --title 'anvil publish-docs' --allow-write
gh secret set ANVIL_DOCS_DEPLOY_KEY --repo Laratechs/anvil < anvil-docs-deploy
rm anvil-docs-deploy anvil-docs-deploy.pub
```

To rotate, add the new key first, then delete the old one
(`gh repo deploy-key list --repo Laratechs/anvil-docs`, then
`gh repo deploy-key delete <id> --repo Laratechs/anvil-docs`).
`gh workflow run publish-docs --repo Laratechs/anvil` republishes `main`
without a change, such as after `anvil-docs` maps a new file.

By hand, as the workflow does, from a checkout of `main` with `anvil-docs`
beside it:

```
make docs-publish     # checks the docs, mirrors HEAD's, builds the site, commits in ../anvil-docs
git -C ../anvil-docs push
``` Mirrored files are
public, whole, even sections the site doesn't show, so keep internal links
and names out of them; `go test ./...` refuses the ones it knows. Set
`ANVIL_DOCS` to use a checkout somewhere else.
