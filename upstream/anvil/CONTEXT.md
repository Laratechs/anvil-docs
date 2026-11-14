# Anvil

Anvil is the Laratechs Internal Developer Platform: engineers ask it for services and, when a service needs one, somewhere for it to run.

## Language

**Service**:
A named, deployable unit of software that Anvil provisions and keeps in its desired state. It has exactly one repository, which belongs to no other service. A service has no owner; it belongs to the organization. A service is **imported** when its repository existed first: Anvil adopts it, never adds application code, and shows what it changes before it does.
_Avoid_: App, project, owned service

**Deployment**:
Where a service runs, if anywhere. It is either **platform-managed**, on the platform, or **self-managed**, in the service's own cloud. A service has at most one, and its type can't change while it is deployed. A service without one, including one that was undeployed, can get either.
_Avoid_: Environment, cloud (for a platform-managed deployment)

**Platform**:
The shared infrastructure the platform team runs for platform-managed deployments, such as the organization's shared GCP project, where each service gets a Cloud Run service with its image repository and identities.
_Avoid_: Environment, shared project

**Cloud**:
A provider account Anvil creates for one service with a self-managed deployment, such as a GCP project. Anvil bootstraps it, and everything inside it is the service team's.
_Avoid_: Environment, project, account, and "cloud" for a platform-managed deployment

**Add-on**:
Extra infrastructure a service adds to its platform-managed deployment, such as a database, which the platform team maintains in the catalog. A self-managed service builds its own in its cloud.
_Avoid_: Plugin, extension, service (for an add-on)

**Add-on instance**:
The infrastructure every service that attaches an add-on on one cloud binding shares, such as a database server. Anvil creates it when the first service attaches the add-on, and deletes it when the last tenant is gone.
_Avoid_: Shared instance (in names), cluster, server

**Tenant**:
What one service gets on an add-on instance, such as a database and a user only its runtime identity can use. It lives in the service's own state; removing the add-on or force deleting the service deletes it, with its data.
_Avoid_: Database (for the tenant as a whole), slot

**Cloud binding**:
Where a deployment lands: the platform's project, region and Workload Identity provider, or where new clouds are created. The platform team (the operator) manages bindings in Anvil; the catalog declares what each deployment's binding carries. Bindings are versioned: a change is a new revision, and each deployment keeps the revision it was created with, so changing a binding never moves existing deployments. The platform team moves a service to the latest revision by migrating it, one service at a time.
_Avoid_: Settings (for where deployments land), project, account, target

**Setting**:
A value the platform team (the operator) gives a catalog definition, saying how something is deployed for every service, such as whether Cloud Run services are public by default. Where deployments land is a cloud binding, not a setting.
_Avoid_: Config, option, binding

**Option**:
A choice a requester makes for one service, or for its deployment, declared by the catalog and stored on the service, such as whether a Cloud Run service is public. An option not chosen takes the catalog's default, and an immutable option keeps the value the service was created with.
_Avoid_: Setting, binding, flag, parameter

**Requester**:
The person who asked Anvil for a change, recorded on the operation: their login at the identity provider they signed in with.
_Avoid_: Owner, user, GitHub login

**Role**:
What a requester may do, from their groups at the identity provider. Roles are organization-wide, as services have no owner. A **viewer** (anyone signed in) may read; a **developer** may also create and change services; an **admin** may also manage cloud bindings, migrate services and permanently delete them.
_Avoid_: Permission, team, owner, operator role

## Names from before deployments

Until November 2026 every deployment was called a cloud. Some names keep the old word so that stored records and Terraform state didn't have to move: `spec.clouds` and `status.clouds` in service records and API bodies, the `cloud_<name>` key in generated Terraform and in `settings "<key>"` blocks, a binding's `provider` (the deployment's name), and Go identifiers such as `CloudProvider`. Read them as "deployment".
