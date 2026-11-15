# How Anvil works

What happens between a request and a ready service: the pipeline a request
goes through, the state Anvil keeps, why repeating a request is safe, and what
archiving and deleting do.

## How a request flows

```
anvil service create -deploy orders
        │  (the access token "anvil login" stored)
        ▼
anvil server  POST /v1/services
  1. Authenticate: the token is the identity
     provider's, minted for Anvil, and not expired  → 401
  2. Authorize: your role, from your groups at the
     identity provider, allows the action           → 403
  3. Validate the name and the deployment asked for → 400 with what to change
  4. Admit: the name isn't an unmanaged
     repository; the lifecycle allows it            → 404 / 409
  5. Merge the request into the service's spec
     (compare-and-swap; generation + 1 if changed)
  6. Nothing changed and the service is ready?      → 200 with the service
     Otherwise record an operation and queue it     → 202 with the operation
        │
        ▼
dispatcher → worker pool (ANVIL_WORKERS; one apply per service at a time)
  7. Generate services/orders/{main.tf.json, terraform.tfvars.json} from
     the spec, the catalog's definitions and the server's settings
  8. terraform init + apply (state: gs://<bucket>/<prefix>/orders), with
     the components the catalog defines. In the Laratechs catalog:
        ├─ service:               repository from the template, kept-in-sync
        │                         CI and lint files
        ├─ deployment "gcp":      Cloud Run service, image repository,
        │                         runtime and CI service accounts
        ├─ deployment "gcpproject": a GCP project of the service's own
        └─ add-ons:               a tenant on a shared instance, per add-on
  9. Record the status (observed generation, conditions, outputs) and
     complete the operation: succeeded or failed
```

