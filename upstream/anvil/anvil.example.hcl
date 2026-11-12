# Configuration for "anvil server -config=anvil.hcl". Every attribute is
# optional; the comment after each one is its default and the environment
# variable that overrides it. Relative paths are relative to this file.
# Secrets don't belong here: without a GitHub App, Anvil reads a token from
# ANVIL_GITHUB_TOKEN (development only).

listen   = ":8080"          # ANVIL_LISTEN, or -listen
data_dir = "/var/lib/anvil" # .anvil; ANVIL_DATA_DIR, or -data-dir. Must persist.
workers  = 4                # ANVIL_WORKERS: Terraform applies run at once

github {
  organization = "Laratechs" # ANVIL_GITHUB_ORG

  # Anvil's GitHub identity (docs/github-app.md). Without this block, Anvil
  # acts as ANVIL_GITHUB_TOKEN, else GITHUB_TOKEN, else "gh auth token".
  app {
    id               = "123456"                  # ANVIL_GITHUB_APP_ID: the App's ID or client ID
    private_key_file = "/secrets/github-app.pem" # ANVIL_GITHUB_APP_PRIVATE_KEY_FILE: a path, not the key
    # installation_id = 7890123                  # ANVIL_GITHUB_APP_INSTALLATION_ID: found on the organization if unset
  }
}

catalog {
  # Required: a local directory, or git::<url>?ref=<tag or commit>. The
  # server's GitHub identity fetches it, so it may be private.
  source       = "git::https://github.com/Laratechs/anvil-catalog.git?ref=v0.3.0" # ANVIL_CATALOG
  allow_branch = false                                                            # ANVIL_CATALOG_ALLOW_BRANCH: let source name a branch (development only)
}

terraform {
  binary = "terraform" # ANVIL_TERRAFORM_BIN: looked up on PATH unless a path

  state {
    bucket = "anvil-state"    # ANVIL_TF_STATE_BUCKET: GCS bucket; unset keeps state on local disk (development only)
    prefix = "anvil/services" # ANVIL_TF_STATE_PREFIX: each service's state is <prefix>/<name>
  }
}

# Settings for each catalog definition: "service" and "cloud_<provider>".
# What each accepts, and its defaults, is the definition's settings block in
# the catalog ("anvil catalog show"); the server refuses to start if a value
# doesn't fit. The ANVIL_SETTINGS JSON file, if set, wins over a block for
# the same definition, as a whole.

settings "service" {
  registry = "ghcr.io/laratechs"
  template = "Laratechs/anvil-template-go"
}

# How Cloud Run services are deployed. Where they land (the shared project,
# region and Workload Identity provider) is a gcp binding, created once the
# server runs, which is what offers the gcp cloud (docs/gcp-setup.md):
#   anvil binding create -provider=gcp -set project_id=example-services \
#     -set workload_identity_provider=projects/123456789012/locations/global/workloadIdentityPools/github/providers/laratechs \
#     gcp-shared
settings "cloud_gcp" {
  public = true
}

# AWS accounts have no settings: an aws binding offers them, with where they
# land (anvil binding create -provider=aws -set email_template=aws+{service}@example.com aws-main).
