# Setting up sign-in with Okta

Engineers sign in to Anvil with `anvil login`, which sends them to Okta in
a browser. The CLI ends up holding a short-lived access token that Okta
minted for Anvil and nothing else. This guide sets up the Okta side and
points the server at it. You need to be an Okta administrator; the free
Integrator plan is enough for development.

The server verifies each token against Okta's published keys. It holds no
Okta secret, and no GitHub token ever reaches it from a caller.

## What gets created

| In Okta | What it is for |
| --- | --- |
| A custom authorization server with the audience `api://anvil` | Mints the access tokens. Its audience is what makes a token "for Anvil" |
| A native application, "Anvil CLI" | The CLI's identity at Okta. It is a public client: it has no secret, so there is nothing to distribute or leak |
| An access policy on the authorization server | Lets the CLI application use the device grant and refresh tokens |
| Two groups, `anvil-developers` and `anvil-admins`, and a `groups` claim | Decide what each person may do in Anvil |

## 1. Create the authorization server

**Security → API → Authorization Servers → Add Authorization Server.**

- **Name:** `Anvil`
- **Audience:** `api://anvil`

Note its **Issuer URI** (`https://<your-okta-domain>/oauth2/<id>`): the
server's `auth.issuer`. Use the issuer URI, not the metadata URI beside it.

The org authorization server (`https://<your-okta-domain>` with no
`/oauth2/...`) can't be used: its access tokens are for Okta's own API and
can't carry Anvil's audience.

## 2. Create the CLI application

**Applications → Applications → Create App Integration → OIDC - OpenID
Connect → Native Application.**

- **Name:** `Anvil CLI`
- **Grant types:** **Device Authorization** and **Refresh Token**. Clear
  the others.
- **Assignments:** the people or groups who may use Anvil.

After saving, under **General → Refresh Token**, choose **Rotate token
after every use**.

Note the **Client ID**: the server's `auth.client_id`. There is no client
secret.

## 3. Add an access policy

On the authorization server: **Access Policies → Add Policy.**

- **Assign to:** the `Anvil CLI` application only.

Add a rule to it:

- **Grant type:** **Device Authorization** (refresh tokens follow from the
  `offline_access` scope).
- **Scopes:** `openid`, `profile`, `offline_access`.
- **Access token lifetime:** one hour or less. A shorter lifetime narrows
  how long a copied token works; the CLI refreshes it without a prompt.

## 4. Create the groups and the groups claim

What someone may do in Anvil is their role, from their Okta groups:

| Role | Who | May |
| --- | --- | --- |
| viewer | anyone signed in | read services, operations, bindings, add-ons and the catalog |
| developer | members of the developer group (`anvil-developers`) | also create, deploy, archive and restore services, and add or remove their add-ons |
| admin | members of the admin group (`anvil-admins`) | also create, update and delete bindings, migrate services onto a binding's current values, and permanently delete services |

**Directory → Groups → Add group**, twice: `anvil-developers` and
`anvil-admins`. Add people to them. An admin needn't also be in the
developer group. To use groups you already have, name them in the server's
`auth.developer_group` and `auth.admin_group` instead.

Then put a person's groups in their access token. On the authorization
server: **Claims → Add Claim.**

- **Name:** `groups`
- **Include in token type:** **Access Token**, always
- **Value type:** **Groups**
- **Filter:** **Starts with** `anvil-` (or a filter that matches the groups
  you named)
- **Include in:** any scope

Without this claim every token is a viewer's, and the server's log says so
the first time it sees one.

A change of groups reaches Anvil with the person's next access token: within
the access token lifetime (step 3), or at once if they run `anvil login`.

## 5. Configure the server

```hcl
# /etc/anvil/anvil.hcl
auth {
  issuer    = "https://<your-okta-domain>/oauth2/<id>" # step 1
  client_id = "<client id>"                            # step 2
}
```

Or `ANVIL_OIDC_ISSUER` and `ANVIL_OIDC_CLIENT_ID`. Neither is a secret.
`auth.audience` (`ANVIL_OIDC_AUDIENCE`) is only needed if the authorization
server's audience isn't `api://anvil`.

## 6. Verify

```
$ anvil login
To sign in, open this link in a browser:

    https://<your-okta-domain>/activate?user_code=ABCD-EFGH

and check that it shows the code ABCD-EFGH.

Waiting for you to approve (the code works for 10m0s)...
Signed in to https://anvil.example.com as alice@example.com.

$ anvil whoami
Signed in to https://anvil.example.com as alice@example.com.
Role:   admin (may also manage bindings, migrate services and permanently delete them)
Groups: anvil-developers, anvil-admins

$ anvil service list
```

The server reads the issuer's metadata when it starts and refuses to start
if it can't, so a wrong `auth.issuer` shows at once.

## 7. Let developers into the Google Cloud console

Optional. This is the Okta half of
[developer access](gcp-setup.md#6-developer-access): Google federates the
console sign-in to Okta, so developers read their services' logs with the
account they already use. It is a second application, because Google's
sign-in is a confidential web client and the CLI is a public one.

**Applications → Create App Integration → OIDC → Web Application.**

- **Name:** `Google Cloud console`
- **Grant types:** **Authorization Code**, and **Implicit (hybrid)** with
  **Allow ID Token with implicit grant type** checked. Google's guide for Okta
  selects both.
- **Sign-in redirect URI:**
  `https://auth.cloud.google/signin-callback/locations/global/workforcePools/POOL/providers/okta`
  (your pool ID, and the provider ID `okta` from the setup step)
- **Assignments:** the `anvil-developers` group.

Note its **Client ID** and **Client secret**: the workforce provider's
`--client-id` and `--client-secret-value`. Unlike the CLI application, this
one has a secret. It lives at Google; Anvil never sees it.

Then make its ID token carry groups. On the `Anvil` authorization server:

- **Claims → Add Claim:** name `groups`, include in **ID Token**, always;
  value type **Groups**, filter **Starts with** `anvil-`.
- **Access Policies:** add the `Google Cloud console` application to a
  policy with a rule that allows the Authorization Code grant.

The workforce provider's issuer is this server's issuer URI (step 1). A
person's groups reach Google at their next console sign-in. The Anvil server
isn't involved in this sign-in, and the setup step runs in Google's
console, not Anvil's.

This hasn't been run against a real Okta and organization yet
([#45](https://github.com/Laratechs/anvil/issues/45)).

## Troubleshooting

| Message | Cause |
| --- | --- |
| The server exits with `no sign-in configuration` | It has no `auth` block (step 5) |
| The server exits with `reading the issuer's metadata` | `auth.issuer` isn't the authorization server's issuer URI, or the server can't reach Okta |
| `anvil whoami` says `viewer` for someone in a group | The access token has no `groups` claim, or its filter doesn't match the group (step 4). The server logs `an access token carries no groups claim` when the claim is missing. If the groups are right, sign in again: the token predates the change |
| `the access token was not accepted` after a successful login | The server's log says why. Usually the authorization server's audience isn't the server's `auth.audience` (step 1), or `auth.client_id` names another application than the one the CLI signed in to |
| `does not offer the device authorization grant` | The issuer is the org authorization server, not a custom one (step 1) |
| `the issuer answered invalid_client` | `auth.client_id` isn't the native application's client ID, or the application isn't a native application with the Device Authorization grant (step 2) |
| `the issuer answered access_denied` when starting | No access policy rule matches the CLI application, the device grant and the scopes (step 3) |
| `sign-in was refused in the browser` | The user isn't assigned to the application (step 2), or declined |
| `the issuer returned no ID token` | The access policy rule doesn't allow the `openid` scope (step 3) |
