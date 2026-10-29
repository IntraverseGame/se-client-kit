---
"@intraverse/se-client-snapshot": patch
---

`validateSnapshot` follows the synced `se.snapshot/1` schema: an idle Snapshot
with `proofs` now reports its issue at `/proofs` only, no longer also at the
document. Validity and the first issue are unchanged. The validator's code is
unchanged; the rule is the schema's.
