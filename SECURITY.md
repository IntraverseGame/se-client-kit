# Reporting Security Issues

This repository holds the code that holds the player's key. A vulnerability here
(for example in key handling, signing, Snapshot validation, or the build and
release supply chain) can put a player's money at risk, so please report it
privately and give us time to fix it before you disclose it.

## How to let us know

Use **GitHub private vulnerability reporting**: open the Security tab of this
repository and choose "Report a vulnerability". Your report is visible only to
the maintainers.
<!-- TODO: org owners enable private vulnerability reporting. -->

**Do not** put exploit details, proof-of-concept code, keys, tokens, or other
secrets in a public issue, pull request, or comment. This repository is public:
anything posted there is visible to everyone and cannot be taken back.

## What to include (in the private channel)

- What you found, and where (package, file, version or commit).
- How to reproduce it, and what an attacker could do.
- Whether it affects a released package or Wrapper bundle.

## Scope

In scope: the code in this repository and the packages and bundles built from
it. Out of scope: the backend service and the operators' own systems; if a
finding crosses into them, tell us and we will pass it on.

We will investigate all legitimate reports and do our best to fix the problem
quickly.
