# Using the CLI

The `anvil` command sends requests to an Anvil server, which creates and
changes your services. This page covers setup and every common task; run
`anvil` with no arguments for the full command list, and add `-help` to any
command for its options and examples.

## Set up

Install the binary, point it at your server, and sign in:

```
go install github.com/Laratechs/anvil/cmd/anvil@latest
export ANVIL_URL=https://anvil.example.com   # default http://localhost:8080
anvil login
```

`anvil login` signs you in with the organization's identity provider
([Signing in](#signing-in)). To have commands also wait for your service's CI
on GitHub, sign in to the GitHub CLI too (`gh auth login`); that token stays
on your machine.

From a checkout, `make install` builds the binary from your working tree into
`~/.local/bin/anvil` (set `BINDIR` to put it elsewhere), stamped with
`git describe` as its version. `make uninstall` removes it.

## Signing in

```
anvil login     # prints a link and a code, and waits for you to approve in a browser
anvil whoami    # who the server takes you to be, your groups and your role
anvil logout    # remove the stored credentials and end the sign-in at the identity provider
```

`anvil login` prints a link and a code. Open the link in any browser, on this
machine or another, check the code and approve; the command finishes by
itself. Anvil never sees your password, and the token the CLI receives works
only for Anvil. Anvil doesn't take GitHub tokens: `ANVIL_TOKEN` is no longer
read.

What you may do is your role, from your groups at the identity provider.
Everyone signed in may look. Creating and changing services takes the
developer role, and managing bindings, migrating services and `-force`
deletes take the admin role. A command you may not run says which group's
members may; once you have been added, run `anvil login` again.

The access token lasts about an hour, and the CLI replaces it without a
prompt for as long as your identity provider allows. When that ends, a
command says to run `anvil login` again.

Credentials are kept per Anvil server in `credentials.json`, in
`$ANVIL_CONFIG_DIR` if set and otherwise the `anvil` directory of your
configuration directory (`~/.config/anvil` on Linux,
`~/Library/Application Support/anvil` on macOS). How the CLI looks after
them:

- The file is readable only by you (mode `600`). If it is ever readable by
  others, commands refuse to use it and say how to fix it.
- Credentials are sent only to a server address that is `https`, or `http`
  on this machine.
- Commands running at once take turns replacing an expired token, through a
  lock file beside it (`credentials.json.lock`), so they never sign each
  other out.
- `anvil logout` removes the entry and tells the identity provider to revoke
  the sign-in, so a copy of the file stops working too. If the provider
  can't be reached, the entry is still removed and the command says so.
- When the identity provider ends a sign-in (it expired or was revoked), the
  entry is removed and the next command says to run `anvil login`.

The file isn't in your operating system's keychain: anything running as you
can read it.

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
default, and `name=null` returns one to it. An option may accept only
some values, which `anvil catalog show` lists after `one of`; any other is
refused with the list. An option shown as `fixed once set` keeps the
value a service was created with, the default if it chose none, and
asking for another is refused. When the catalog stops
offering an option a service has set, the service's warnings say so until
`-option name=null` clears it. A catalog can also offer options for the
service itself. Those are set with the same flag on `anvil service create`,
with or without a deployment
(`anvil service create -option template=python orders`), and Anvil gives
each option to whichever declares it. For Cloud Run, see
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
deployments land, such as the shared GCP project. Changing them, and
migrating services, takes the admin role:

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
anvil catalog render -cloud=gcp -bindings b.json -option template=python orders ./out   # as a requester's choice renders
```

`-option` takes the options a requester could choose, for the service or
the deployments in `-cloud`, and checks them as the server does.

Setting these up is covered in [Running the server](server.md).

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
