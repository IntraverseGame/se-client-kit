---
"@intraverse/se-client-contracts": patch
---

Vendor four more public vector sets of the SuperEngine fairness kernel,
kernelVersion 1, on the test-only entry (`kernelVectors.v1`):
`round-secret-hash`, `coin-flip-payout`, `weighted-draw`, and `book-draw`. The
four earlier sets are unchanged. Sync the verify API document (`/verify/v1`) to
the version whose `kernel.vectorSets` example lists all eight sets; no schema
change, and the generated types differ only in that doc comment.
