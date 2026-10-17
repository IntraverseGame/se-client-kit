---
"@intraverse/se-client-wrapper": minor
---

The Wrapper boots from its environment configuration document and renders from
validated Snapshots. At boot it reads the document (no credentials, no cache),
validates it against the Wrapper's schema with the shell's chain rules, and
refuses to start on an invalid one: `production` with `minRpcQuorum` below 2, a
source with fewer endpoints than `minRpcQuorum`, an unknown field, or a
malformed URL or origin list. It renders all seven statuses, the typed errors,
and the degraded states; polls while `starting` or `resolving` with backoff and
a "taking longer" notice; shows the connection-problem state without losing
the round; and keeps the round id, a copy control, and the verify link after a
round ends until the player starts another. Status changes go to a polite live
region and errors to `role="alert"`; polls never move focus. The release build
adds Subresource Integrity to the page's script and stylesheet, a `<meta>`
Content Security Policy, a `headers.json` with the recommended headers, and an
`integrity-manifest.json` of every file, then reads the written output back
and fails unless it holds only regular files (no symbolic link), exactly the
manifest's files with their hashes, and only allowed types: scripts and
stylesheets the page loads with integrity, the manifest and headers JSON, and
`index.html` as the one page (there is no public directory, and a dynamic
`import()` chunk, another HTML spelling, or an SVG is refused). Session open, the round actions, the
game iframe, and operator embedding come in later changes.
