# Setting up Cloud Run

The platform team's one-time setup for the `gcp` deployment. What each service
gets, and how its CI deploys, is in
[Running services on Cloud Run](gcp.md).

This guide has one required path and three optional ones:

1. **[Steps 1 to 5](#1-the-shared-project)** set up Cloud Run on a shared
   project: the project, GitHub Actions federation, roles for Anvil's own GCP
   identity, and a gcp binding that tells Anvil where services land.
2. **[Developer access](#6-developer-access)** (optional, step 6) lets
   developers read their services' logs, metrics and revisions in the
   console with their Okta sign-in.
3. **[Self-managed projects](#self-managed-projects)** (optional) let a service
   ask for a GCP project of its own.
4. **[The postgres add-on](#the-postgres-add-on)** (optional) gives platform
   services a PostgreSQL database.

## 1. The shared project

Create or choose a project, link billing, and enable the APIs:

```
PROJECT=example-services
REGION=us-central1
gcloud services enable --project=$PROJECT \
  run.googleapis.com artifactregistry.googleapis.com iam.googleapis.com \
  iamcredentials.googleapis.com sts.googleapis.com cloudresourcemanager.googleapis.com \
  secretmanager.googleapis.com
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
| `roles/resourcemanager.projectIamAdmin` | Let each service's runtime account read the secrets named `<service>-*` (a conditional grant), and no others. The Secret Manager API must be enabled; Anvil never reads or writes a secret |

Services created before secrets were supported get the grant on their next
apply, which fails without that role.

```
ANVIL=serviceAccount:anvil@ops-project.iam.gserviceaccount.com   # or user:you@example.com for a dev server
for role in run.admin artifactregistry.admin iam.serviceAccountAdmin iam.serviceAccountUser resourcemanager.projectIamAdmin; do
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

Upgrading a server that took the project, region and provider from
`settings "cloud_gcp"`? See
[Settings that moved to bindings](releases.md#settings-that-moved-to-bindings).

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

## 6. Developer access

Anvil grants no access to people. Without this step, the engineer who owns
`orders` can't read its logs or metrics, and pages the platform team during
an incident. This step is the platform team's grant: developers sign in to
the Google Cloud console with the same Okta sign-in as `anvil login`, and
read every platform-managed service in the shared project. Read is
project-wide because services have no owner and logs can't be scoped to
one service at the project level
([Decisions](decisions.md#decisions)). Developers can't change anything:
rolling back is a re-run of CI ([Rolling back](gcp.md#rolling-back)).

It uses [Workforce Identity Federation](https://docs.cloud.google.com/iam/docs/workforce-identities):
a workforce pool at the Google Cloud **organization**, with Okta as its
identity provider. Creating it needs an organization administrator
(`roles/iam.workforcePoolAdmin` on the organization). The Okta side is in
[Setting up sign-in with Okta](okta.md#7-let-developers-into-the-google-cloud-console);
do that first, because the provider needs its client ID and secret.

```
ORG=123456789012          # gcloud organizations list
POOL=laratechs
gcloud iam workforce-pools create $POOL --organization=$ORG \
  --location=global --display-name="Laratechs" --session-duration=3600s
gcloud iam workforce-pools providers create-oidc okta \
  --workforce-pool=$POOL --location=global \
  --issuer-uri=https://<your-okta-domain>/oauth2/<id> \
  --client-id=<federation client id> \
  --client-secret-value=<federation client secret> \
  --web-sso-response-type=code \
  --web-sso-assertion-claims-behavior=only-id-token-claims \
  --attribute-mapping=google.subject=assertion.sub,google.groups=assertion.groups \
  --attribute-condition="'anvil-developers' in assertion.groups"
```

The pool ID is unique across all of Google Cloud, so pick your own. The
issuer is the one from [Okta step 1](okta.md#1-create-the-authorization-server),
and the condition lets in only members of the developer group. The client
secret goes to Google and not to Anvil; Anvil never holds it.

Then grant the group, on the shared project (the group name is its value in
the token's `groups` claim):

```
GROUP=principalSet://iam.googleapis.com/locations/global/workforcePools/$POOL/group/anvil-developers
for role in browser run.viewer logging.viewer monitoring.viewer; do
  gcloud projects add-iam-policy-binding $PROJECT --member=$GROUP --role=roles/$role --condition=None
done
```

| Role | Why |
| --- | --- |
| `roles/browser` | Open the project in the console |
| `roles/run.viewer` | See every Cloud Run service and its revisions |
| `roles/logging.viewer` | Read logs (of every service in the project) |
| `roles/monitoring.viewer` | Read metrics |

Developers sign in at

```
https://auth.cloud.google/signin/locations/global/workforcePools/laratechs/providers/okta?continueUrl=https://console.cloud.google/
```

This is the **console (federated)**, which offers the products that
support federation; Cloud Run, Logging and Monitoring are among them.
Tell developers the link, or the provider name
(`locations/global/workforcePools/laratechs/providers/okta`) the sign-in
page asks for.

Changing the group's grants, or removing someone from `anvil-developers` in
Okta, takes effect at their next sign-in; an open console session lasts the
pool's session duration (an hour here).

**Check it.** As someone in `anvil-developers` and not a project member,
open the link above, then the shared project's Cloud Run page and Logs
Explorer: both show every service. As someone outside the group, the
sign-in is refused.

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
creates a GCP project for it: a cloud of its own. This is the catalog's
`gcpproject` deployment, and it is offered once a valid `gcpproject`
binding exists. Skip this section to offer only the platform.

1. Choose the folder new projects are created in. Policies and access
   you set on the folder apply to every project in it.
2. Grant Anvil's GCP identity (step 3) **Project Creator**
   (`roles/resourcemanager.projectCreator`) and **Project Deleter**
   (`roles/resourcemanager.projectDeleter`) on the folder, and **Billing
   Account User** (`roles/billing.user`) on the billing account. Anvil
   owns the projects it creates, which covers what it sets up inside
   them.
3. Create the binding:

   ```
   anvil binding create -provider=gcpproject \
     -set folder_id=folders/123456789012 \
     -set billing_account=000000-AAAAAA-000000 \
     -set project_prefix=ex \
     -set workload_identity_provider=projects/123456789012/locations/global/workloadIdentityPools/github/providers/laratechs \
     -set owner=group:engineering@example.com \
     gcp-projects
   ```

   - `project_prefix`: project IDs are `<prefix>-<service>`, and are
     unique across Google Cloud, so pick 1 to 4 lowercase letters and
     digits of your own.
   - `workload_identity_provider`: the provider from step 2 of this
     guide. One pool serves every project.
   - `region` (optional, default `us-central1`): where each project's
     image repository is.
   - `owner` (optional): an IAM member made Owner of each project.
     Without it, access is whatever the folder grants.

**What Anvil sets up.** The project, with no default network, and what
the service's CI needs to publish images to it:

| Resource | Name | Purpose |
| --- | --- | --- |
| Artifact Registry repository | `orders` | The service's images, `REGION-docker.pkg.dev/ex-orders/orders/orders` |
| Service account | `ci-orders` | What CI authenticates as. Only workflows in `Laratechs/orders` can use it, and it can only push to that repository |
| APIs | Artifact Registry, IAM, IAM Credentials | Enabled for the two above |

It sets `ANVIL_GCP_PROJECT`, `ANVIL_GCP_REGION`, `ANVIL_GCP_IMAGE`,
`ANVIL_GCP_SERVICE_ACCOUNT` and `ANVIL_GCP_WORKLOAD_IDENTITY_PROVIDER` on
the repository, so the template's `push` job publishes every merge's
image to the project.

**What it leaves to the team.** Delivery: there is no `ANVIL_GCP_SERVICE`,
so the template's `deploy` job doesn't run. The team decides what runs
the image, adds its own workflow that authenticates as `ci-orders`, and
grants that identity the roles its deploys need. A service has this or
the Cloud Run deployment, never both, and can't switch.

**Deleting.** `anvil service delete -force` deletes the project and
**everything in it**, including what the team built after Anvil created
it. The command names the project, says so, and asks for the service
name. Google keeps a deleted project for 30 days, during which an
organization administrator can restore it and its ID can't be reused, so
a new service with the same name fails until then. Archiving
(`anvil service delete` without `-force`) is refused for a service with a
project of its own: an archive tears a deployment down, and restoring
couldn't bring the team's work back.

This definition has been tested with mock providers only, and the
template's `push` job hasn't run on GitHub; apply it to a test folder
before offering it
([#41](https://github.com/Laratechs/anvil/issues/41)).

## The postgres add-on

`anvil service addon add postgres NAME` gives a service on the platform a
PostgreSQL database. This is the catalog's `addon "postgres"` (catalog
contract 3). Services on one gcp binding share a Cloud SQL instance in
the shared project, which Anvil creates when the first service attaches
the add-on (several minutes) and deletes when the last one removes it.
Each service gets a database named after it, owned by its runtime
identity (`run-<service>`), which logs in with IAM database
authentication: no password exists, and no other service can connect to
it.

1. Enable the **Cloud SQL Admin API** (`sqladmin.googleapis.com`) in the
   shared project.
2. Grant Anvil's GCP identity (step 3), on the shared project:

   | Role | Why |
   | --- | --- |
   | `roles/cloudsql.admin` | Create and delete the instance and its IAM users |
   | `roles/resourcemanager.projectIamAdmin` | Grant the instance's admin and each service's runtime identity Cloud SQL access to that instance only |

   It already creates service accounts and grants who may use them
   (`roles/iam.serviceAccountAdmin`), which covers the instance's admin
   identity, `pgadmin-<hash>`, that Anvil impersonates to create each
   service's database.
3. Let the server reach the instance. Anvil creates each database over a
   connection to the instance, with the Cloud SQL connector, as the admin
   identity. The instance has a public IP with no authorized networks, so
   the connector (IAM-authenticated, over TLS) is the only way in; the
   server needs outbound HTTPS and port 3307 to Google. The PostgreSQL
   provider finds credentials through `GOOGLE_APPLICATION_CREDENTIALS`,
   so set it to a credentials file for Anvil's identity in the server's
   environment.
4. Optionally, set how instances run, for every service, in the server's
   configuration:

   ```hcl
   settings "addon_postgres" {
     tier              = "db-custom-2-7680" # default db-f1-micro
     database_version  = "POSTGRES_16"      # the default
     high_availability = true               # default false
   }
   ```

The service's repository gets `ANVIL_DB_INSTANCE` (the instance's
connection name), `ANVIL_DB_NAME` and `ANVIL_DB_USER`; the service
connects with a Cloud SQL connector as its runtime identity, with IAM
authentication enabled.

**Deleting.** `anvil service addon remove postgres NAME` and
`anvil service delete -force NAME` drop the service's database with its
data, after a warning and the service name. PostgreSQL won't drop a
database with open connections, so stop the service's connections first,
or retry the request once they're gone. Archiving a service with the
add-on is refused. The instance has backups, which go with it.

This definition has been tested with mock providers only; apply it in a
test project before offering it
([#42](https://github.com/Laratechs/anvil/issues/42)).

## Known limitations

- **Developer read is organization-wide.** Step 6 lets every developer read
  every service's logs, metrics and revisions in the shared project, and
  Anvil doesn't manage it: a grant made by hand isn't removed when the
  group's name changes. Per-service log views would narrow logs, at the cost
  of a boundary nothing else in Anvil has.
- **Shared quota and blast radius.** Every service shares the project's
  quotas and its project-level IAM. Anyone with project-wide Run or
  Artifact Registry roles can change any service.
- **Per-service projects from October 2026.** Early catalogs gave every
  service its own project, with more in it than today's
  [self-managed projects](#self-managed-projects). A service created that way fails its next apply (its
  project is protected from destroy); remove the old project from its
  Terraform state by hand, or archive it.
