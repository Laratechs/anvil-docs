# Using the CLI

From a checkout, `make install` builds the binary from your working tree into
`~/.local/bin/anvil` (set `BINDIR` to put it elsewhere), stamped with
`git describe` as its version; `make uninstall` removes it.

```
go install github.com/Laratechs/anvil/cmd/anvil@latest
export ANVIL_URL=https://anvil.example.com   # default http://localhost:8080

anvil service create orders
anvil service create -cloud=gcp orders                        # adds a Cloud Run service and waits for CI to deploy; safe to rerun any time
anvil cloud create -service=orders aws                        # add a cloud later
anvil cloud create -service=orders -binding=aws-eu aws        # choose where it lands when there are several bindings
anvil cloud create -service=orders -option public=false gcp   # make its Cloud Run service require authentication (public by default)
anvil service get orders
anvil service list
anvil cloud get -service=orders gcp
anvil service create -wait=false orders                       # don't wait; prints the operation
anvil operation wait op_0193a8f2...                           # pick a change back up
anvil service delete orders                                    # archive (restore with service create)
anvil service delete -force orders                             # permanently delete the repository and Cloud Run service
anvil version                                                  # client and server versions
anvil catalog show                                             # the server's catalog and the clouds it offers
anvil catalog render -cloud=gcp -bindings b.json orders ./out  # the Terraform Anvil would apply, without a server

# Operators: where a provider's clouds land
anvil binding create -provider=gcp -set project_id=example-services -set workload_identity_provider=projects/.../providers/laratechs gcp-shared
anvil binding update -set region=europe-west1 gcp-shared       # a new revision; existing clouds keep theirs
anvil binding get -revision=1 gcp-shared
anvil binding list
anvil binding delete gcp-shared                                # refused while a cloud uses any revision
```

`anvil create -service=NAME -cloud=PROVIDER` still works and prints
a note: it was renamed to `anvil cloud create`.

Run `anvil` (or any group, such as `anvil service`) with no arguments to list
its commands, and add `-help` to any command for its usage, options and
examples. Flags take one dash or two (`-cloud` or `--cloud`) and go before
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
