# Setting up a GitHub App for Anvil

A GitHub App is Anvil's own identity on GitHub, and the preferred way to run
a deployed `anvil server`. Anvil signs in as the App and uses short-lived
installation tokens for everything it does on GitHub. The App owns the
repositories it creates, its commits show up as `<app-name>[bot]`, and no
person's token sits on the server or ends up as the admin of every service
repository.

A dev server (`go run ./cmd/anvil server`) doesn't need an App: it acts as
your `gh auth token`.

**You need:** to be an **owner of the GitHub organization** (`Laratechs`, or
whatever `github.organization` names), to create and install the App.
**You'll finish with:** a running server acting as the App, checked with a
throwaway service.

## What the App is used for

The App is Anvil's only GitHub identity. Anvil mints an installation token
from it and hands that token to everything that talks to GitHub:

| Who | Calls |
| --- | --- |
| **Anvil itself** (`internal/github`) | Checks whether a repository name is taken; tries to delete a service's ghcr.io image on `-force` (the App can't; see **Packages** below) |
| **git** | Fetches a `git::` catalog and `git::` module sources |
| **Terraform** (GitHub provider) | Creates, updates, archives and deletes repositories, writes managed files and Actions variables, reads the template repository |

Installation tokens last an hour. Anvil caches one and fetches a new one
when less than 30 minutes are left, and each Terraform command (`init`,
`apply`, `output`) gets its own token as `GITHUB_TOKEN`. Anvil blanks
`GITHUB_APP_*` in Terraform's environment, so nothing else in the server's
environment can make Terraform act as someone else.

The App is not how people sign in. Requesters sign in with the organization's
identity provider ([Setting up sign-in with Okta](okta.md)), and Anvil never
receives a GitHub token from them.

## 1. Create the App

Go to **Organization settings → Developer settings → GitHub Apps → New GitHub
App** (`https://github.com/organizations/<org>/settings/apps/new`) and fill
in:

| Field | Value |
| --- | --- |
| GitHub App name | `anvil-laratechs` (it must be unique across GitHub; commits appear as `<name>[bot]`) |
| Homepage URL | `https://github.com/Laratechs/anvil` |
| Callback URL, Setup URL | Leave empty |
| Request user authorization (OAuth) during installation | Off |
| Webhook → Active | **Off**. Anvil doesn't receive webhooks. |
| Where can this GitHub App be installed? | **Only on this account** |

## 2. Set permissions

Grant exactly these and leave everything else at **No access**:

| Permission | Access | Why |
| --- | --- | --- |
| Repository → **Administration** | Read and write | Create repositories from the template, set their settings, archive and unarchive them, and delete them on `-force` |
| Repository → **Contents** | Read and write | Write managed files (CI, lint config) and seed the app code; read kept-in-sync files from the template repository; fetch a `git::` catalog and modules |
| Repository → **Workflows** | Read and write | Commit `.github/workflows/ci.yml`. Without it GitHub rejects that commit with a `404`. |
| Repository → **Variables** | Read and write | Set Actions variables such as `ANVIL_IMAGE` and cloud exports |
| Repository → **Metadata** | Read-only | Required by GitHub for every App; also lets Anvil check whether a repository name is taken |

