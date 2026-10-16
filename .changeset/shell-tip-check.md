---
"@intraverse/se-client-shell": minor
---

`validateChainConfig` validates the chain part of the environment
configuration: the environment, the pinned signer address and registry domain,
the RPC endpoints of each entropy source with their providers, `minRpcQuorum`
(default 2), and the required `tipLagMargin`. It refuses `production` with a
quorum below 2, two endpoints of one source that share a provider, and a source
with fewer endpoints than the quorum, and flags `local` and `preview` with a
quorum of 1 as degraded. The RPC transport types (`RpcTransport`, `RpcCall`,
`BlockTag`) are public; the transport gets an optional abort signal
(play-client's `CancelSignal`; the platform `AbortSignal` satisfies it) that is
aborted when its call times out, and may ignore it. Inside the package: the tip
check over every configured endpoint, its record, and the decision to pass or
fail.
