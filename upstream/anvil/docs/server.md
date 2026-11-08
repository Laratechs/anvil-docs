# Running the server

The server needs Terraform 1.6+ and git on its `PATH`, and a catalog.
Everything else has a default, so in a checkout, with the GitHub CLI signed
in and [Laratechs/anvil-catalog](https://github.com/Laratechs/anvil-catalog)
cloned beside it, this runs a dev server:

```
ANVIL_CATALOG=../anvil-catalog go run ./cmd/anvil server
```

In dev mode the server uses your `gh auth token` and the `.anvil` directory
for records and Terraform state.
It offers services; create a cloud binding (below) to offer Cloud Run
services or AWS accounts. A deployed server has its own GitHub identity, a GitHub App, and a
state bucket, configured in an HCL file:

```hcl
# /etc/anvil/anvil.hcl
data_dir = "/var/lib/anvil"

github {
  app {
    id               = "123456" # docs/github-app.md
    private_key_file = "/secrets/github-app.pem"
  }
}

catalog {
  source = "git::https://github.com/Laratechs/anvil-catalog.git?ref=v0.1.0"
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
reviewable, version-controlled description of the server, and the server
refuses to start on an unknown attribute or block, naming the line, so a
typo can't silently fall back to a default. Relative paths in it are
relative to the file.

Every attribute can also be set with an environment variable, which wins
over the file (the server logs a note for each one it overrides), and
`-listen` and `-data-dir` win over both. The file holds no secrets: Anvil's
GitHub identity in it is the App's ID and the *path* to its key, and the
one secret-valued setting, `ANVIL_GITHUB_TOKEN`, is accepted only from the
environment.

`catalog { source = "..." }` is required: a directory, or a Git source
pinned to a tag or commit (`git::https://github.com/<org>/<catalog>.git?ref=v1.0.0`).
Anvil fetches a Git source as its own GitHub identity, so a private catalog
repository works when the GitHub App can read it
([Setting up a GitHub App](github-app.md)). Anvil no longer builds a
catalog in: `source = "builtin"` is refused, and the same catalog is
`git::https://github.com/Laratechs/anvil-catalog.git?ref=v0.1.0`.

A catalog can name the versions it works with in its `catalog.hcl`, as
Terraform version constraints:

```hcl
catalog {
  contract          = 1
  requires_anvil    = ">= 0.2.0" # Anvil releases (development builds aren't checked)
  terraform_version = "~> 1.9"   # the server's Terraform
}
```

The server refuses to start, naming the constraint and the actual version,
if either rules out what it runs; a malformed constraint fails the catalog
too. `terraform_version` is also written into each service's root module
as its `required_version`, beside Anvil's own `>= 1.6`. Both are optional.

A `settings "<definition>"` block holds the operator's values for one
catalog definition: `service` or `cloud_<provider>`. Each definition's
`settings` block in the catalog lists what it accepts and its defaults; the
server refuses to start if a value doesn't fit, or names a definition or
an attribute the catalog doesn't declare (so a setting the catalog renamed
isn't silently dropped; the error names the file and line), for example:

```hcl
settings "service" {
  registry = "ghcr.io/laratechs"
  template = "Laratechs/anvil-template-go"
}

settings "cloud_gcp" {
  public = false
}
```

Where a provider's clouds land is a cloud binding instead, when the cloud's
definition declares a `binding { }` block, as both of the Laratechs catalog's clouds do. A
cloud is offered only when its definition's `enabled_when` (if any) holds
and, with a binding block, while a valid binding for its provider exists:

```
anvil binding create -provider=gcp -set project_id=example-services \
  -set workload_identity_provider=projects/123456789012/locations/global/workloadIdentityPools/github/providers/laratechs gcp-shared
anvil binding create -provider=aws -set email_template=aws+{service}@example.com aws-main
```

A settings attribute that the definition's binding block declares instead
(such as `project_id` in `settings "cloud_gcp"`, from before bindings)
doesn't stop the server: it is ignored, with a warning asking to remove
it and, while no valid binding for the provider exists, giving the
`anvil binding create` command that holds its value. Existing clouds
are first migrated onto a binding made from it, as described with cloud
bindings above.

Values are literals (strings, numbers, bools, lists and objects); there are
no variables or functions. The `ANVIL_SETTINGS` environment variable can
instead name a JSON file of the same settings keyed by definition
(`{"cloud_gcp": {"public": false}}`); for a definition in both, the JSON
file's entry replaces the block as a whole, with a warning.

Settings apply to every service. What one service's requester may choose
for its cloud is the definition's `options` block instead (for example
the gcp cloud's `public`), set with `-option name=value` on
`anvil service create -cloud` or `anvil cloud create`, stored on the
service, and listed by `anvil catalog show`. Definitions read them as
`options.<name>`; an option not chosen takes its declared default, or
`null`, which a definition can map to a setting.

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
| `catalog.source` | `ANVIL_CATALOG` | | *(required)* | The catalog: a local directory, or `git::<url>?ref=<tag or commit>`, such as `git::https://github.com/Laratechs/anvil-catalog.git?ref=v0.1.0` |
| `catalog.allow_branch` | `ANVIL_CATALOG_ALLOW_BRANCH` | | `false` | Let the catalog source name a branch (development only) |
| `terraform.binary` | `ANVIL_TERRAFORM_BIN` | | `terraform` | Terraform executable |
| `terraform.state.bucket` | `ANVIL_TF_STATE_BUCKET` | | | GCS bucket for state. Unset keeps state on local disk (development only). |
| `terraform.state.prefix` | `ANVIL_TF_STATE_PREFIX` | | `anvil/services` | State prefix; each service gets `<prefix>/<name>` |
| `settings "<definition>"` | `ANVIL_SETTINGS` (a JSON file) | | the catalog's defaults | Settings for the catalog's definitions |

The MVP's `ANVIL_REGISTRY`, `ANVIL_REPO_VISIBILITY` and `ANVIL_AWS_*`
variables are no longer read: the server refuses to start while one is
set, naming the setting that replaces it (`ANVIL_REGISTRY` is
`settings "service" { registry }`, `ANVIL_AWS_PARENT_ID` is
`parent_id` of an aws binding, `ANVIL_AWS_REGION` is the `region` of
an aws binding, and so on; see the
[changelog](../CHANGELOG.md)).
`ANVIL_GCP_FOLDER_ID`, `ANVIL_GCP_ORG_ID`, `ANVIL_GCP_BILLING_ACCOUNT` and
`ANVIL_GCP_APIS` configured a GCP project per service, which Anvil no longer
creates, and are ignored with a warning. `ANVIL_GCP_MEMBER_TEMPLATE`,
`ANVIL_GCP_ROLES`, `ANVIL_AWS_GROUP_TEMPLATE` and
`ANVIL_AWS_PERMISSION_SET_ARNS` are gone with team access, and are ignored.

## Credentials

- **GitHub:** Anvil has one GitHub identity, used for its own API calls, to
  fetch the catalog and `git::` modules, and by Terraform's GitHub provider
  (Anvil passes it as `GITHUB_TOKEN`, fresh for each Terraform command).
  Preferably that identity is a GitHub App (`github.app`) with
  Administration, Contents, Workflows, Variables and Members (read)
  permissions: Anvil mints short-lived installation tokens, its commits come
  from `<app>[bot]`, and no person ends up as the admin of every repository.
  **[Setting up a GitHub App](github-app.md)** walks through creating,
  installing and verifying it. Otherwise, for development, a token with the
  `repo`, `read:org`, `workflow` and `delete_repo` scopes (`delete_repo` only
  for `-force` deletes); a server with a state bucket warns that it is using
  one. Without `workflow` (or Workflows), GitHub rejects the commit of
  `.github/workflows/ci.yml` with a `404`.

The other providers read their usual environment:

- **GCP:** Application Default Credentials for an identity with Cloud Run
  Admin, Artifact Registry Administrator, Service Account Admin and Service
  Account User on the shared project ([Cloud Run setup](gcp-setup.md)).
- **AWS:** credentials in the Organizations management account (or a
  delegated administrator) allowed to create accounts.

Requesters never get these credentials. Their own GitHub token is used only
to find out who they are.

