---
"@intraverse/se-client-wrapper": patch
---

The release's `headers.json` now recommends `Cross-Origin-Opener-Policy` for the
Wrapper (`/*`: `same-origin-allow-popups`, so a top-level Wrapper is isolated
from other windows yet keeps the signing window it opens) and the verify page
(`/verify/*`: `same-origin`), and the Pages deploy sends them. The signing page
(`/signer/*`) still sends none, since its own would cut its opener. The build
and the deploy refuse any other opener policy.
