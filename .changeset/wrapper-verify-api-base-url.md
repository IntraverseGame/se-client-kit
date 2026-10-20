---
"@intraverse/se-client-wrapper": minor
---

The environment configuration document has a new required field,
`verifyApiBaseUrl`: the verify API base, an absolute URL (`https:`, or `http:`
on a loopback host, with no credentials, query, or fragment) whose path ends
with `/verify/v1`, with no trailing slash. The Wrapper validates it and does
not use it; the verify page reads the same document. It is never derived or
defaulted: a document without it, or with another form, is refused with the
configuration-error state. Update every environment's configuration document
in the same release as this one.
