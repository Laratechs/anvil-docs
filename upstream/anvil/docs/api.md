# HTTP API

All `/v1` routes take `Authorization: Bearer <your GitHub token>`. Every
response carries an `Anvil-Version` header.

| Method and path | Body | Result |
| --- | --- | --- |
| `POST /v1/services` | `{"name","description"?,"cloud"?,"options"?,"binding"?}` | `200` service if unchanged, `202` operation queued |
| `GET /v1/services` | | `200` `{"services": [...]}` |
| `GET /v1/services/{name}` | | `200` service, with an `ETag` |
| `DELETE /v1/services/{name}?confirm={name}[&force=true]` | | `200` if unchanged, `202` operation queued |
| `POST /v1/services/{name}/clouds` | `{"provider":"gcp"\|"aws","options"?,"binding"?}` | `200` if unchanged, `202` operation queued |
| `GET /v1/services/{name}/clouds/{provider}` | | `200` cloud |
| `GET /v1/operations/{id}[?wait=60s&revision=N]` | | `200` operation; with `wait`, long-polls (up to 5 minutes) until its `revision` differs from `N` (default: the current one), for example when it starts running, makes progress or finishes. A running operation has a `step` (`rendering`, `initializing`, `applying`, `deleting`, `finishing`) and, while applying, `progress` (`done`, `total`, `current`), updated at most every 2 seconds. A succeeded apply has `changes` (`add`, `change`, `destroy`, `import`), Terraform's count of what it changed |
| `POST /v1/bindings` | `{"name","provider","values"?}` | `201` binding with a new revision (`Location: /v1/bindings/{name}?revision=N`), `200` if unchanged |
| `PATCH /v1/bindings/{name}` | `{"values"}` (`null` removes a value) | `201` new revision, `200` if unchanged |
| `GET /v1/bindings` | | `200` `{"bindings": [...]}`, each at its latest revision |
| `GET /v1/bindings/{name}[?revision=N]` | | `200` binding, latest revision by default |
| `DELETE /v1/bindings/{name}` | | `200` the deleted binding, `409` while a cloud uses any revision |
| `GET /healthz` | | `200 ok` |

A `202` body is `{"operation", "service"}` with `Location:
/v1/operations/{id}`. Writes accept an `Idempotency-Key` header, remembered
for 24 hours per requester. Adding `?wait=true` to a write keeps the MVP's
synchronous behavior: it blocks until the operation finishes and returns
`201` (`200` for a delete) or `502` with the failure.

Service bodies have `spec`, `status` (with the derived `phase`) and
`generation`. Status lives only under `status`: the repository and image
in `status.repository_url` and `status.image`, and each cloud, with its
catalog definition's `title`, in `status.clouds`. The MVP's top-level
`description` and `error` are still included and deprecated. The MVP's `POST /v1/services/{name}/projects` with
`{"cloud"}` is a deprecated alias of the clouds route.

A cloud binding says where one provider's clouds land. Binding bodies have
`kind` (`CloudBinding`), `name`, `revision`, `spec` (`provider`, `values`),
`requested_by` and `created_at` of that revision, and `status` (`valid`,
`errors`), checked against the server's catalog on every read. Revisions are
immutable: a write that changes the values stores the next one, and an
identical write stores nothing. Binding writes need no Terraform, so they
answer at once, without an operation. Values are configuration, not
secrets. Any organization member can manage bindings until Anvil has an
operator role.

A cloud whose definition declares a `binding { }` block records the
binding revision it is created with (`binding` in a cloud request names
it; without one, the provider's only valid binding is used, and none or
several is a `400` on `cloud`). The cloud body's `spec.binding` and the
service's `spec.bindings` show it as `{"name", "revision"}`. Applies,
archives and force deletes render the cloud with that revision, so
updating a binding never re-applies existing clouds; clouds created
afterwards get the new revision. An existing cloud keeps its binding:
naming another one is a `409`.

Clouds created before clouds recorded their binding are migrated when the
server starts: for each cloud definition with a `binding { }` block, the
values it declares are taken from the server's settings for that
definition (`settings "cloud_gcp"`, as configured), stored as the binding
named after the provider (`gcp`) at revision 1, and recorded by every such
cloud. Nothing is re-applied, and the clouds render as before. A second
start changes nothing, and a provider with no such clouds gets no binding.
When the settings are missing, aren't a valid binding, or a binding with
the provider's name already says something else, the server still starts,
logs each cloud it left unbound with the reason, and those clouds' applies
(including archive and force delete) fail until the settings are fixed and
the server restarts. The migration never picks one of the operator's other
bindings.

`GET /v1/catalog` lists each definition's components, options and, for a
cloud that declares a `binding { }` block, its binding schema (`binding`:
each attribute's `name`, `type` and `default`). Values are checked against
that schema: an undeclared attribute, a missing required one or a value of
the wrong type is a `400` naming the attribute, and values are stored in
the declared types. Such a cloud is `enabled` (can be requested) only while
its settings satisfy `enabled_when` and a valid binding exists for its
provider; its `reason` says which is missing. A cloud without a binding
block takes no binding (both of the Laratechs catalog's clouds have one).

Errors are `{"error", "fields"?, "service"?}`, with status `400` (invalid,
with per-field messages), `401`, `403` (not an organization member), `404`
or `409` (the service's lifecycle doesn't allow it, or the name is an
unmanaged repository). Services have no team: a body with `team`, or
`?team=` on the list, is a `400` saying to omit it.
Terraform failures are reported on the operation and the service's `Ready`
condition.