The CLI waits for the operation by default (`-wait=false` returns at once) and
shows each step on stderr: `✓ Request accepted`, a spinner while Terraform
applies (plain lines when stderr isn't a terminal, and nothing with `-json`),
then `✓ Ready in 1m42s`. It still ends with the repository URL.

Interrupting the CLI stops the waiting, not the change.
`anvil operation wait <id>` picks it back up.

## State

Each service has:

- a **spec**: what was asked for (description, deployment, add-ons, and a
  lifecycle of `active`, `archived` or `deleted`);
- a **status**: what Terraform last reported, the generation it describes, and
  `Ready` and `Reconciling` conditions.

Its `phase` (`provisioning`, `ready`, `archiving`, `archived`, `deleting` or
`failed`) is derived from those. Every change is an **operation** (`queued`,
`running`, `succeeded` or `failed`), kept as the service's change log. Each
records its kind (create, archive, deploy and so on), who asked, and how it
went, and `anvil operation list` reads it back.

## Idempotency

Requests describe the state you want, not an action, so repeating one is
always safe. Each field has one merge rule: the name is set once, a
description replaces the old one only if given, and a deployment or add-on
is added, never removed by leaving it out.

| Situation | Result |
| --- | --- |
| The service is `ready` and already has everything the request asks for | `200` with the service. Terraform doesn't run. |
| The same, but the service was last applied with another catalog revision (`status.catalog_revision`), as after an upgrade, or with other settings (`status.settings_digest`, a digest of the settings its definitions read) | `202` with an operation that re-applies it at the same generation, so it converges on the current catalog and settings. Its `changes` say what Terraform changed: all zero when the upgrade kept the service's resources as they were. Until then `service list` and `service get` mark the service as outdated (`catalog_update` and `settings_update` in the API). A service applied before digests were recorded counts as outdated once. `anvil service migrate NAME` or `-all` does this for services that haven't had a request. |
| The same request is already queued or running | `202` with that operation. Nothing is queued twice. |
| A request that asks for more arrives while an apply runs (for example, it adds `-deploy`) | `202` with a new operation. It runs as soon as the current apply finishes. |
| The last apply `failed`, or the server stopped mid-apply | Repeating the request re-applies, and Terraform resumes from its state. Interrupted work also resumes on its own when the server restarts. |
| The last apply failed for a [transient](#retrying-transient-failures) reason, and the operation is `retrying` | Nothing to do: Anvil applies again at the time the operation shows. A request that changes something applies at once instead, and covers the retrying operation. |
| A client retries with the same `Idempotency-Key` (the CLI sends one on every write) | The original operation, even after a force delete that would otherwise be a `404`. |

A create for an existing name converges on it, whoever sends it: services have
no owner, so there is no "someone else's name" conflict.

## Retrying transient failures

A rate limit or a flaky network shouldn't leave a service half-applied until
someone notices. When an apply fails with an error Anvil can tell is
temporary, it doesn't fail the operation. The operation becomes `retrying`,
with the `attempt` that failed and `next_attempt_at`, and its `error` holds
the last failure. The service stays reconciling, its `Ready` condition has the
reason `Retrying`, and `anvil service get` shows the attempt and when the next
one starts.

Anvil recognizes these as transient, in Terraform's message: a rate limit
(`429`, `rate limit`), a server error from GitHub or GCP (`Error 500`, `502`,
`503`, `504`, `502 Bad Gateway`, `503 Service Unavailable`), and a network
failure (`connection reset by peer`, `i/o timeout`, `TLS handshake timeout`,
`unexpected EOF`, `no such host`). Anything else fails at once, as before.

It retries three times, after 1, 4 and 16 minutes (an operator can change the
waits with `ANVIL_RETRY_BACKOFF`, see [Running the server](server.md)). A
failure after the last retry fails the operation, naming the attempts, and
then waits for someone to repeat the request. Each retry applies from
Terraform's state, as a repeated request does. A new request for the service
doesn't wait out the backoff: it applies at once, and its apply covers the
retrying operation too. A server that restarts while an operation is retrying
carries on with it.

An admin stops a retry with `anvil operation cancel <id>`. The operation fails
with the last error and who cancelled it, and the service is left as the last
attempt left it. Repeat the request to try again. Only a `retrying` operation
can be cancelled: one that is running is applying, and Terraform isn't
interrupted mid-apply.

Retries cover applies of services. An add-on instance's apply fails as
before and waits for a request.

## Previewing a change

`anvil service plan NAME` shows what an apply would change without applying
it. It is an operation of kind `plan`, queued like any other, so it takes the
service's turn: the service has one worker at a time, and the plan waits for
an apply that is running, retrying or waiting for an add-on, then previews
what that apply left. A plan queued behind other plans runs in the order
asked.

The worker renders the service's root module exactly as an apply would, with
the server's catalog, its settings and each deployment's recorded binding
revision, or with each at its latest for `-binding=latest`, as a migrate
would. It runs `terraform plan` on the service's state without locking or
writing it, then records the result on the operation as `plan`: the counts,
every resource change, and the stateful resources the plan replaces or
destroys, as the catalog declares them (`lifecycle { stateful }`).

A plan changes nothing on the service: not its generation, conditions or last
operation, and nothing is applied. It is never retried, not even for a
failure an apply would retry: a plan that fails fails its operation with
`planning failed: ...`, and asking again plans again. The next apply renders
the root module again, so a plan leaves nothing it depends on.

## Archiving and deleting

`anvil service delete NAME` shows what will happen and asks you to type the
service name. The API requires the same confirmation as `confirm={name}`.

The confirmation names the resources that hold data and are destroyed: those a
catalog definition lists in `lifecycle.stateful`, such as the image repository
of the Laratechs catalog's Cloud Run deployment. An archive names only its
deployment's. A service's body lists them under `stateful`, each with its
root-module `address` and, for a deployment's, the `cloud` provider.

| | Archive (default) | `-force` |
| --- | --- | --- |
| Repository | Archived: read-only, with code, issues, pull requests and history kept | Deleted |
| Cloud Run service | Deleted, with its images and service accounts, to save cost; restoring recreates it | Deleted, with its images and service accounts |
| A cloud of its own (a self-managed deployment) | Refused: restoring couldn't bring back what the team built there | Deleted, with everything in it, after a warning |
| Add-on tenant | Refused: restoring couldn't bring the data back | Deleted, with its data |
| AWS account | Refused while the service has one; the platform team decommissions it first | Refused, likewise |
| Anvil record | Kept, phase `archived`, with its deployment | Removed, with a tombstone of who deleted it; the name can be reused |
| Undo | `anvil service create` with the same name restores it and recreates its deployment | None |

### How Terraform does it

**Archive** sets `lifecycle = "archived"`, in two applies:

1. It tears down the deployment with the set a force delete destroys. It drops
   every address except the definition's `lifecycle.destroy_on_delete` from
   state, renders the service without the deployment's components (keeping
   their providers), and applies with those addresses as `-target`s, so the
   deployment's resources are destroyed and nothing of the service changes.
2. It applies only the addresses the service definition lists in
   `lifecycle.archive_targets` (the repository, with `-target`). A full apply
   would try to update managed files, which GitHub rejects on an archived
   repository.

A restore runs a full apply, which unarchives the repository before touching
any files and recreates the deployment. A deployment whose definition has no
`destroy_on_delete` (the AWS account) can't be torn down, so its service can't
be archived.

**Undeploy** (`anvil service undeploy`, `DELETE /v1/services/{name}/deployment`)
keeps the service active and removes its deployment, with the same
confirmation, warnings and stateful resources as a force delete names for it.
It records the deployment (with its options and binding revision) under the
service's `status.leaving`, and the next apply:

1. Tears the deployment down exactly as an archive does, from that record,
   keeping the service's resources and its add-on tenants in state.
2. Applies the service without a deployment. The tenants of the add-ons that
   were attached are no longer in the configuration, so Terraform destroys
   them, and an add-on instance goes with its last tenant.

A failed undeploy leaves `status.leaving` set, and repeating the request
retries it; until it succeeds the service can't be deployed again, and a
force delete still destroys the deployment. A deployment with no
`destroy_on_delete` can't be undeployed. An archived service can't be
undeployed: restore it first.

**Force delete** runs these steps:

1. It tries to delete the service's ghcr.io image. The GitHub provider has no
   package resource, so Anvil calls GitHub itself. A GitHub App can't, so a
   deployed server ends the delete with a warning and the command to delete
   the image by hand; see [Setting up a GitHub App](github-app.md#2-set-permissions).
2. It drops everything except the definitions' `lifecycle.destroy_on_delete`
   addresses (the repository, and a deployment's whole component, such as
   `run` for Cloud Run) from state. Files and variables disappear with the
   repository.
3. It applies a configuration with the providers of the service and its
   deployment and no components, so Terraform destroys what is left even
   though the repository module marks it `prevent_destroy`.

A deployment whose definition has no `destroy_on_delete` can't be
force-deleted, so neither can its service. If a force delete fails, the
service stays `failed` with lifecycle `deleted` and only accepts another
`-force` delete, because re-creating a half-deleted service would overwrite its
code with the template.
