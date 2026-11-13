# Running the server

`anvil server` runs the API and a pool of workers. It needs **Terraform 1.6+**
and **git** on its `PATH`, and a **catalog**. Everything else has a default.

## Try it locally

In a checkout, with the GitHub CLI signed in and
[Laratechs/anvil-catalog](https://github.com/Laratechs/anvil-catalog) cloned
beside it:

```
ANVIL_CATALOG=../anvil-catalog go run ./cmd/anvil server
```

A dev server acts as your `gh auth token` and keeps records and Terraform state
in the `.anvil` directory. It creates repositories with CI. To offer
deployments such as Cloud Run, create a cloud binding
([below](#settings-bindings-and-options)).

## Deploy it

A deployed server has its own GitHub identity, a
[GitHub App](github-app.md), and a state bucket. Describe them in an HCL file:

```hcl
# /etc/anvil/anvil.hcl
data_dir = "/var/lib/anvil"

github {
  app {
    id               = "123456" # see github-app.md
    private_key_file = "/secrets/github-app.pem"
  }
}

catalog {
  source = "git::https://github.com/Laratechs/anvil-catalog.git?ref=v0.3.0"
}

terraform {
  state {
    bucket = "anvil-state"
  }
}
```

```
go install github.com/Laratechs/anvil/cmd/anvil@latest
anvil server -config=/etc/anvil/anvil.hcl
```

**[anvil.example.hcl](../anvil.example.hcl)** lists every attribute with its
default. The file is the preferred way to configure the server: it is one
reviewable, version-controlled description of the server. The server refuses to
start on an unknown attribute or block, naming the line, so a typo can't
silently fall back to a default.

How the server reads configuration:

- Relative paths in the file are relative to the file.
- Every attribute can also be set with an environment variable, which wins
  over the file (the server logs a note for each one it overrides). `-listen`
  and `-data-dir` win over both.
- The file holds no secrets. Anvil's GitHub identity in it is the App's ID and
  the *path* to its key. The one secret-valued setting, `ANVIL_GITHUB_TOKEN`,
  is accepted only from the environment.

## Choose a catalog

`catalog { source = "..." }` is required: a directory, or a Git source pinned
to a tag or commit (`git::https://github.com/<org>/<catalog>.git?ref=v1.0.0`).
Anvil fetches a Git source as its own GitHub identity, so a private catalog
repository works when the GitHub App can read it.

A catalog can name the versions it works with in its `catalog.hcl`, as
Terraform version constraints:

```hcl
catalog {
  contract          = 3
  requires_anvil    = ">= 0.2.0" # Anvil releases (development builds aren't checked)
  terraform_version = "~> 1.9"   # the server's Terraform
}
```

The server refuses to start, naming the constraint and the actual version, if
either rules out what it runs; a malformed constraint fails the catalog too.
`terraform_version` is also written into each service's root module as its
`required_version`, beside Anvil's own `>= 1.6`. Both are optional.

## Settings, bindings and options

Three kinds of value reach a catalog's definitions, one per audience:

| Value | Answers | Set by | Where |
| --- | --- | --- | --- |
| **Setting** | How is this deployed, for every service? | You, the operator | The `settings "<definition>"` block in the configuration file |
| **Binding** | Where do deployments land? | You, the operator | `anvil binding create`, stored in Anvil |
| **Option** | What does this one service choose? | The requester | `-option name=value` on `anvil service create` or `deploy` |

### Settings

A `settings "<definition>"` block holds your values for one catalog
definition: `service` or `cloud_<provider>`. The definition's own `settings`
block in the catalog lists what it accepts and its defaults. The server refuses
to start if a value doesn't fit, or names a definition or attribute the catalog
doesn't declare (so a renamed setting isn't silently dropped; the error names
the file and line).

```hcl
settings "service" {
  registry = "ghcr.io/laratechs"
  template = "Laratechs/anvil-template-go"
}

settings "cloud_gcp" {
  public = false
}
```

Values are literals (strings, numbers, bools, lists and objects); there are no
variables or functions. `ANVIL_SETTINGS` can instead name a JSON file of the
same settings keyed by definition (`{"cloud_gcp": {"public": false}}`). For a
definition in both, the JSON file's entry replaces the block as a whole, with a
warning.

### Bindings

A deployment lands where a **cloud binding** says, when its definition
declares a `binding { }` block, as both of the Laratechs catalog's deployments
do. A deployment is offered only when its definition's `enabled_when` (if any)
holds and a valid binding for its provider exists:

```
anvil binding create -provider=gcp -set project_id=example-services \
  -set workload_identity_provider=projects/123456789012/locations/global/workloadIdentityPools/github/providers/laratechs gcp-shared
```

`anvil catalog show` lists which deployments are offered and what each
binding takes. [Setting up Cloud Run](gcp-setup.md) walks through the GCP
values.

### Options

Options are what one service's requester chooses for its deployment, such as
whether its Cloud Run service is public. The definition's `options` block
declares them. They are stored on the service and listed by
`anvil catalog show`. An option not chosen takes its declared default, or
`null`, which a definition can map to a setting.

## Configuration reference

| File attribute | Variable | Flag | Default | Purpose |
| --- | --- | --- | --- | --- |
| | `ANVIL_CONFIG` | `-config` | | The HCL configuration file |
| `listen` | `ANVIL_LISTEN` | `-listen` | `:8080` | Listen address |
| `data_dir` | `ANVIL_DATA_DIR` | `-data-dir` | `.anvil` | Service records, operations, tombstones, rendered Terraform and fetched catalog revisions. **Must be persistent.** MVP records are migrated as they are read. |
| `workers` | `ANVIL_WORKERS` | | `4` | How many Terraform applies run at once |
| `github.organization` | `ANVIL_GITHUB_ORG` | | `Laratechs` | Organization |
| `github.app.id` | `ANVIL_GITHUB_APP_ID` | | | ID or client ID of the [GitHub App](github-app.md) that is Anvil's GitHub identity. Preferred for any deployed server |
| `github.app.private_key_file` | `ANVIL_GITHUB_APP_PRIVATE_KEY_FILE` | | | Path to the App's private key (`.pem`) |
| `github.app.installation_id` | `ANVIL_GITHUB_APP_INSTALLATION_ID` | | the App's installation on the organization | Pins the installation |
| *(environment only)* | `ANVIL_GITHUB_TOKEN` | | `$GITHUB_TOKEN`, else `gh auth token` | Without an App, a token Anvil acts as instead (development). Not allowed together with an App |
| `auth.issuer` | `ANVIL_OIDC_ISSUER` | | | Issuer URI of the Okta authorization server engineers sign in to ([Setting up sign-in with Okta](okta.md)). Not its metadata URL. Needs `auth.client_id` |
| `auth.client_id` | `ANVIL_OIDC_CLIENT_ID` | | | Client ID of the CLI's native application at the issuer. Not a secret |
| `auth.audience` | `ANVIL_OIDC_AUDIENCE` | | `api://anvil` | Audience of the access tokens the issuer mints for Anvil |
| `catalog.source` | `ANVIL_CATALOG` | | *(required)* | The catalog: a local directory, or `git::<url>?ref=<tag or commit>`, such as `git::https://github.com/Laratechs/anvil-catalog.git?ref=v0.3.0` |
| `catalog.allow_branch` | `ANVIL_CATALOG_ALLOW_BRANCH` | | `false` | Let the catalog source name a branch (development only) |
| `terraform.binary` | `ANVIL_TERRAFORM_BIN` | | `terraform` | Terraform executable |
| `terraform.state.bucket` | `ANVIL_TF_STATE_BUCKET` | | | GCS bucket for state. Unset keeps state on local disk (development only). |
| `terraform.state.prefix` | `ANVIL_TF_STATE_PREFIX` | | `anvil/services` | State prefix; each service gets `<prefix>/<name>` |
| `settings "<definition>"` | `ANVIL_SETTINGS` (a JSON file) | | the catalog's defaults | Settings for the catalog's definitions |

Variables from earlier releases that the server no longer reads are listed in
[Releases and upgrades](releases.md#removed-configuration).

## Changing where deployments land

A deployment keeps the binding revision it was created with, so
`anvil binding update` changes nothing that is running: only deployments
created afterwards use the new revision. To bring a running service to it,
migrate the service:

```
anvil binding update -set region=europe-west1 gcp-shared
anvil service list                 # BINDING shows "gcp-shared r1 (behind r2)"
anvil service migrate orders       # shows what changes, and asks you to confirm
```

`anvil service migrate` records the binding's latest revision on the service
and applies it. Terraform changes what it can in place and replaces the rest,
and the data in a replaced stateful resource is lost, so try a change on one
service before the others. The command names the values that differ and the
deployment's stateful resources before you confirm.

Known limitations:

- **One service at a time.** There is no command for every service; loop over
  the ones `anvil service list` marks.
- **No plan preview.** The confirmation shows the binding's values, not
  Terraform's plan.
- **No way back by itself.** A failed migration leaves the service recording
  the new revision, in phase `failed`. Fix the cause and run the command
  again, or store the earlier values as a new revision and migrate to that.
- **Any organization member** can migrate, as for bindings, until Anvil has an
  operator role.

## Credentials

**GitHub.** Anvil has one GitHub identity. It uses it for its own API calls, to
fetch the catalog and `git::` modules, and in Terraform's GitHub provider
(Anvil passes it as `GITHUB_TOKEN`, fresh for each Terraform command).

- Preferably the identity is a **GitHub App** (`github.app`) with
  Administration, Contents, Workflows, Variables and Members (read)
  permissions. Anvil mints short-lived installation tokens, its commits come
  from `<app>[bot]`, and no person ends up as the admin of every repository.
  [Setting up a GitHub App](github-app.md) walks through creating, installing
  and verifying it.
- For development, a token with the `repo`, `read:org`, `workflow` and
  `delete_repo` scopes (`delete_repo` only for `-force` deletes). A server with
  a state bucket warns that it is using one. Without `workflow` (or
  Workflows), GitHub rejects the commit of `.github/workflows/ci.yml` with a
  `404`.

**Other providers** read their usual environment:

- **GCP:** Application Default Credentials for an identity with Cloud Run
  Admin, Artifact Registry Administrator, Service Account Admin and Service
  Account User on the shared project ([Cloud Run setup](gcp-setup.md)).
- **AWS:** credentials in the Organizations management account (or a
  delegated administrator) allowed to create accounts.

Requesters never get these credentials. Their own GitHub token is used only to
find out who they are.
