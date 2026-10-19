---
"@intraverse/se-client-wrapper": patch
---

A later read can carry a lower Snapshot `version` than the one shown, which the
Wrapper drops (W-29). Where no poll would read the round again, such as a
move's or cash-out's result, or the start's answer from an ended round, the
Wrapper now reads the Snapshot again: up to four reads at the polling backoff
(500 ms, 1 s, 2 s, 2 s), then one every 30 s, until a read is taken. The
re-reads only read, show no notice, move no focus, and stop on a typed error, a
blocking state, or the session's end; they leave the shell's cancel reads
alone. A lower `version` is still never shown.
