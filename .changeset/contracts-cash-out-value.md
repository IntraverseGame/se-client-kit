---
"@intraverse/se-client-contracts": minor
---

Sync the Snapshot schema `se.snapshot/1` and the Play API document `/play/v1`
to the version with the Snapshot's top-level `cashOutValue`: an optional
`Amount`, computed by the server, that says what cashing out now would credit,
allowed on an `active` round of the `steps` presentation after its first step
only. The generated `Snapshot` and `PlayApiComponents` types gain
`cashOutValue`; no public type name is added (the generator's copy of `Amount`
for it, `Amount2`, is not exported). `@intraverse/se-client-snapshot` validates
against the synced schema, so it now accepts the field there and refuses it on
every other status, at step 0, and on the `playback` presentation. The test-only
entry adds the valid Snapshot vectors `cashorcrash-active-cash-out-value`,
`cashorcrash-active-cash-out-value-row2`, and
`cashorcrash-active-cash-out-value-free-bet`, and the invalid ones
`cash-out-value-on-idle`, `cash-out-value-on-starting`,
`cash-out-value-on-resolving`, `cash-out-value-on-won`,
`cash-out-value-on-lost`, `cash-out-value-on-canceled`,
`cash-out-value-on-playback`, `cash-out-value-on-step-0`, and
`cash-out-value-value-number`. No vendored vector changed.
