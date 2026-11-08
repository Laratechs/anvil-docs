# Anvil

Anvil is the Laratechs Internal Developer Platform: engineers ask it for services and the cloud environments that go with them.

## Language

**Service**:
A named, deployable unit of software that Anvil provisions and keeps in its desired state. A service has no owner; it belongs to the organization.
_Avoid_: App, project, owned service

**Cloud**:
Where one service runs, on one provider, created by Anvil for that service. On GCP it is a Cloud Run service (with its image repository and identities) in the organization's shared project, which its cloud binding names, not a project of its own. A service has at most one cloud per provider.
_Avoid_: Project, environment, GCP project

**Cloud binding**:
Where one provider's clouds land, such as the shared GCP project, region and Workload Identity provider. The platform team (the operator) manages bindings in Anvil; the catalog declares what a provider's binding carries. Bindings are versioned: a change is a new revision, and each cloud keeps the revision it was created with, so changing a binding never moves existing clouds. A cloud whose catalog definition takes a binding is that definition plus a binding revision.
_Avoid_: Settings (for where clouds land), project, account, target

**Setting**:
A value the platform team (the operator) gives a catalog definition, saying how something is deployed for every service, such as whether Cloud Run services are public by default. Where clouds land is a cloud binding, not a setting.
_Avoid_: Config, option, binding

**Option**:
A choice a requester makes for one service's cloud, declared by the catalog and stored on the service, such as whether a Cloud Run service is public. An option not chosen takes the catalog's default.
_Avoid_: Setting, binding, flag, parameter
