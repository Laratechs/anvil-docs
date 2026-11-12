# Setting up Cloud Run

The platform team's one-time setup for the `gcp` cloud. What each service
gets, and how its CI deploys, is in
[Running services on Cloud Run](gcp.md).

You need a project, a GitHub identity federation provider for the
organization, and roles for Anvil's own GCP identity. Then you tell Anvil
where services land, the project and provider, with a gcp binding.

## 1. The shared project

Create or choose a project, link billing, and enable the APIs:

```
PROJECT=example-services
REGION=us-central1
gcloud services enable --project=$PROJECT \
  run.googleapis.com artifactregistry.googleapis.com iam.googleapis.com \
  iamcredentials.googleapis.com sts.googleapis.com cloudresourcemanager.googleapis.com
```

## 2. GitHub Actions federation

One Workload Identity Federation pool and provider lets GitHub Actions in
the organization authenticate without keys. `attribute.repository` is
required: Anvil grants each service's CI identity to its own repository by
it. The condition keeps other organizations out.

```
gcloud iam workload-identity-pools create github --project=$PROJECT \
  --location=global --display-name="GitHub Actions"
gcloud iam workload-identity-pools providers create-oidc laratechs --project=$PROJECT \
  --location=global --workload-identity-pool=github \
  --issuer-uri=https://token.actions.githubusercontent.com \
  --attribute-mapping=google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.repository_owner=assertion.repository_owner \
  --attribute-condition="assertion.repository_owner == 'Laratechs'"
gcloud iam workload-identity-pools providers describe laratechs --project=$PROJECT \
  --location=global --workload-identity-pool=github --format='value(name)'
# → projects/123456789012/locations/global/workloadIdentityPools/github/providers/laratechs
```

## 3. Anvil's GCP identity

Terraform in `anvil server` uses Application Default Credentials. That
identity needs, on the shared project:

| Role | Why |
| --- | --- |
| `roles/run.admin` | Create Cloud Run services and grant CI deploy on each |
| `roles/artifactregistry.admin` | Create image repositories and grant CI push on each |
| `roles/iam.serviceAccountAdmin` | Create the two service accounts and grant who may use them |
| `roles/iam.serviceAccountUser` | Set a service's runtime account on its Cloud Run service |

```
ANVIL=serviceAccount:anvil@ops-project.iam.gserviceaccount.com   # or user:you@example.com for a dev server
for role in run.admin artifactregistry.admin iam.serviceAccountAdmin iam.serviceAccountUser; do
  gcloud projects add-iam-policy-binding $PROJECT --member=$ANVIL --role=roles/$role --condition=None
done
```

## 4. Anvil's gcp binding

Where Cloud Run services land is a cloud binding, which an operator
creates through the running server:

```
anvil binding create -provider=gcp \
  -set project_id=example-services \
  -set region=us-central1 \
  -set workload_identity_provider=projects/123456789012/locations/global/workloadIdentityPools/github/providers/laratechs \
  gcp-shared
```

`project_id` and `workload_identity_provider` are required; `region`
defaults to `us-central1`. The gcp cloud is offered while a valid gcp
binding exists:

```
$ anvil catalog show
KIND      VARIANT   TITLE               ENABLED   OPTIONS         BINDING                                                                                            COMPONENTS
...
cloud     gcp       Cloud Run service   yes       public (bool)   project_id (string), region (string, default "us-central1"), workload_identity_provider (string)   run (./components/gcp-cloud-run)
```

Changing the binding (`anvil binding update -set ... gcp-shared`) stores a
new revision. Existing deployments keep the revision they were created
with; only deployments created afterwards use the new one.
`anvil service list` marks the services that are behind, and
`anvil service migrate NAME` moves one to the new revision
([Changing where deployments land](server.md#changing-where-deployments-land)).

**Upgrading from settings.** Earlier releases took the project, region and provider
from `settings "cloud_gcp"`. Keep them there for the first start of this
release: the server migrates existing gcp clouds onto a binding named
`gcp` made from them (revision 1, with no Terraform changes) and offers
the gcp cloud with it. It then logs a warning naming the file and line
asking you to remove the attributes, which it ignores from then on. With
no existing gcp clouds it makes no binding, and the warning gives the
`anvil binding create` command that holds the same values instead. If the
values are missing or invalid, the server still starts, logs each gcp
cloud it couldn't migrate, and their applies fail until you fix the
settings and restart.

## 5. Check it

```
ANVIL_CONFIG=anvil.hcl ANVIL_E2E=1 go test ./e2e/ -v -run CloudRun
```

`TestCloudRun` creates a service with a Cloud Run service, waits for its
CI to deploy, checks that Cloud Run runs the image CI built and that the
URL serves the template's app, makes it private and public again with
`-option public=...`, and force-deletes it.
It reads GCP with your Application Default Credentials
(`gcloud auth application-default login`). To try a template branch
before merging it, set `"service": {"template_ref": "BRANCH"}` in the
settings.

## Public or private services

Services are public by default. Anvil turns off Cloud Run's invoker check
(`invoker_iam_disabled`) rather than granting `allUsers`, which works
under a domain-restricted sharing policy; check that the
`run.allowedIngress` organization policy allows `all`.

Services that don't choose follow the `public` setting (default `true`).
Set `public = false` in `settings "cloud_gcp"` to make services private unless they
ask to be public. A change to the setting reaches existing services on
their next apply.

A service can still choose for itself with its `public` option
([Public or private](gcp.md#public-or-private)).

## Self-managed projects

A service that wants to own its infrastructure asks for a self-managed
deployment (`anvil service deploy -type=self-managed NAME`), and Anvil
creates an empty GCP project for it: a cloud of its own. This is the
catalog's `gcpproject` deployment, and it is offered once a valid
`gcpproject` binding exists. Skip this section to offer only the
platform.

1. Choose the folder new projects are created in. Policies and access
   you set on the folder apply to every project in it.
2. Grant Anvil's GCP identity (step 3) **Project Creator**
   (`roles/resourcemanager.projectCreator`) on the folder, and **Billing
   Account User** (`roles/billing.user`) on the billing account.
3. Create the binding:

   ```
   anvil binding create -provider=gcpproject \
     -set folder_id=folders/123456789012 \
     -set billing_account=000000-AAAAAA-000000 \
     -set project_prefix=ex \
     -set owner=group:engineering@example.com \
     gcp-projects
   ```

   - `project_prefix`: project IDs are `<prefix>-<service>`, and are
     unique across Google Cloud, so pick 1 to 4 lowercase letters and
     digits of your own.
   - `owner` (optional): an IAM member made Owner of each project.
     Without it, access is whatever the folder grants.

Anvil creates the project with no default network and nothing else, and
`anvil service get` shows its ID and console link. What runs in it, and
how the service's CI deploys there, is the service team's: Anvil sets no
CI variables for it. A service has this or the Cloud Run deployment,
never both, and can't switch.

Anvil never deletes a team's project. A service with one can't be
archived or force deleted until the project is decommissioned by hand.

This definition has been tested with mock providers only; apply it to a
test folder before offering it
([#41](https://github.com/Laratechs/anvil/issues/41)).

## Known limitations

- **Shared quota and blast radius.** Every service shares the project's
  quotas and its project-level IAM. Anyone with project-wide Run or
  Artifact Registry roles can change any service.
- **Per-service projects from October 2026.** Early catalogs gave every
  service its own project, with more in it than today's
  [self-managed projects](#self-managed-projects). A service created that way fails its next apply (its
  project is protected from destroy); remove the old project from its
  Terraform state by hand, or archive it.
