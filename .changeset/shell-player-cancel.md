---
"@intraverse/se-client-shell": minor
---

The required `PlayerCancel` (W-25, W-26) is now signed with `signing`'s
`hashPlayerCancel`, still only when `T_0` is settled and only the tip check
failed. The injected cancel encoding and the `cancel-unavailable` error code
are gone.

The cancel follows the Snapshot contract `se.snapshot/1` as vendored from the
backend's b27afc5: `canceled` is final, and a cancel the engine has not
answered shows `resolving`. A `resolving` answer, or a `resolving` read after
any failed cancel call (refused or unknown), puts the cancel state in
`settling`, with no resend; so does a read that fails after an unknown outcome or a 422, and an unknown outcome followed by an `active` read with no move when no resend
is allowed (after the one resend, or after a re-issue). From signing until it settles (`in-flight`,
`settling`, `check-later`), the round's Snapshots from elsewhere are held back,
and only the flow's own counted reads (`refresh`, and the new `checkAgain`, one
at a time) settle it: `canceled`, `won`, and `lost` are the round's result with
no error, `active` is `not-taken` (also as the answer, or after a 400 or a
422), and `idle` is `ended`. After 30 reads without a settling one the state is
`check-later`. Problems a cancel call is answered with are kept in the round's evidence
(`cancelRefusals`: status, code, and `requestId` only).
