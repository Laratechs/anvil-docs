# Using the CLI

From a checkout, `make install` builds the binary from your working tree into
`~/.local/bin/anvil` (set `BINDIR` to put it elsewhere), stamped with
`git describe` as its version; `make uninstall` removes it.

```
go install github.com/Laratechs/anvil/cmd/anvil@latest
export ANVIL_URL=https://anvil.example.com   # default http://localhost:8080

anvil service create orders
anvil service create -deploy orders                           # also gives it somewhere to run, on the platform, and waits for CI to deploy; safe to rerun any time
anvil service deploy orders                                   # give an existing service somewhere to run later
anvil service deploy -type=self-managed orders                # or a cloud of its own instead; a deployment's type can't change
anvil service deploy -binding=gcp-eu orders                   # choose where it lands when there are several bindings
anvil service deploy -option public=false orders              # make its Cloud Run service require authentication (public by default)
anvil service addon add postgres orders                       # a database on the platform, shared instance, a tenant of its own
anvil service addon remove postgres orders                    # delete its tenant and data (the instance goes with its last tenant)
anvil addon list                                              # add-ons, their shared instances and tenants
anvil service get orders                                      # the service, and its deployment with its options and binding
anvil service list
anvil service create -wait=false orders                       # don't wait; prints the operation
anvil operation wait op_0193a8f2...                           # pick a change back up
anvil service delete orders                                    # archive (restore with service create)
anvil service delete -force orders                             # permanently delete the repository and Cloud Run service
anvil version                                                  # client and server versions
anvil catalog show                                             # the server's catalog and the deployments it offers
anvil catalog render -cloud=gcp -bindings b.json orders ./out  # the Terraform Anvil would apply, without a server

# Operators: where deployments land
anvil binding create -provider=gcp -set project_id=example-services -set workload_identity_provider=projects/.../providers/laratechs gcp-shared
anvil binding update -set region=europe-west1 gcp-shared       # a new revision; existing deployments keep theirs
anvil service list                                             # the BINDING column marks services behind their binding
anvil service migrate orders                                   # move one service to the binding's latest revision
anvil binding get -revision=1 gcp-shared
anvil binding list
anvil binding delete gcp-shared                                # refused while a deployment uses any revision
```

A deployment is where a service runs. It is **platform-managed** (the
default: on the platform, the shared infrastructure the platform team
runs) or **self-managed** (a cloud of the service's own, which you deploy
into yourself). A service has at most one, and its type can't change.

An **add-on** is extra infrastructure on a platform-managed deployment,
such as a database. Every service that attaches it shares one instance
(per binding), and gets a tenant of its own there. The first service to
attach an add-on waits for the instance, which can take several minutes;
the last one to remove it takes the instance with it. A service with an
add-on can't be archived: remove the add-on first, or delete the service
with `-force`, which names the data that goes.

Run `anvil` (or any group, such as `anvil service`) with no arguments to list
its commands, and add `-help` to any command for its usage, options and
examples. Flags take one dash or two (`-deploy` or `--deploy`) and go before
positional arguments. Following HashiCorp CLI conventions, help you ask for
exits `0`, help printed because a command was incomplete exits `127`, and
errors exit `1`.


## Terminal status

While a change runs on an interactive terminal, the CLI also reports its
state with the [Program Status Protocol (OSC 7501)](https://www.superlogical.com/rex/docs/build/program-status),
so a terminal that supports it can show, in another tab, that the change is
working, waiting for you to confirm a delete, done, or failed. Terminals that
don't support it ignore the sequence. Nothing is reported with `-json`, when
stderr isn't a terminal, or for commands that only read.
