# Running services on Cloud Run

Anvil's platform-managed deployment gives a service a place to run: a
**Cloud Run service in one shared project** that the platform team sets
up once
([Cloud Run setup](gcp-setup.md)). Anvil creates
the service's slot and identities; the service's own CI pushes images and
deploys. Anvil never rolls out versions.

```
anvil service create -deploy orders     # or, for an existing service: anvil service deploy orders
```

For each service, in the shared project and region, Anvil creates:

| Resource | Name | Purpose |
| --- | --- | --- |
| Cloud Run service | `orders` | Runs the service. Serves a placeholder until CI's first deploy. Public unless the service chooses `-option public=false` ([Public or private](#public-or-private)) |
| Artifact Registry repository | `orders` | The service's images, `REGION-docker.pkg.dev/PROJECT/orders/orders` |
| Service account | `run-orders` | What the service runs as. It has no roles; grant what the service needs |
| Service account | `ci-orders` | What CI deploys as. Only workflows in `Laratechs/orders` can use it, and it can only push to `orders`'s image repository, deploy the `orders` Cloud Run service, and run it as `run-orders` |

It sets these Actions variables on the service's repository, which the
template's `deploy` job uses: `ANVIL_GCP_PROJECT`, `ANVIL_GCP_REGION`,
`ANVIL_GCP_SERVICE`, `ANVIL_GCP_IMAGE`, `ANVIL_GCP_SERVICE_ACCOUNT` and
`ANVIL_GCP_WORKLOAD_IDENTITY_PROVIDER`. Then it commits
`.github/anvil-ci.env`, a copy of those variables, which starts CI: the
run builds the repository's code and deploys it. The CLI follows that run
on GitHub (with your own GitHub token, from `gh auth token`, which never goes
to Anvil) and ends with the URL:

```
$ anvil service create -deploy orders
Provisioning orders.

  ✓ Request accepted (operation op_...)
  ✓ Applied (repository, boilerplate, Cloud Run service)
  ✓ Ready in 48s
  ✓ CI started: https://github.com/Laratechs/orders/actions/runs/...
  ✓ Deployed by CI in 3m12s

Service:     orders (ready)
...
Open:  https://orders-....a.run.app
```

`-wait-deploy=false` returns once Anvil is done, leaving CI to deploy on
its own.

`anvil service delete -force` destroys all of this, images included.
`anvil service delete` (archive) destroys it too, to save cost, but keeps
the service in Anvil; restoring it (`anvil service create`) recreates it.

## Public or private

Services are public by default: anyone with a service's URL can call it,
so it opens in a browser. Each service chooses with its `public` option:

```
anvil service create -deploy -option public=false orders   # private from the start
anvil service deploy -option public=false orders           # make an existing one private
anvil service deploy -option public=null orders            # back to the default
```

A private service needs an identity token to call (`gcloud run services
proxy orders --region=REGION`, or `curl -H "Authorization: Bearer
$(gcloud auth print-identity-token)"`) from a principal with
`roles/run.invoker`.

Services that don't choose follow the platform team's default
([Cloud Run setup](gcp-setup.md#public-or-private-services)).

## How CI deploys

The template's CI (`.github/workflows/ci.yml` in
`Laratechs/anvil-template-go`, kept in sync by Anvil) has two jobs that
run on pushes to `main`. `push` runs when `ANVIL_GCP_IMAGE` is set: it
exchanges the workflow's GitHub OIDC token for the `ci-<service>`
identity and pushes the image to `ANVIL_GCP_IMAGE`. `deploy` needs it and
runs when `ANVIL_GCP_SERVICE` is set: it deploys that digest with
`gcloud run deploy`, and puts the URL in the run's summary. A service
with a project of its own gets `push` only
([Self-managed projects](gcp-setup.md#self-managed-projects)). The image
is built once, by the `build` job, and kept as a run artifact: `publish`
pushes it to ghcr.io (with its SBOM and provenance) and `push` copies its
linux/amd64 manifest, so Cloud Run runs the same digest. Services without
a deployment skip both.

Variables alone don't start CI, so Anvil's `github-repository` component
commits `.github/anvil-ci.env` after setting them (and after the managed
CI file). That push runs CI with the new variables, both for a new
service and when a cloud is added to an existing one. Its SHA is the
service's `ci_commit` status, which the CLI follows.

## Rolling back

Each run's `deploy` job deploys the image that run built, by digest. To
put an earlier version back, re-run the `deploy` job of the run that
deployed it: on the run's page in GitHub, open the `deploy` job and
choose **Re-run this job**, or

```
gh run list --repo Laratechs/orders --branch main      # find the run that deployed the good version
gh run view RUN_ID --repo Laratechs/orders             # its jobs, with their IDs
gh run rerun RUN_ID --repo Laratechs/orders --job JOB_ID   # re-run its deploy job
```

The re-run reuses the earlier run's build, so nothing is rebuilt, and it
deploys with the same `ci-<service>` identity, so it needs no access to
the shared project. Nothing pins the old version: the next push to
`main` deploys again, so revert the bad commit too. GitHub re-runs jobs
for 30 days after a run, and the image must still be in the service's
Artifact Registry repository.

## Known limitations

- **Public became the default.** Services created while the default was
  private turn public on their next apply, unless they set
  `-option public=false` or the operator sets `cloud_gcp.public` to
  `false`. Private means "needs an identity token"; Anvil grants
  `roles/run.invoker` to no one, so granting callers is by hand.
- **Following CI needs read access.** The CLI reads the repository's
  Actions runs with your GitHub token. If it can't (or Actions is
  disabled), the command fails after Anvil's change succeeded; CI still
  deploys on its own. Use `-wait-deploy=false` to skip the wait.
- **CI owns the image only.** Terraform ignores the image and revision
  fields so it doesn't roll back deploys, but resets other settings
  (environment variables, scaling, memory) to Anvil's on the next apply.
  Settings a service can choose are future work.
- **Runtime access.** `run-<service>` starts with no roles. Grant what the
  service needs (Secret Manager, Cloud SQL, ...) outside Anvil.
- **Repository renames.** CI is trusted by repository name
  (`attribute.repository`). Anvil never renames repositories; one renamed by
  hand loses its deploy access, and a new repository given the old name
  would gain it.
