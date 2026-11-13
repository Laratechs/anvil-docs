# Anvil

Anvil is the Laratechs Internal Developer Platform. Ask it for a service by
name and it gives you a GitHub repository with a working Go app, CI that
publishes a versioned container image, and, if you want, somewhere to run it:

```
anvil service create -deploy orders
```

That one command:

- creates the `orders` repository from a template, with CI that builds and
  publishes an image on every merge;
- gives the service a **deployment**, by default a Cloud Run service in the
  shared GCP project the platform team runs
  ([Running services on Cloud Run](docs/gcp.md));
- waits for CI to deploy it, and prints the URL.

Leave out `-deploy` for a repository and CI alone. A service that wants to own
its infrastructure asks for a **self-managed** deployment instead, an empty GCP
project of its own ([self-managed projects](docs/gcp-setup.md#self-managed-projects)),
and a service on the platform can attach **add-ons** such as a PostgreSQL
database. Repeating any request is safe: each one describes the state you
want, and Anvil converges on it.

Services have no owner. They belong to the organization, and any active member
can create, change or archive any of them. Anvil grants no team access:
members reach repositories through the organization's base permission, and
cloud access is managed outside Anvil.

**How it's built.** Anvil is one `anvil` binary. `anvil server` runs the API
and a pool of workers, and the other commands send it requests. The server
validates, authorizes and records each request, and **Terraform provisions
everything**: each service is its own Terraform root module with its own
state, so every repository setting, file and cloud resource is tracked and can
be re-applied.

**Where the definitions live.** Anvil's engine doesn't know what a service or a
cloud is made of. A **catalog** says: its definitions name the Terraform
modules a service and each deployment are built from, the settings they need,
and what they report back. Every server pins its catalog with `catalog.source`
in its configuration file. The Laratechs catalog is
[Laratechs/anvil-catalog](https://github.com/Laratechs/anvil-catalog), and new
repositories come from the GitHub template repository it names
([Laratechs/anvil-template-go](https://github.com/Laratechs/anvil-template-go)
by default). The [catalog contract](docs/catalog-contract.md) is the
agreement between the two: what a catalog may declare and rely on.

## Where to start

The documentation is published at <https://laratechs.github.io/anvil-docs/>
from the files below. The site's source is
[Laratechs/anvil-docs](https://github.com/Laratechs/anvil-docs), which decides
what is published and where; the words live here, beside the code.

| If you are… | Read |
| --- | --- |
| **New to Anvil** | [How Anvil works](docs/how-it-works.md), the [glossary](CONTEXT.md), then [Decisions and known limitations](docs/decisions.md) |
| **An engineer using Anvil** | [Using the CLI](docs/cli.md), [Running services on Cloud Run](docs/gcp.md), the [HTTP API](docs/api.md) |
| **A platform engineer running Anvil** | [Running the server](docs/server.md), the [configuration file](anvil.example.hcl), [Setting up a GitHub App](docs/github-app.md), [Setting up sign-in with Okta](docs/okta.md), [Setting up Cloud Run](docs/gcp-setup.md), [Releases and upgrades](docs/releases.md) |
| **A catalog author** | The [catalog contract](docs/catalog-contract.md), [Testing a catalog](docs/testing.md#testing-a-catalog), the [changelog](CHANGELOG.md) |
| **A contributor** | [Layout](#layout), [Development](#development), [How Anvil is tested](docs/testing.md), the [validation harness](e2e/README.md) |

## Layout

| Path | What it is |
| --- | --- |
| `cmd/anvil` | The CLI. `commands.go` holds the command tree and its help text |
| `internal/server` | `anvil server`: configuration, wiring, recovery on start, graceful shutdown |
| `internal/api` | The HTTP API |
| `internal/resource` | Resources (service, deployment), merge rules, lifecycle transitions and phase |
| `internal/operation` | Operation records |
| `internal/store` | State behind compare-and-swap writes; `File` keeps it in the data directory |
| `internal/provision` | The request pipeline (validate → authorize → admit → merge → queue) and `Reconcile`, which renders and applies |
| `internal/dispatch` | Service queue and worker pool, with a lease per service |
| `internal/service` | Request type and naming rules |
| `internal/github` | Anvil's GitHub identity (a GitHub App minting installation tokens, or a dev token) and a read-only client: requester identity, organization membership, name checks |
| `internal/auth` | Sign-in configuration; `authtest` is a fake issuer for tests |
| `internal/signin` | The CLI's sign-in: the OAuth device flow against the issuer |
| `internal/credentials` | The CLI's credentials file |
| `internal/catalog` | Fetches and pins the catalog, checks settings against its definitions, and generates each service's root module (`main.tf.json`) |
| `internal/terraform` | Runs the `terraform` CLI and reports its progress |
| `e2e` | The validation harness: scenarios run against the real binary, Terraform and GitHub ([e2e/README.md](e2e/README.md)) |
| `docs` | The documentation, published to the documentation site |

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
Documentation changes land with the code they describe.

## Publishing the docs

The site is built from a mirror of this repository's docs in
[Laratechs/anvil-docs](https://github.com/Laratechs/anvil-docs), at
`upstream/anvil/`. Every push to `main` that changes docs publishes them: the
`publish-docs` workflow runs `make docs-publish` and pushes the mirror to
`anvil-docs`, whose `main` deploys the site.

Mirrored files are public, whole, even the sections the site doesn't show. Keep
internal links and names out of them; `go test ./...` refuses the ones it
knows. A page's path is part of the site's structure (`site.structure.mjs` in
`anvil-docs`), so moving or renaming a doc, or a heading the site maps, means
changing that file too.

To publish by hand, as the workflow does, from a checkout of `main` with
`anvil-docs` beside it (set `ANVIL_DOCS` to use a checkout elsewhere):

```
make docs-publish     # checks the docs, mirrors HEAD's, builds the site, commits in ../anvil-docs
git -C ../anvil-docs push
```

`gh workflow run publish-docs --repo Laratechs/anvil` republishes `main`
without a change, such as after `anvil-docs` maps a new file.

The workflow pushes with a write deploy key on `anvil-docs`, stored as the
`ANVIL_DOCS_DEPLOY_KEY` secret. To set one up:

```
ssh-keygen -t ed25519 -N '' -C 'anvil publish-docs' -f anvil-docs-deploy
gh repo deploy-key add anvil-docs-deploy.pub --repo Laratechs/anvil-docs --title 'anvil publish-docs' --allow-write
gh secret set ANVIL_DOCS_DEPLOY_KEY --repo Laratechs/anvil < anvil-docs-deploy
rm anvil-docs-deploy anvil-docs-deploy.pub
```

To rotate, run the same commands to add the new key, then delete the old one
(`gh repo deploy-key list --repo Laratechs/anvil-docs`, then
`gh repo deploy-key delete <id> --repo Laratechs/anvil-docs`).
