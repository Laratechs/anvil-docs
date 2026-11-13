# Using the CLI

The `anvil` command sends requests to an Anvil server, which creates and
changes your services. This page covers setup and every common task; run
`anvil` with no arguments for the full command list, and add `-help` to any
command for its options and examples.

## Set up

Install the binary, point it at your server, and sign in to GitHub:

```
go install github.com/Laratechs/anvil/cmd/anvil@latest
export ANVIL_URL=https://anvil.example.com   # default http://localhost:8080
gh auth login
```

Anvil identifies you by your GitHub account, using `ANVIL_TOKEN` if set and
otherwise `gh auth token`. It uses the token only to find out who you are and
that you're an active member of the organization.

From a checkout, `make install` builds the binary from your working tree into
`~/.local/bin/anvil` (set `BINDIR` to put it elsewhere), stamped with
`git describe` as its version. `make uninstall` removes it.

## Create a service

```
anvil service create orders            # a repository and CI
anvil service create -deploy orders    # also somewhere to run, on the platform
```

`-deploy` waits for the service's CI to deploy it, then prints the URL. Repeat
a command whenever you like: it changes only what differs from what you asked
for, and retries from where it stopped if the last attempt failed.

Every change waits until it is done and shows its progress. Interrupting with
Ctrl-C stops the waiting, not the change. Pick it back up with
`anvil operation wait <id>`, or skip the wait with `-wait=false`, which prints
the operation instead.

## Give a service somewhere to run

A **deployment** is where a service runs. It is **platform-managed** (the
default: on the platform, the shared infrastructure the platform team runs) or
**self-managed** (a cloud of the service's own, which you deploy into
yourself). A service has at most one, and its type can't change, so choose
before you deploy.

```
anvil service deploy orders                          # on the platform
anvil service deploy -type=self-managed orders       # a cloud of its own instead
anvil service deploy -binding=gcp-eu orders          # pick where it lands, when there are several
anvil service deploy -option public=false orders     # require authentication on its Cloud Run service
```

`-option` sets a choice the catalog offers for the deployment, and
`anvil catalog show` lists them. Options not chosen take the catalog's
default. For Cloud Run, see
[Running services on Cloud Run](gcp.md).

## Add a database

An **add-on** is extra infrastructure on a platform-managed deployment, such
as a PostgreSQL database. Every service that attaches the add-on shares one
instance (per binding) and gets a tenant of its own on it.

```
anvil addon list                           # add-ons, their shared instances and tenants
anvil service addon add postgres orders
anvil service addon remove postgres orders # deletes the tenant and its data
```

The first service to attach an add-on waits for the instance, which can take
several minutes. The last one to remove it takes the instance with it. A
service with an add-on can't be archived: remove the add-on first, or delete
the service with `-force`, which names the data that goes.

## Look at what you have

```
anvil service list
anvil service get orders       # the service, its deployment, options and binding
anvil version                  # client and server versions
anvil catalog show             # what the server's catalog offers
```

## Archive, restore and delete

```
anvil service delete orders          # archive: keeps the repository and the record
anvil service create orders          # restore it
anvil service delete -force orders   # delete the repository and everything Anvil made
```

Both ask you to type the service name first, after listing what will happen
and which resources hold data that is lost. What each one removes is in
[Archiving and deleting](how-it-works.md#archiving-and-deleting).

## For platform engineers

Operators manage **cloud bindings**, which say where a provider's
deployments land, such as the shared GCP project:

```
anvil binding create -provider=gcp -set project_id=example-services -set workload_identity_provider=projects/.../providers/laratechs gcp-shared
anvil binding update -set region=europe-west1 gcp-shared   # a new revision; existing deployments keep theirs
anvil binding list
anvil binding get -revision=1 gcp-shared
anvil binding delete gcp-shared                            # refused while a deployment uses any revision
anvil service list                                         # the BINDING column marks services behind their binding
anvil service migrate orders                               # move one service to the binding's latest revision
```

To see what a catalog would build without a server, render it:

```
anvil catalog render -cloud=gcp -bindings b.json orders ./out
```

Setting these up is covered in [Running the server](server.md).

## Signing in with Okta

Sign-in through the organization's identity provider is being introduced in
steps, and will replace the GitHub token above. On a server configured for
it ([Setting up sign-in with Okta](okta.md)):

```
anvil login     # prints a link and a code, and waits for you to approve in a browser
anvil whoami    # who you are signed in as
anvil logout    # remove the stored credentials
```

Open the link in any browser, on this machine or another, check the code
and approve. Anvil never sees your password, and the token the CLI receives
works only for Anvil.

Credentials are kept per Anvil server in `credentials.json`, in
`$ANVIL_CONFIG_DIR` if set and otherwise the `anvil` directory of your
configuration directory (`~/.config/anvil` on Linux,
`~/Library/Application Support/anvil` on macOS). The file is readable only
by you. The CLI signs in only to a server address that is `https`, or `http`
on this machine.

For now the other commands still identify you by your GitHub token.

## Conventions

- Flags take one dash or two (`-deploy` or `--deploy`) and go before
  positional arguments.
- `-json` prints the response as JSON for scripts. It also silences the
  progress output.
- Following HashiCorp CLI conventions, help you ask for exits `0`, help
  printed because a command was incomplete exits `127`, and errors exit `1`.

## Terminal status

While a change runs on an interactive terminal, the CLI also reports its
state with the [Program Status Protocol (OSC 7501)](https://www.superlogical.com/rex/docs/build/program-status),
so a terminal that supports it can show, in another tab, that the change is
working, waiting for you to confirm a delete, done, or failed. Terminals that
don't support it ignore the sequence. Nothing is reported with `-json`, when
stderr isn't a terminal, or for commands that only read.
