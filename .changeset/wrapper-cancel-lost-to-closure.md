---
"@intraverse/se-client-wrapper": patch
---

After the required cancel, a round that had closed before the cancel arrived is
never shown as canceled by the player. One that ends `canceled` with
`closeReason: "expired"` reads "This round failed verification." followed by
"The time limit ended this round.", not "…and was canceled". One that ends
`won` or `lost` shows its result with "This round failed verification; it closed
before the cancel arrived.", the round id, the verify link, and the next bet. A
result with no cancel of the shell's is shown as before.
