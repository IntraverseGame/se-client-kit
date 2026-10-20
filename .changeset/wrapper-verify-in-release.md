---
"@intraverse/se-client-wrapper": minor
---

The release artifact now carries the verify page under `verify/`, with its own
`<meta>` policy, SRI on its scripts and stylesheets, and its files in
`integrity-manifest.json`; `verify/index.html` is the second allowed HTML file.
`headers.json` now holds the headers by path pattern: `/*` for the Wrapper's
(as before) and `/verify/*` for the verify page's, whose policy has one
placeholder, `{{verifyConnectOrigins}}` (the origins of `verifyApiBaseUrl` and
of the RPC endpoints). The deploy side reads the Wrapper's headers from `/*`
and applies the `/verify/*` entry to that path. The size budget measures the
verify page apart from the Wrapper's.
