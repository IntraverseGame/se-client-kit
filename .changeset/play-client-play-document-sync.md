---
"@intraverse/se-client-play-client": patch
---

The Play API types follow the synced Play API document `/play/v1`: they carry
`BookRtp` and the optional `rtp` of a book game's `config`, an optional
`gamePath` on `RedeemLaunchCodeResponse` (the path of the game's page on
`gameOrigin`), and the document's new descriptions. `redeemLaunchCode` does
not return `gamePath` yet (#164). Behavior is unchanged.
