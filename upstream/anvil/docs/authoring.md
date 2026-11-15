# Guidance for catalog and template authors

The [catalog contract](catalog-contract.md) says what a catalog may declare
and what Anvil does with it. This page is about choices the contract leaves
to you, in a catalog's definitions and components and in the service
templates they create repositories from. Each section is a rule, why it
matters, and how to check it.

## Publish only what something consumes

Don't publish an artifact (a container image, a package, a bucket object, a
release asset) to a shared place unless something reads it. Don't create a
copy per service that nothing deletes.

Every artifact a catalog or template publishes needs all three:

1. **A named consumer.** Something on the service's path reads it: the
   deploy that runs the image, the job that installs the package. "Someone
   might want it later" isn't a consumer.
2. **A cleanup path the platform runs.** When the service, or the
   deployment that needed it, goes away, the artifact goes with it, without
   anyone deleting it by hand. The easy way to get this is to publish into a
   resource the catalog's own Terraform creates, so destroying that resource
   removes what is in it.
3. **A note in the docs saying why it exists.** The template's README or the
   catalog's docs name the consumer and the cleanup path, so the next author
   can tell a needed artifact from a leftover one.

### Why it matters

An artifact nobody reads still costs something, and the cost lands later, on
someone else:

- **It outlives the service.** A force delete removes what the catalog's
  Terraform manages. A package published to a shared registry by the
  service's CI isn't in that state, and the identity Anvil runs as may have no
  permission to delete it. A GitHub App, for one, can't delete packages.
- **It blocks the name.** A leftover package still belongs to the deleted
  repository, so a new service with the same name can't publish to it until
  someone with an owner's token deletes it by hand.
- **It looks like it matters.** A copy with a provenance record or an SBOM
  attached reads like the image of record. If the deploy path never uses
  it, that record describes an artifact no one runs.

### What to do instead

- **Publish into the deployment's own repository.** Have the component that
  gives a service a deployment create the image repository too, and grant
  the service's CI identity write access to that one repository. CI pushes
  there, the deploy pulls from there, and destroying the deployment removes
  the repository and every image in it.
- **Keep supply-chain records with the artifact that runs.** Push the whole
  image index, with its SBOM and provenance, to that same repository, and
  deploy the platform's image from it by digest. Then the records describe
  exactly what runs, and they go when it goes.
- **Publish nothing without a consumer.** A service with no deployment has
  nowhere its image would run, so its CI builds and tests the image and
  stops there. The build is the check.
- **Leave the rest to the team.** A team that wants the image somewhere else
  can add a job to its own CI that pushes to a registry it owns, and it then
  owns the cleanup.

### How to check

- For each publishing step in the template's CI, name the job or system
  that reads what it publishes. If you can't, remove the step.
- Look at what a force delete of a test service leaves behind in each
  registry the template writes to. Anything left is a cleanup path missing.
- Make the publishing step's condition match its consumer's. If a deploy
  happens only with a deployment, the push that feeds it should too.

The template's CI is copied into a service once, when it is created, and is
the team's after that. A change to a template reaches new services only, so
get the publishing rules right before services exist.
