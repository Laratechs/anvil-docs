# Roadmap to 1.0

What stands between Anvil today and a 1.0 release. This page is a snapshot
taken on 2026-11-13, at v0.2.0. The
[issue tracker](https://github.com/Laratechs/anvil/issues) is the source of
truth for each item, and the [changelog](../CHANGELOG.md) records what ships.

## What 1.0 means

Anvil's docs already make one promise about 1.0: it is where breaking stops.
Until then a minor release may break
([Releases and upgrades](releases.md#releases)), and the catalog contract is
provisional ([Versioning and requirements](catalog-contract.md#versioning-and-requirements)).

Nothing yet says what Anvil must be able to do before making that promise.
The five gates below are a proposal, drawn from what Anvil says it is for.
They stand until the maintainer confirms or changes them.

| Gate | Where it comes from |
| --- | --- |
| **1. No ticket for everyday work.** An engineer creates, runs, configures, observes and retires a service without asking the platform team. | "Ask it for a service by name and it gives you a repository, CI and somewhere to run it" ([What Anvil is](../README.md)) |
| **2. The platform team can see and steer a change.** Before a catalog, settings or binding change reaches a service, they can see which services it affects and what it will do, and roll it out. | "Each request describes the state you want, and Anvil converges on it" ([How Anvil works](how-it-works.md#idempotency)) |
| **3. The server is safe to depend on.** It survives losing a node, can be backed up and restored, and runs wherever the operator has a disk and a bucket. | The single-instance limit in [Decisions and known limitations](decisions.md#running-anvil) |
| **4. What the docs describe has run for real.** Every documented workflow has run against the real identity provider and cloud, and engineers have used Anvil for real services. | [How Anvil is tested](testing.md) |
| **5. The interfaces are worth keeping.** The catalog contract, HTTP API, CLI, server configuration and stored records are ones Anvil can keep compatible after 1.0. | [Releases and upgrades](releases.md#releases) |

## Where Anvil is today

Built and released, or merged for the next release:

- **Services:** a repository from a chosen template with managed CI and a
  versioned image; archive, restore and force delete; idempotent requests with
  a recorded operation for each change.
- **Deployments:** platform-managed on Cloud Run, ending with a URL serving
  the service's own code, or self-managed in a GCP project of the service's
  own. Bindings say where deployments land, and `anvil service migrate` moves
  a service to a binding's current values.
- **Add-ons:** a PostgreSQL database on a platform-managed deployment.
- **Sign-in and roles:** `anvil login` with Okta, and viewer, developer and
  admin roles from its groups.
- **Catalog:** a separate, versioned catalog behind the
  [catalog contract](catalog-contract.md), with settings, bindings, options
  and add-ons.
- **Verification:** unit and contract tests, the
  [validation harness](../e2e/README.md) against the real binary, Terraform
  and GitHub, and an upgrade scenario from the previous release.

## The gap

Each item's state is one of:

- **Ready**: decided, and can be built.
- **Decide**: needs a decision before it can be built.
- **Verify**: built, and not yet run against the real thing.
- **Untracked**: has no issue yet.

### Gate 1: no ticket for everyday work

Today a service reaches "a URL serving my code" unaided. The next steps an
engineer takes still go through the platform team.

| Gap | State | Issue |
| --- | --- | --- |
| Secrets and runtime configuration for a Cloud Run service | Ready | [#6](https://github.com/Laratechs/anvil/issues/6) |
| Memory, CPU and scaling: changes made outside Anvil are reset at the next apply | Decide | [#43](https://github.com/Laratechs/anvil/issues/43) |
| Extending the managed CI: edits are overwritten at the next apply | Decide | [#44](https://github.com/Laratechs/anvil/issues/44) |
| Reading a service's own logs and metrics on the platform | Decide | [#45](https://github.com/Laratechs/anvil/issues/45) |
| Links to a service's console, logs and CI | Decide | [#9](https://github.com/Laratechs/anvil/issues/9) |
| Removing a deployment without deleting the service, which also lets its type change | Ready | [#7](https://github.com/Laratechs/anvil/issues/7) |
| Bringing an existing repository under Anvil | Ready | [#10](https://github.com/Laratechs/anvil/issues/10) |

[#45](https://github.com/Laratechs/anvil/issues/45) needs the most thought:
it meets the decision that Anvil grants no access to people
([Decisions](decisions.md#decisions)).

### Gate 2: the platform team can see and steer a change

Bindings already work this way: `anvil service list` marks a service behind
its binding, and `migrate` moves it. Catalog and settings changes don't yet.

| Gap | State | Issue |
| --- | --- | --- |
| Mark services last applied with an older catalog revision | Ready | [#50](https://github.com/Laratechs/anvil/issues/50) |
| Preview what an apply would do: `anvil service plan` | Decide | [#47](https://github.com/Laratechs/anvil/issues/47) |
| Settings changes don't reach running services, and nothing converges many services at once | Decide | [#46](https://github.com/Laratechs/anvil/issues/46) |
| List a service's operations: who changed what, and when | Decide | [#8](https://github.com/Laratechs/anvil/issues/8) |
| A failed apply waits for someone to repeat the request | Untracked | |

### Gate 3: the server is safe to depend on

One server holds Anvil's records in files and its leases in memory. The plan
is a store replicated by Raft inside `anvil server`
([#62](https://github.com/Laratechs/anvil/issues/62)): one node or three, and
nothing else to run. Every step is decided.

| Gap | State | Issue |
| --- | --- | --- |
| Foundations: store contract tests, a per-incarnation service ID, progress kept out of the stored record, the state machine | Ready | [#64](https://github.com/Laratechs/anvil/issues/64), [#65](https://github.com/Laratechs/anvil/issues/65), [#66](https://github.com/Laratechs/anvil/issues/66), [#67](https://github.com/Laratechs/anvil/issues/67) |
| A single-node Raft store replaces the file store | Ready | [#68](https://github.com/Laratechs/anvil/issues/68), [#69](https://github.com/Laratechs/anvil/issues/69) |
| A request's records are written in one commit | Ready | [#70](https://github.com/Laratechs/anvil/issues/70) |
| Finished operations age out | Ready | [#71](https://github.com/Laratechs/anvil/issues/71) |
| Snapshot and restore | Ready | [#75](https://github.com/Laratechs/anvil/issues/75) |
| Clustering: peer TLS, join and remove, leader-only work, status and readiness | Ready | [#72](https://github.com/Laratechs/anvil/issues/72), [#73](https://github.com/Laratechs/anvil/issues/73), [#74](https://github.com/Laratechs/anvil/issues/74), [#76](https://github.com/Laratechs/anvil/issues/76) |
| Terraform state in S3-compatible storage as well as GCS | Decide | [#63](https://github.com/Laratechs/anvil/issues/63) |
| Release artifacts: a release is a tag, installed with `go install` from a private repository. No binaries or container image are published | Untracked | |
| The server's own metrics: it has a health check and logs only | Untracked | |

### Gate 4: what the docs describe has run for real

Three features are built and tested against fakes or mock providers only.

| Gap | State | Issue |
| --- | --- | --- |
| Sign-in and roles against a real Okta authorization server | Verify | [#52](https://github.com/Laratechs/anvil/issues/52) |
| Self-managed GCP projects: create, CI image push, force delete | Verify | [#41](https://github.com/Laratechs/anvil/issues/41) |
| The PostgreSQL add-on on real Cloud SQL, including detaching while connections are open | Verify | [#42](https://github.com/Laratechs/anvil/issues/42) |
| Real use: Anvil has no users yet. A pilot with real services, long enough to cross at least one upgrade | Untracked | |

### Gate 5: the interfaces are worth keeping

Whatever ships in 1.0 stays. These are what would be frozen by accident.

| Gap | State | Issue |
| --- | --- | --- |
| Names from before deployments: `spec.clouds`, `cloud_<name>` and a binding's `provider` still say cloud ([Glossary](../CONTEXT.md#names-from-before-deployments)). Rename them, or keep them for good | Untracked | |
| MVP leftovers in the API: the deprecated top-level `description` and `error`, and `?wait=true` ([Compatibility notes](api.md#compatibility-notes)) | Untracked | |
| Catalog contract 2 is still read, and the contract that 1.0 freezes isn't chosen | Untracked | |
| Upgrade code for releases nobody runs: settings that moved to bindings, deployments from before bindings, services created with a team ([Older releases](releases.md#older-releases)) | Untracked | |
| A compatibility policy for after 1.0: what may change in the API, CLI, configuration and stored records, how deprecations are announced, and which upgrade paths are tested | Untracked | |
| Sender-constrained tokens (DPoP) change how every request is authorized, so decide before the freeze | Decide | [#57](https://github.com/Laratechs/anvil/issues/57) |
| Machine callers: only people can sign in, so CI can't call Anvil | Untracked | |

## A suggested order

The gates don't have to close in order, and the store work depends on
nothing else here. One order that keeps each release useful:

1. **Prove what's built.** Run sign-in, self-managed projects and the
   PostgreSQL add-on for real, and correct the guides. This is checking, not
   building, and everything after it stands on these features.
2. **Remove the tickets.** Secrets (#6) first, then sizing (#43), CI
   extension (#44), logs (#45) and links (#9). Undeploy (#7) and import (#10)
   follow.
3. **Show what a change will do.** The catalog marker (#50), then plan (#47),
   then settings and convergence (#46).
4. **Replace the store.** Foundations, the single-node switch, then
   clustering (#64 to #76). The operation list (#8) builds on it. This can
   run alongside steps 2 and 3.
5. **Start a pilot** once steps 1 and 2 are done, on a single node.
6. **Freeze.** Settle the names, remove the leftovers, write the
   compatibility policy, and tag a release candidate.

## Proposed as out of scope for 1.0

Each is a documented limitation today
([Known limitations](decisions.md#known-limitations)). Saying so here keeps
them from becoming silent gaps; any can be pulled in.

- **AWS.** Anvil offers neither a deployment nor a cloud on AWS.
- **Services outside GitHub,** and CI other than GitHub Actions
  ([#33](https://github.com/Laratechs/anvil/issues/33)).
- **Credentials per binding.** One server holds one identity per provider
  ([#33](https://github.com/Laratechs/anvil/issues/33)).
- **A portal** or another request interface on top of the API.
- **Identity providers other than Okta.**
- **Credentials in the operating system's keychain.**
- **Branch protection** on service repositories.
