# Decisions and known limitations

The choices that shape what Anvil does today, and what it doesn't do yet.
Anvil is before 1.0, so some of these will change; the
[changelog](../CHANGELOG.md) records each change. The
[roadmap](roadmap.md) says what is left before 1.0.

## Decisions

- **Requests describe desired state.** Every request says what you want, not
  what to do, so repeating one is always safe
  ([How Anvil works](how-it-works.md#idempotency)).
- **Terraform provisions everything.** Each service is its own Terraform root
  module with its own state, so every repository setting, file and cloud
  resource is tracked and can be re-applied.
- **The engine and the catalog are separate.** Anvil doesn't know what a
  service or a deployment is made of. A catalog does, and the
  [catalog contract](catalog-contract.md) is the only interface between them.
- **Request interface:** the CLI and the HTTP API. A portal or a GitHub issue
  form can sit on top of the API later.
- **Ownership:** services have no owning team; they belong to the
  organization. Any developer may create, change, archive or restore any
  service.
- **Roles:** viewer, developer and admin, organization-wide, from two groups
  at the identity provider. Anvil declares what each may do; the catalog
  doesn't. Everyone signed in may read. Admins, meant to be the platform
  team, are the only ones who manage bindings, migrate services and
  permanently delete them. There are no per-service or per-team
  permissions. A change of groups takes effect at the next token, within the
  access token's lifetime.
- **Identity:** engineers sign in with the organization's identity provider
  (Okta), and Anvil accepts only access tokens minted for it. It never
  receives a credential that works anywhere else, such as a GitHub token,
  holds no sign-in secret and keeps no sessions. A token works until it
  expires (an hour by default), so removing someone's access takes effect
  then. Only people sign in: there are no machine callers yet. The CLI keeps
  its credentials in a file only the user can read, not in the operating
  system's keychain, and the access token is a bearer token: a copy works
  until it expires.
- **Naming:** 3–25 characters, lowercase letters, digits and single hyphens,
  starting with a letter. A few generic names are reserved.
- **CI and registry:** GitHub Actions, with one shared registry
  (`ghcr.io/<organization>/<service>`) and the short-lived `GITHUB_TOKEN`.
  Images are tagged `0.1.<run>`, `sha-<commit>` and `latest`, and carry a
  BuildKit SBOM and provenance record. Signed GitHub artifact attestations are
  left out because private repositories need GitHub Enterprise Cloud for them.
- **Boilerplate updates:** managed files (CI, lint config) are re-applied from
  the catalog's templates on every apply, so platform changes reach existing
  services. App code is seeded once and never overwritten.
- **Where services run:** optional, and a service has one deployment whose type
  can't change ([#36](https://github.com/Laratechs/anvil/issues/36)).
  - **Platform-managed** (the default): a Cloud Run service per service, in one
    shared GCP project the platform team runs. Anvil provisions the slot and the
    identities. The service's CI pushes to its own Artifact Registry repository
    and deploys, authenticated by GitHub OIDC with no stored keys.
  - **Self-managed:** a cloud of the service's own, such as an empty GCP
    project. A project per service is offered only this way: scaffolding one for
    every service was far more than the workflow needs.
  - Anvil starts a platform service's first CI run by committing CI's settings,
    and the CLI waits for it, so `anvil service create -deploy` ends with a URL
    serving the new repository's code.
- **Add-ons:** extra infrastructure on a platform-managed deployment, the first
  being a PostgreSQL database ([#42](https://github.com/Laratechs/anvil/issues/42)).
  - One instance per binding is shared, and each service gets a tenant of its
    own: a database and a role only its runtime identity can use, with no
    password.
  - The instance has a record and a Terraform state of its own; each tenant
    stays in its service's state. Anvil creates the instance with the first
    tenant and deletes it with the last, counting tenants from service records
    rather than storing a count.
  - Archiving a service with an add-on is refused, since a restore couldn't
    bring the data back. A force delete or a detach deletes the tenant and says
    so.
  - Self-managed services build their own.

## Known limitations

### Using Anvil

- **A deployment's type is fixed.** A service can't move between the platform
  and a cloud of its own.
- **A service with its own cloud can't be archived.** An archive tears a
  deployment down, and restoring couldn't bring back what the team built in a
  project of its own, so `anvil service delete` refuses it. Only `-force`
  deletes the project, with everything in it, after a warning that says so. An
  AWS account is never deleted by Anvil.
- **Cloud Run.** Services are public (anyone with the URL can call them) unless
  they choose `-option public=false` or the operator sets `cloud_gcp.public` to
  `false`. Their runtime account starts with no roles, and settings other than
  the image are Anvil's. See
  [Running services on Cloud Run](gcp.md#known-limitations) and
  [Cloud Run setup](gcp-setup.md#known-limitations).
- **No branch protection.** Service repositories get no branch protection or
  required code owner review, which GitHub offers private repositories only on
  paid plans, so a pull request can be merged with failing CI. A catalog for an
  organization on such a plan can add it to its repository component.
- **Commit noise.** The GitHub provider writes one commit per file, so a new
  repository starts with about 10 small commits and applies run with
  `-parallelism=1`. One of them, `.github/anvil-ci.env`, is there on purpose:
  Anvil commits it whenever it changes CI's Actions variables, so CI runs with
  them.
- **Services created with a team.** Services provisioned before teams were
  removed lose their team repository access, CODEOWNERS file, `anvil-team-*`
  topic, and cloud team IAM bindings and labels on their next apply, because
  the catalog no longer declares them. Regrant access by hand if needed. Their
  stored records keep a `team` key, which Anvil ignores.

### Running Anvil

- **Single instance.** State lives in the data directory, and leases are held
  in memory, so run one `anvil server` with a persistent data directory.
  Terraform's state lock still guards against two servers applying at once. A
  shared store, with separate API and worker roles, is planned to remove this
  limit.
- **No automatic retries.** A failed apply waits for someone to repeat the
  request.
- **Images outlive force-deleted services.** The GitHub App can't delete a
  service's ghcr.io image, and Anvil deliberately holds no other token that
  could. Until someone deletes it by hand (the delete's warning has the
  command), a new service with the same name can't publish or deploy.
- **Anvil reaches add-on instances over the network.** A tenant's database and
  role are created over a SQL connection from the Anvil server, because the
  provider's API alone can't keep one tenant out of another's database. The
  server needs network access to each instance.
- **Add-on instances aren't migrated.** An instance keeps the binding revision
  it was created with until its last tenant leaves; nothing moves it to a newer
  one.
- **AWS is off.** The catalog keeps its AWS account definition, but Anvil
  offers it only while an aws binding exists, and none should be created until
  AWS is taken up again.

### Building a catalog

- **Catalog contract 2 is still read.** Contract 3 adds add-ons; the pinned
  catalog moves to it with the add-on's release, and contract 2 goes after
  that. The contract's own limits are in
  [the catalog contract](catalog-contract.md#known-limitations).
