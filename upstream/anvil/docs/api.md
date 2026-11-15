# HTTP API

The API the CLI is built on, for scripts and portals. Every action the CLI
takes is one of these requests.

## Conventions

- **Authentication.** All `/v1` routes except `/v1/auth/config` take
  `Authorization: Bearer <access token>`: the token `anvil login` obtains
  from the organization's identity provider ([Sign-in](#sign-in)). Anvil
  accepts only tokens minted for it; it doesn't take GitHub tokens. Every
  response carries an `Anvil-Version` header.
- **Desired state.** A write describes the state you want, so repeating it is
  safe. It answers `200` when nothing changes, or `202` with a queued
  operation when Terraform has work to do ([How Anvil works](how-it-works.md#idempotency)).
- **Operations.** A `202` body is `{"operation", "service"}` with
  `Location: /v1/operations/{id}`. Poll the operation, or long-poll it (see
  [Operations](#operations)).
- **Idempotency keys.** Writes accept an `Idempotency-Key` header, remembered
  for 24 hours per requester. A retry with the same key returns the original
  operation.
- **Synchronous writes.** `?wait=true` on a write blocks until the operation
  finishes and returns `201` (`200` for a delete), or `502` with the failure.
- **Errors.** `{"error", "fields"?, "service"?}` with status:
  - `400`: invalid, with per-field messages in `fields`;
  - `401`: no access token, or one Anvil doesn't accept (expired, or not
    issued for Anvil), with a `WWW-Authenticate: Bearer` header. The reason
    is in the server's log, not the response;
  - `403`: the caller's [role](#roles) doesn't allow it. The message names
    the group whose members may;
  - `404`: no such service;
  - `409`: the service's lifecycle doesn't allow it, the name is an
    unmanaged repository, or `options` changes an immutable option
    (the message names it and its stored value).

  Terraform failures are reported on the operation and on the service's
  `Ready` condition, not as an HTTP error.

## Services

| Method and path | Body | Result |
| --- | --- | --- |
| `POST /v1/services` | `{"name","description"?,"type"?,"deployment"?,"options"?,"binding"?,"import"?}` | `200` service if unchanged, `202` operation queued |
| `POST /v1/import-plans` | the same body as the create, with no deployment | `200` `{"name","settings"?,"overwrites"?,"adds"?}`, `409` if there is no such repository or the name is already a service, `502` if Terraform couldn't plan |
| `GET /v1/services` | | `200` `{"services": [...]}` |
| `GET /v1/services/{name}` | | `200` service, with an `ETag` |
| `DELETE /v1/services/{name}?confirm={name}[&force=true]` | | `200` if unchanged, `202` operation queued |
| `POST /v1/services/{name}/deployment` | `{"type"?,"deployment"?,"options"?,"binding"?}` | `200` if unchanged, `202` operation queued, `409` for another type or a second deployment |
| `DELETE /v1/services/{name}/deployment?confirm={name}` | | `200` if the service has no deployment, `202` operation queued, `400` without `confirm`, `409` for an archived service or a deployment Anvil can't delete |
| `POST /v1/services/{name}/migrate?confirm={name}` | | `200` if unchanged, `202` operation queued, `409` if the binding's latest revision isn't valid |
| `POST /v1/services/{name}/plan[?binding=latest]` | | `202` `{"operation","service"}` for a `plan` operation (see [Plans](#plans)), `400` for another `binding` or for `wait`, `409` for an archived or never-applied service, or a latest binding revision that isn't valid |

A service body has `spec`, `status` (with the derived `phase`) and
`generation`. Status lives only under `status`: the repository and image in
`status.repository_url` and `status.image`, and each deployment, with its
catalog definition's `title`, in `status.clouds`. Services have no team: a body
with `team`, or `?team=` on the list, is a `400` saying to omit it.

### Importing a repository

`"import": true` on `POST /v1/services` makes the service from the
repository that already has its name, instead of creating one from a
template, and adopts it into the service's Terraform state. It takes no
deployment (`400`), is a `409` when there is no such repository, when the
name is already a service made from a template, or when the server's
catalog declares nothing to import, and needs `?confirm={name}`, as a delete
does. A create without it for a name an unmanaged repository has is a `409`
that names the import command.

`POST /v1/import-plans` says what that import would change, without
changing or recording anything: `settings` lists attributes of the
repository that would change (`resource`, `setting`, `from`, `to`, as JSON),
`overwrites` the existing files Anvil's managed files would replace, and
`adds` the managed files the repository lacks. A caller shows it before it
confirms. A service made by import has `spec.imported`.

### Deployments

A **deployment** is where a service runs. `type` asks for one by type:
`"platform-managed"` (on the platform, the shared infrastructure the platform
team runs) or `"self-managed"` (a cloud of the service's own). The server picks
the deployment its catalog offers for the type; none, or several, is a `400`.
`deployment` names one, for a server that offers several of a type.

- On `POST /v1/services`, either field also gives the new service a
  deployment.
- On the deployment route, an empty body asks for the deployment the service
  has or, without one, a platform-managed one.
- A service has one deployment and its type can't change while it has it: a
  request for another type, or another deployment, is a `409`.
- `DELETE` on the deployment route removes the deployment and keeps the
  service and its repository. Like a delete, it needs `confirm` repeating the
  service name, and it deletes what a force delete would of the deployment: a
  self-managed deployment's whole cloud with everything in it, and the
  tenants of its add-ons. Afterwards the service can be deployed again, of
  either type. It is idempotent, and repeating it after a failure retries;
  until it succeeds, a request for a deployment is a `409`.
- Archiving a service whose deployment is self-managed and can be deleted is a
  `409`: only `force=true` deletes its cloud.

Service bodies still list a deployment under `spec.clouds` and
`status.clouds`, from when a deployment was called a cloud. Each entry of
`status.clouds` has its `type`.

### Add-ons

An **add-on** is extra infrastructure on a platform-managed deployment, such as
a database. Services that attach it on one binding share an instance, and each
gets a tenant.

| Method and path | Body | Result |
| --- | --- | --- |
| `POST /v1/services/{name}/addons/{addon}` | `{"options"?}` | `200` if unchanged, `202` operation queued, `409` for a service without a platform-managed deployment the add-on attaches to |
| `DELETE /v1/services/{name}/addons/{addon}?confirm={name}` | | `200` if unchanged (including an add-on the service doesn't have), `202` operation queued |
| `GET /v1/addons` | | `200` `{"addons": [...]}`: each add-on's `name`, `title`, `deployments` and `instances` |

- `spec.options` holds the options chosen for the service itself, and
  `spec.cloud_options` those chosen for its deployment, by the
  deployment's name. `options` in `POST /v1/services` carries both: the
  server gives each to the definition that declares it, and a deployment's
  option in a request without a deployment is a field error.
  `POST /v1/services/{name}/deployment` takes only the deployment's.
  A value outside an option's `choices` in the catalog is a field error
  on `options` that lists them.
- An option the catalog marks `immutable` is stored with its effective
  value, default included, when the service, its deployment or its
  add-on is created, and shows in `spec` like any other. Asking for
  another value, or `null`, is a `409`, on all three endpoints.
- `spec.addons` holds the attached add-ons by name, with their options.
  `status.addons` holds the tenants the service may have (`name`, `instance`),
  and a tenant's stateful resources are listed under `stateful` with `addon`.
- The first attach waits for the instance to be created. Meanwhile the
  operation's step is `waiting` and the service's `Reconciling` condition has
  reason `WaitingForAddon`.
- A detach destroys the tenant and its data, so it needs `confirm`. Archiving
  a service with an add-on is a `409`.
- In `GET /v1/addons`, each instance has `name` (`<addon>-<binding>`),
  `resource_name`, `deployment`, `binding`, `phase` (`provisioning`, `ready`,
  `failed`, `deleting`), `message` and `tenants`, counted from the services
  now. Its outputs are not shown.

## Operations

`GET /v1/operations/{id}[?wait=60s&revision=N]` returns the operation.

With `wait`, it long-polls (up to 5 minutes) until the operation's `revision`
differs from `N` (default: the current one), for example when it starts
running, makes progress or finishes. A running operation has:

- a `step`: `rendering`, `initializing`, `applying`, `deleting`, `finishing`,
  or `waiting` for an add-on's instance;
- while applying, `progress` (`done`, `total`, `current`), updated at most
  every 2 seconds.

An apply that failed for a transient reason (a rate limit, a 5xx from GitHub
or GCP, a network timeout) is `retrying`, which isn't a finished state: it has
`attempt` (the attempts made), `next_attempt_at` and `error` (the last
failure). The operation then ends `succeeded`, or `failed` once the retries run
out, with `attempt` set. The service's `Ready` condition has the reason
`Retrying` meanwhile. See [Retrying transient failures](how-it-works.md#retrying-transient-failures).

`POST /v1/operations/{id}/cancel` stops a `retrying` operation and returns it,
`failed`, with the last error and who cancelled it. It takes the admin
[role](#roles). It answers `409` for an operation that is queued, running or
finished, and `404` for one that doesn't exist.

A succeeded apply has `changes` (`add`, `change`, `destroy`, `import`),
Terraform's count of what it changed.

`GET /v1/services/{name}/operations` lists a service's operations and
`GET /v1/operations` lists every service's, newest first. Any signed-in user
may read them.

- Query: `state` (`queued`, `running`, `succeeded`, `failed`), `kind` (see
  below), `before` (an operation ID: only older ones) and `limit` (1 to 200,
  default 50; anything else is a `400`).
- Body: `{"operations": [...], "next": "op_..."}`. `next` is present when more
  remain: pass it as `before` for the next page.
- The service's list is a `404` for a service that doesn't exist, including
  one that was force deleted. The all-services list leaves out the operations
  of force-deleted services and of add-on instances.
- Operations are kept forever for now.

An operation's `kind` says what the request did: `create` (a new service),
`import` (a new service from an existing repository), `update` (a create on
an active service), `restore` (a create on an archived one), `deploy`,
`undeploy`, `migrate`, `archive`, `delete` (a force delete), `attach-addon`,
`detach-addon` and `plan` (see [Plans](#plans)). It is absent from operations recorded before kinds
existed.

### Plans

`POST /v1/services/{name}/plan` queues a `plan` operation: what applying the
service would change now, with the server's catalog and settings and the
binding revisions the service records, or with each deployment's binding at
its latest revision for `?binding=latest`, which previews a migrate. It
changes nothing, so it takes no `confirm`, and it honors an `Idempotency-Key`.
It answers `202` with the operation; it takes no `wait`, since the service in
that answer holds no plan. Read the operation with
`GET /v1/operations/{id}?wait=DURATION`.

When the operation succeeds it has `plan`:

```json
{
  "catalog": "v0.4.0",
  "bindings": {"gcp": 2},
  "add": 2, "change": 1, "replace": 1, "destroy": 0,
  "changes": [
    {"address": "module.cloud_gcp.google_cloud_run_v2_service.this", "actions": ["update"]},
    {"address": "module.cloud_gcp.google_artifact_registry_repository.images", "actions": ["delete", "create"], "stateful": true}
  ],
  "stateful_affected": [
    {"address": "module.cloud_gcp.google_artifact_registry_repository.images", "actions": ["delete", "create"], "stateful": true}
  ]
}
```

`bindings` is the binding revision planned for each deployment, by
deployment name. `changes` lists every resource the plan changes, with
Terraform's `actions`: `create`, `update`, `delete`, or two of them for a
replacement. `stateful_affected` is the changes that delete a resource the
catalog declares stateful, to replace it or for good: the data in those is
lost. A plan that fails fails its operation with `planning failed: ...` and
is never retried. It changes nothing on the service: not its generation,
conditions or `status.last_operation`.

## Cloud bindings

A **cloud binding** says where one provider's deployments land.

| Method and path | Body | Result |
| --- | --- | --- |
| `POST /v1/bindings` | `{"name","provider","values"?}` | `201` binding with a new revision (`Location: /v1/bindings/{name}?revision=N`), `200` if unchanged |
| `PATCH /v1/bindings/{name}` | `{"values"}` (`null` removes a value) | `201` new revision, `200` if unchanged |
| `GET /v1/bindings` | | `200` `{"bindings": [...]}`, each at its latest revision |
| `GET /v1/bindings/{name}[?revision=N]` | | `200` binding, latest revision by default |
| `DELETE /v1/bindings/{name}` | | `200` the deleted binding, `409` while a deployment uses any revision |

- A binding body has `kind` (`CloudBinding`), `name`, `revision`, `spec`
  (`provider`, `values`), `requested_by` and `created_at` of that revision, and
  `status` (`valid`, `errors`), checked against the server's catalog on every
  read.
- Revisions are immutable: a write that changes the values stores the next
  one, and an identical write stores nothing.
- Binding writes need no Terraform, so they answer at once, without an
  operation.
- Values are configuration, not secrets. Anyone signed in can read them;
  writing and deleting bindings takes the admin [role](#roles).

A deployment whose definition declares a `binding { }` block records the
binding revision it is created with. `binding` in a deployment request names
it; without one, its only valid binding is used, and none or several is a
`400` on `deployment`. The service's `spec.bindings` shows it as
`{"name", "revision"}`.

Applies, archives and force deletes render the deployment with that revision,
so updating a binding never re-applies existing deployments; deployments
created afterwards get the new revision. An existing deployment keeps its
binding: naming another one is a `409`.

A service body also says when the service was last applied with another
catalog revision than the server's, as `catalog_update`:
`{"applied": "<revision>", "current": "<revision>"}`. It is absent for a
service that is current, never applied, archived or deleted. The service's next
apply moves it to the current catalog.

It likewise says when the service was last applied with other settings than the
server's, as `settings_update`: `{"applied": "<digest>", "current": "<digest>"}`,
the first 12 characters of the digests of the settings its definitions read
(`status.settings_digest` holds the whole digest of the last apply). `applied`
is empty for a service applied before digests were recorded. It is absent under
the same conditions as `catalog_update`.

A service body lists the deployments that record an earlier revision than
their binding's latest under `binding_updates`, each as
`{"deployment", "binding", "revision", "latest"}`.
`POST /v1/services/{name}/migrate?confirm={name}` records the latest revision
for each and applies the service, which also brings it to the current catalog
and settings. With nothing to migrate it changes nothing, unless the last apply
failed, which it retries. A latest revision the catalog
doesn't accept is a `409`.

## Catalog

`GET /v1/catalog` lists each definition's components, a deployment's `type`
(`platform-managed` or `self-managed`), the options of the service and of
each deployment (`options`: each one's `name`, `type`, `default` and, when the catalog
limits it, `choices`, the values it accepts, and `immutable: true` for
one fixed once set) and, for a deployment that
declares a `binding { }` block, its binding schema (`binding`: each
attribute's `name`, `type` and `default`).

Values are checked against that schema: an undeclared attribute, a missing
required one or a value of the wrong type is a `400` naming the attribute, and
values are stored in the declared types. Such a deployment is `enabled` (can
be requested) only while its settings satisfy `enabled_when` and a valid
binding exists for its provider; its `reason` says which is missing. A
deployment without a binding block takes no binding.

## Sign-in

`GET /v1/auth/config` takes no token and answers `200` with
`{"issuer","client_id","audience","scopes"}`: the issuer the server trusts
and the CLI's client there, which is what `anvil login` needs in order to
sign in ([Setting up sign-in with Okta](okta.md)).

`GET /v1/whoami` answers `200` with `{"subject","groups","role"}`: who the
server takes the caller to be, from the access token, and the role their
groups give them. The subject is what Anvil records as the requester of a
change.

The server checks each access token's signature against the issuer's
published keys, and that it was issued by that issuer, for Anvil's audience,
to the CLI's client, and hasn't expired. It keeps no sessions: a token works
until it expires.

## Roles

What a caller may do comes from the `groups` claim of their access token.
Roles are organization-wide, and each includes the ones above it:

| Role | Who | May |
| --- | --- | --- |
| viewer | anyone signed in | read services, operations, bindings, add-ons and the catalog |
| developer | members of the developer group (`anvil-developers`) | also create, deploy, archive and restore services, add or remove their add-ons, and preview what an apply would change (plan), which runs Terraform with the server's credentials |
| admin | members of the admin group (`anvil-admins`) | also create, update and delete bindings, migrate services onto a binding's current values, cancel retrying operations, and permanently delete services |

In routes: every `GET` takes a viewer. `POST /v1/services`,
`POST /v1/services/{name}/deployment`, `POST /v1/services/{name}/plan`, the
add-on routes and `DELETE /v1/services/{name}` take a developer. `DELETE /v1/services/{name}`
with `force=true`, `POST /v1/services/{name}/migrate`,
`POST /v1/operations/{id}/cancel` and the binding writes take an admin. The role is checked before the request is looked at, so a
caller without it gets `403` whatever they sent. The group names are the
server's `auth.developer_group` and `auth.admin_group`.

## Health

`GET /healthz` answers `200 ok`.

## Compatibility notes

- A service body's top-level `description` and `error`, from v0.1.0, are
  still included and deprecated. Read `spec` and `status` instead.
- `?wait=true` on a write keeps v0.1.0's synchronous behavior: the request
  returns when the apply finishes.
- Deployments created before bindings were recorded are migrated when the
  server starts; see [Releases and upgrades](releases.md#deployments-created-before-bindings).
