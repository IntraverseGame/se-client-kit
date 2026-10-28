---
"@intraverse/se-client-wrapper": minor
---

The environment configuration's `verifyApiBaseUrl` must now be on the page's
own origin: the verify API sends no CORS headers, so it is read same-origin
only. The Wrapper refuses a document whose `verifyApiBaseUrl` has another
scheme, host, or port than the Wrapper's own origin, with the
configuration-error state (`invalid-verify-api-base`), and the verify page
applies the same rule against its own origin. Set the field to the page's own
origin plus `/verify/v1` in every environment's document before taking this
release.
