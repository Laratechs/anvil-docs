# Decisions and known limitations

The choices that shape what Anvil does today, and what it doesn't do yet.
Anvil is before 1.0, so some of these will change; the
[changelog](../CHANGELOG.md) records each change.

## Decisions

- **Requests describe desired state.** Every request says what you want,
  not what to do, so repeating one is always safe
  ([How Anvil works](how-it-works.md#idempotency)).
- **Terraform provisions everything.** Each service is its own Terraform
  root module with its own state, so every repository setting, file and
  cloud resource is tracked and can be re-applied.
- **The engine and the catalog are separate.** Anvil doesn't know what a
  service or a cloud is made of. A catalog does, and the
  [catalog contract](catalog-contract.md) is the only interface between
  them.
- **Request interface:** CLI and HTTP API. A portal or a GitHub issue form can
  sit on top of the API later.
- **Ownership:** services have no owning team; they belong to the
  organization. Any active member of the GitHub organization may create,
  change, archive or restore any service.
- **Naming:** 3–25 characters, lowercase letters, digits and single hyphens,
  starting with a letter. A few generic names are reserved.
- **CI and registry:** GitHub Actions, with one shared registry
  (`ghcr.io/<organization>/<service>`) and the short-lived `GITHUB_TOKEN`.
  Images are tagged `0.1.<run>`, `sha-<commit>` and `latest`, and carry a
  BuildKit SBOM and provenance record. Signed GitHub artifact attestations
  are left out because private repositories need GitHub Enterprise Cloud
  for them.
- **Boilerplate updates:** Managed files (CI, lint config) are
  re-applied from the catalog's templates on every apply, so platform
  changes reach existing services. App code is seeded once and never
  overwritten.
- **Where services run:** Optional. A service's deployment is
  platform-managed by default: one Cloud Run service per service, in
  one shared GCP project the platform team runs. A service that wants to
  own its infrastructure asks for a self-managed deployment, a cloud of
  its own, instead. A service has one deployment and its type can't
  change ([#36](https://github.com/Laratechs/anvil/issues/36)). Anvil provisions the slot
  and the identities; the service's CI pushes to its own Artifact Registry
  repository and deploys, authenticated by GitHub OIDC with no stored keys.
  Anvil starts the first run by committing CI's settings, and the CLI
  waits for it, so `anvil service create -deploy` ends with a URL
  serving the new repository's code. A project per service is offered
  only as the self-managed deployment, and empty: scaffolding one for
  every service was far more than the workflow needs.

## Known limitations

- **No branch protection.** Service repositories get no branch protection
  or required code owner review, which GitHub offers private repositories
  only on paid plans, so a pull request can be merged with failing CI. A
  catalog for an organization on such a plan can add it to its repository
  component.
- **Single instance.** State lives in the data directory, and leases are held
  in memory, so run one `anvil server` with a persistent data directory.
  Terraform's state lock still guards against two servers applying at once.
  A shared store, with separate API and worker roles, is planned to remove
  this limit.
- **No automatic retries.** A failed apply waits for someone to repeat the
  request.
- **Commit noise.** The GitHub provider writes one commit per file, so a new
  repository starts with about 10 small commits and applies run with
  `-parallelism=1`. One of them, `.github/anvil-ci.env`, is there on
  purpose: Anvil commits it whenever it changes CI's Actions variables, so
  CI runs with them.
- **Services created with a team.** Services provisioned before teams were
  removed lose their team repository access, CODEOWNERS file, `anvil-team-*`
  topic, and cloud team IAM bindings and labels on their next apply, because
  the catalog no longer declares them. Regrant access by hand if needed.
  Their stored records keep a `team` key, which Anvil ignores.
- **Images outlive force-deleted services.** The GitHub App can't delete
  a service's ghcr.io image, and Anvil deliberately holds no other token
  that could. Until someone deletes it by hand (the delete's warning has
  the command), a new service with the same name can't publish or deploy.
- **Clouds are never deleted.** `anvil service delete`, with or without
  `-force`, refuses a service with a self-managed deployment (a GCP
  project or an AWS account of its own). Decommissioning one is a manual,
  reviewed operation for now.
- **AWS is off.** The catalog keeps its AWS account definition, but
  Anvil offers it only while an aws binding exists, and none should be
  created until AWS is taken up again.
- **A deployment's type is fixed.** A service can't move between the
  platform and a cloud of its own.
- **Cloud Run.** Services are public (anyone with the URL can call them)
  unless they choose `-option public=false` or the operator sets
  `cloud_gcp.public` to `false`. Their runtime account starts with no
  roles, and settings other than the image are Anvil's; see
  [Running services on Cloud Run](gcp.md#known-limitations) and
  [Cloud Run setup](gcp-setup.md#known-limitations).
