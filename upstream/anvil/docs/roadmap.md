# Roadmap to 1.0

What stands between Anvil today and a 1.0 release. This page is a snapshot
taken on 2026-11-14, at v0.2.0. The
[issue tracker](https://github.com/Laratechs/anvil/issues) is the source of
truth for each item, and the [changelog](../CHANGELOG.md) records what ships.

## What 1.0 means

Anvil's docs already make one promise about 1.0: it is where breaking stops.
Until then a minor release may break
([Releases and upgrades](releases.md#releases)), and the catalog contract is
provisional ([Versioning and requirements](catalog-contract.md#versioning-and-requirements)).

**1.0 is for one organization: the one that builds Anvil.** Its platform team
runs one server for its own engineers, on GitHub, GCP and Okta. Running
anywhere, for anyone, comes after 1.0, and so does everything that only
another organization would need.

Five gates say what Anvil must do before making the promise. The maintainer
confirmed them on 2026-11-14. Each closes on a test, not on a judgment.

| Gate | Closed when |
| --- | --- |
| **1. No ticket for everyday work.** An engineer creates, runs, configures, observes and retires a service without asking the platform team. | Every workflow in [gate 1's list](#gate-1-no-ticket-for-everyday-work) has a passing scenario in the [validation harness](../e2e/README.md), and during the pilot no developer needed an admin for anything on it. |
| **2. The platform team can see and steer a change.** Before a catalog, settings or binding change reaches a service, they can see which services it affects and what it will do, and roll it out. | For each of the three kinds of change, a scenario lists the services affected, previews one and converges them all. |
| **3. The server is safe to depend on.** Its records can be backed up, and a restore on a new machine brings back a working server. | A scenario restores a snapshot onto an empty server, which then applies a change to a service it didn't create. The restore steps are in the server guide. |
| **4. What the docs describe has run for real.** Every documented workflow has run against the real identity provider and cloud, and engineers have used Anvil for real services. | Each item in [gate 4's list](#gate-4-what-the-docs-describe-has-run-for-real) has run, and the pilot has crossed one upgrade. |
| **5. The interfaces are worth keeping.** The catalog contract, HTTP API, CLI, server configuration and stored records are ones Anvil can keep compatible after 1.0. | Every item in [gate 5's list](#gate-5-the-interfaces-are-worth-keeping) is decided, the compatibility policy is published, and an upgrade from the release candidate is tested. |

## Where Anvil is today

Built and released, or merged for the next release:

- **Services:** a repository from a chosen template with a CI workflow the team owns and a
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

### Gate 1: no ticket for everyday work

Today a service reaches "a URL serving my code" unaided. The next steps an
engineer takes still go through the platform team. This list is the whole of
gate 1: a workflow that isn't on it doesn't hold up 1.0.

| Gap | State | Issue |
| --- | --- | --- |
| Secrets and runtime configuration for a Cloud Run service | Verify | [#6](https://github.com/Laratechs/anvil/issues/6) |
| Memory, CPU and scaling: changes made outside Anvil are reset at the next apply | Decide | [#43](https://github.com/Laratechs/anvil/issues/43) |
| Reading a service's own logs and metrics: developers sign in to the platform's project with Okta | Verify | [#45](https://github.com/Laratechs/anvil/issues/45) |
| Links to a service's console, logs and CI, which open once #45 is set up | Decide | [#9](https://github.com/Laratechs/anvil/issues/9) |
| Changing the CI workflow: teams own it after creation | Verify | [#77](https://github.com/Laratechs/anvil/issues/77) |
| A warning when an apply overwrites a managed file the team changed | Decide | [#79](https://github.com/Laratechs/anvil/issues/79) |
| Removing a deployment without deleting the service, which also lets its type change | Ready | [#7](https://github.com/Laratechs/anvil/issues/7) |
| Bringing an existing repository under Anvil | Ready | [#10](https://github.com/Laratechs/anvil/issues/10) |
| Work that doesn't fit a Cloud Run service: a scheduled job, a queue worker, a second deployment beside the first | Decide | [#80](https://github.com/Laratechs/anvil/issues/80) |

Logs and metrics ([#45](https://github.com/Laratechs/anvil/issues/45)) are
decided: the platform team grants the Okta developers group read access to
the platform's project once, at setup, through Workforce Identity
Federation. Anvil still grants no access to people
([Decisions](decisions.md#decisions)), and every developer can read every
service there.

One needs the most thought:

- [#80](https://github.com/Laratechs/anvil/issues/80) asks what the platform
  rules out. It offers one kind of deployment, a container that answers HTTP
  requests, and the only way out is a project of the service's own, which
  starts empty and has no add-ons. The pilot should say which shapes real
  services need before anything is built. One part can't wait for it:
  whether a service may ever have more than one deployment shapes the stored
  record, so it is decided before the freeze.

### Gate 2: the platform team can see and steer a change

Bindings already work this way: `anvil service list` marks a service behind
its binding, and `migrate` moves it. Catalog and settings changes don't yet.

| Gap | State | Issue |
| --- | --- | --- |
| Mark services last applied with an older catalog revision | Ready | [#50](https://github.com/Laratechs/anvil/issues/50) |
| Preview what an apply would do: `anvil service plan` | Decide | [#47](https://github.com/Laratechs/anvil/issues/47) |
| Settings changes don't reach running services, and nothing converges many services at once | Decide | [#46](https://github.com/Laratechs/anvil/issues/46) |
| List a service's operations: who changed what, and when | Decide | [#8](https://github.com/Laratechs/anvil/issues/8) |
| A failed apply waits for someone to repeat the request | Decide | [#81](https://github.com/Laratechs/anvil/issues/81) |

### Gate 3: the server is safe to depend on

One server holds Anvil's records in files and its leases in memory. The plan
is a store replicated by Raft inside `anvil server`
([#62](https://github.com/Laratechs/anvil/issues/62)), with nothing else to
run.

1.0 needs that store on one node, with snapshot and restore. While the
server is down nobody can change a service, but every service keeps running,
so 1.0 doesn't wait for a second node. The store has to land before the
freeze because 1.0 freezes the stored records. Clustering adds nodes without
changing them, so it [follows 1.0](#after-10).

| Gap | State | Issue |
| --- | --- | --- |
| Foundations: store contract tests, a per-incarnation service ID, progress kept out of the stored record, the state machine | Ready | [#64](https://github.com/Laratechs/anvil/issues/64), [#65](https://github.com/Laratechs/anvil/issues/65), [#66](https://github.com/Laratechs/anvil/issues/66), [#67](https://github.com/Laratechs/anvil/issues/67) |
| A single-node Raft store replaces the file store | Ready | [#68](https://github.com/Laratechs/anvil/issues/68), [#69](https://github.com/Laratechs/anvil/issues/69) |
| A request's records are written in one commit | Ready | [#70](https://github.com/Laratechs/anvil/issues/70) |
| Finished operations age out | Ready | [#71](https://github.com/Laratechs/anvil/issues/71) |
| Snapshot and restore | Ready | [#75](https://github.com/Laratechs/anvil/issues/75) |
| The server's own metrics: it has a health check and logs only | Decide | [#82](https://github.com/Laratechs/anvil/issues/82) |
| A review of what the server holds and who can reach it: the GitHub App key, the cloud credentials, the data directory and the API | Ready | [#83](https://github.com/Laratechs/anvil/issues/83) |
| How the pilot's server and CLI are installed: a release is a tag, installed with `go install` from a private repository | Decide | [#84](https://github.com/Laratechs/anvil/issues/84) |

### Gate 4: what the docs describe has run for real

Three features are built and tested against fakes or mock providers only,
and nobody but the maintainer has used Anvil.

| Gap | State | Issue |
| --- | --- | --- |
| Sign-in and roles against a real Okta authorization server | Verify | [#52](https://github.com/Laratechs/anvil/issues/52) |
| Self-managed GCP projects: create, CI image push, force delete | Verify | [#41](https://github.com/Laratechs/anvil/issues/41) |
| The PostgreSQL add-on on real Cloud SQL, including detaching while connections are open | Verify | [#42](https://github.com/Laratechs/anvil/issues/42) |
| A second person sets up their CLI and creates a service from the docs alone | Ready | [#85](https://github.com/Laratechs/anvil/issues/85) |
| The pilot | Ready | [#86](https://github.com/Laratechs/anvil/issues/86) |

**The pilot** is two developers, the maintainer and one other, running real
services. They use Anvil together on shared services and each alone on their
own, and stay on it across at least one upgrade. Whenever one of them has to
ask an admin, leave Anvil or work around it, that becomes an issue. Those
issues settle the Decide items in gates 1 and 2.

### Gate 5: the interfaces are worth keeping

Whatever ships in 1.0 stays. These are what would be frozen by accident.

| Gap | State | Issue |
| --- | --- | --- |
| Names from before deployments: `spec.clouds`, `cloud_<name>` and a binding's `provider` still say cloud ([Glossary](../CONTEXT.md#names-from-before-deployments)). Rename them, or keep them for good | Decide | [#87](https://github.com/Laratechs/anvil/issues/87) |
| Whether a service may ever have more than one deployment. The record holds a list and the engine allows one | Decide | [#80](https://github.com/Laratechs/anvil/issues/80) |
| MVP leftovers in the API: the deprecated top-level `description` and `error`, and `?wait=true` ([Compatibility notes](api.md#compatibility-notes)) | Ready | [#88](https://github.com/Laratechs/anvil/issues/88) |
| Catalog contract 2 is still read, and the contract that 1.0 freezes isn't chosen | Decide | [#89](https://github.com/Laratechs/anvil/issues/89) |
| Upgrade code for releases nobody runs: settings that moved to bindings, deployments from before bindings, services created with a team ([Older releases](releases.md#older-releases)) | Ready | [#90](https://github.com/Laratechs/anvil/issues/90) |
| A compatibility policy for after 1.0: what may change in the API, CLI, configuration and stored records, how deprecations are announced, and which upgrade paths are tested | Decide | [#91](https://github.com/Laratechs/anvil/issues/91) |
| Sender-constrained tokens (DPoP) change how every request is authorized, so decide before the freeze | Decide | [#57](https://github.com/Laratechs/anvil/issues/57) |
| Machine callers: only people can sign in, so CI can't call Anvil | Decide | [#92](https://github.com/Laratechs/anvil/issues/92) |

## A suggested order

The gates don't have to close in order, and the store work depends on
nothing else here. The pilot starts early, because it is what settles the
open decisions.

1. **Prove what's built.** Run sign-in, self-managed projects and the
   PostgreSQL add-on for real, and correct the guides. This is checking, not
   building, and everything after it stands on these features.
2. **Unblock the pilot.** Secrets (#6), import (#10) for the services that
   already exist, and team-owned CI (#77).
3. **Start the pilot** on the current server. Record what it turns up
   against sizing (#43), logs (#45), links (#9) and the limits of Cloud Run
   (#80).
4. **Remove the remaining tickets,** in the order the pilot asks for them.
   Undeploy (#7) follows.
5. **Show what a change will do.** The catalog marker (#50), then plan (#47),
   then settings and convergence (#46).
6. **Replace the store.** Foundations, the single-node switch, then snapshot
   and restore (#64 to #71, #75). The operation list (#8) builds on it. This
   can run alongside steps 2 to 5, and the pilot crosses it as an upgrade.
7. **Freeze.** Settle the names, remove the leftovers, write the
   compatibility policy, and tag a release candidate.

## After 1.0

Decided and deliberately later. None of it changes an interface 1.0 freezes.

- **Clustering:** peer TLS, join and remove, leader-only work, status and
  readiness ([#72](https://github.com/Laratechs/anvil/issues/72),
  [#73](https://github.com/Laratechs/anvil/issues/73),
  [#74](https://github.com/Laratechs/anvil/issues/74),
  [#76](https://github.com/Laratechs/anvil/issues/76)). Until then a lost
  node is restored from a snapshot.
- **Running anywhere.** Terraform state in S3-compatible storage as well as
  GCS ([#63](https://github.com/Laratechs/anvil/issues/63)), and published
  binaries and a container image for other organizations.

## Out of scope for 1.0

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
- **Platform CI changes for existing services.** The CI workflow arrives
  with the template and is the team's from then on, so a later improvement
  reaches new services only
  ([#78](https://github.com/Laratechs/anvil/issues/78)).
