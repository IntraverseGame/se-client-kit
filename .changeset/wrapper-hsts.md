---
"@intraverse/se-client-wrapper": patch
---

The release's `headers.json` now recommends `Strict-Transport-Security:
max-age=31536000` for the Wrapper (`/*`), the verify page (`/verify/*`), and the
signing page (`/signer/*`), and the Pages deploy sends it, so a browser that has
visited once never makes a plain-HTTP first hop to them again. There is no
`includeSubDomains` and no preload: the zone is shared with the operator team,
so each SuperEngine origin sends its own header.