**Packages: none, by design.** A service's image (`ghcr.io/<org>/<service>`)
outlives its repository, and while it exists a new service with the same
name can't publish (the package still belongs to the deleted repository).
The App can't delete it: GitHub has no App permission for packages, and
answers an installation token with `404`. Anvil doesn't hold another
token for this, because a long-lived classic token with `delete:packages`
isn't worth the attack surface for a cleanup step. So with the App, every
`-force` delete ends with a `!` warning and the command to finish by hand,
with a token that has the `read:packages` and `delete:packages` scopes (an
organization owner's, for a package whose repository is gone):

```
gh auth refresh -s read:packages,delete:packages
gh api -X DELETE orgs/<org>/packages/container/<service>
```

A dev server, which acts as your `gh auth token`, deletes the image itself
if your token has those scopes.

This matches what Anvil and the Laratechs catalog's `github-repository`
component do. If your catalog adds GitHub resources (branch protection,
rulesets, environments, secrets), add the permissions they need here first.
The provider's errors are `403`s or `404`s naming the endpoint.

Under **Subscribe to events**, leave everything unchecked. Then click
**Create GitHub App**.

## 3. Note the App ID and generate a private key

On the App's **General** page:

1. Copy the **App ID** (a number) or the **Client ID** (`Iv23…`). Either is
   `ANVIL_GITHUB_APP_ID`.
2. Under **Private keys**, click **Generate a private key**. GitHub downloads
   a `.pem` file once. Put it straight into your secret store (step 5), and
   then delete the downloaded copy.

## 4. Install the App on the organization

On the App's page, open **Install App**, choose the organization, and pick
**All repositories**.

Choose **All repositories**, not a selection. Anvil creates new repositories
all the time, and it also needs to read the template repositories the
catalog offers (`Laratechs/anvil-template-go` and the others), a private
`git::` catalog, and
repositories created before the App existed.

Anvil finds the installation on the organization (`github.organization`)
by itself. To pin it, note the trailing number of
`https://github.com/organizations/<org>/settings/installations/<id>`, where
the browser lands after installing, and set it as `installation_id` in the
`app` block (step 6).

If the template repository lives in another organization, it must be public:
Anvil's token covers only the installation on its own organization.

## 5. Store the private key

`private_key_file` (step 6) is the **path** to the key, in the
`.pem` form GitHub downloads (PKCS #8 works too). Keep the key in a secret
store and mount it as a file.

For a server on GCP, keep it in Secret Manager:

```
gcloud secrets create anvil-github-app-key --data-file=anvil-laratechs.2026-11-04.private-key.pem
rm anvil-laratechs.2026-11-04.private-key.pem
```

Then give the server's service account `roles/secretmanager.secretAccessor`
on that secret, and mount it as a file (Cloud Run's
`--set-secrets=/secrets/github-app.pem=anvil-github-app-key:latest`, or the
equivalent for your runtime). Don't commit the key or put it in `.envrc`
for a shared machine.

## 6. Configure the server

In the server's configuration file:

```hcl
# /etc/anvil/anvil.hcl
github {
  organization = "Laratechs"

  app {
    id               = "123456"                  # step 3
    private_key_file = "/secrets/github-app.pem" # step 5
    # installation_id = 7654321                  # step 4, optional
  }
}
```

```
anvil server -config=/etc/anvil/anvil.hcl -data-dir=/var/lib/anvil
```

The same values can come from `ANVIL_GITHUB_ORG`, `ANVIL_GITHUB_APP_ID`,
`ANVIL_GITHUB_APP_PRIVATE_KEY_FILE` and `ANVIL_GITHUB_APP_INSTALLATION_ID`,
which win over the file.

Don't set `ANVIL_GITHUB_TOKEN`: Anvil has one GitHub identity, and refuses to
start with both. `GITHUB_TOKEN` and `GITHUB_APP_*` are ignored when an App is
configured; Anvil warns at startup if `GITHUB_APP_*` is set.

At startup Anvil mints a token, so a wrong ID, key or installation stops it
right away with GitHub's error. When it works, the log says:

```
{"msg":"acting on GitHub as a GitHub App","app":"123456","installation":7654321,"org":"Laratechs"}
```

## 7. Verify

With the server running, create a throwaway service, check it, then delete
it:

```
anvil service create anvil-app-check
anvil service get anvil-app-check
anvil service delete -force anvil-app-check
gh api -X DELETE orgs/<org>/packages/container/anvil-app-check   # the command the warning prints
```

Check that:

- The repository's commits are authored by `<app-name>[bot]`, not by a person.
- The repository has `.github/workflows/ci.yml` (Workflows permission) and the
  `ANVIL_IMAGE` Actions variable (Variables permission).
- The force delete removed the repository and ended with the `!` warning
  about the image (see **Packages** in step 2).

If an apply fails, the operation and the service's `Ready` condition carry
Terraform's error. A `403 Resource not accessible by integration` names the
missing permission. A `404` on a file under `.github/workflows/` means
Workflows is missing.

## Switching an existing server from a token to the App

Terraform state doesn't record which credential created a resource, so
switching is a configuration change only. Add the `github { app { ... } }`
block (step 6), unset `ANVIL_GITHUB_TOKEN`, and restart.
The next apply of each service runs as the App. Then revoke the old token.

Existing repositories keep their history, and new managed-file commits come
from the App. The person whose token created them stays a repository admin
until you remove them.

## Rotating the private key

An App can have several active keys, so rotation needs no downtime:

1. Generate a new private key on the App's General page.
2. Add it as a new version of the secret and restart the server.
3. After one apply succeeds, delete the old key on the App's page and disable
   the old secret version.

If a key leaks, delete it on the App's page first. Tokens already minted
from it keep working until they expire, within the hour; to cut them off at
once, suspend the installation.

## Known limitations

- **Long Terraform commands.** Each Terraform command gets a token valid for
  at least 30 minutes. A single `apply` that runs longer than that can fail
  with a `401` partway through. Repeating the request retries from where
  Terraform stopped, with a fresh token.
- **One organization.** Anvil's token covers only the installation on
  `ANVIL_GITHUB_ORG`, so templates, catalogs and modules in other
  organizations must be public.
- **Broad installation.** Installing on all repositories lets the App
  administer every repository in the organization, not only Anvil's. GitHub
  Apps can't be limited to repositories that don't exist yet.
- **Restart to rotate.** Anvil reads the key at startup, so a new key takes
  effect on restart.
