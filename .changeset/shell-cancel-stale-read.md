---
"@intraverse/se-client-shell": patch
---

The required cancel's own decision now compares Snapshot versions (W-29,
#163). An answer or a read of the round lower in `version` than the round's
latest Snapshot or than the cancel's own answers and reads is stale: a stale
answer tells nothing (the Snapshot is read), and a stale read is treated as no
read. Neither settles the cancel's state or allows its one resend. An equal
`version` is still read.
