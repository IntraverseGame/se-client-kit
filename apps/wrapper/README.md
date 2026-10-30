# `@intraverse/se-client-wrapper`

The SuperEngine Wrapper: the page that runs a game in the player's browser. It
shows the round, asks the player to choose, and hosts the game in a sandboxed
iframe.

**Status:** pre-release. It is an application, not an npm package; a release
bundle is built from it and served from the SuperEngine origin. The name is the
intended one.

What works today: the Wrapper reads its environment configuration document at
start and refuses to start on an invalid one (for example `production` with
fewer than two independent RPC endpoints), and it renders the round from
validated Snapshots: every status, the typed errors, the degraded and
connection-problem states, the round id with its verify link after a round ends,
and polling while a round is prepared or resolved. It opens a session from the
launch code in the URL fragment (removed from the URL before any request),
starts a round, shows it ready only once the shell's checks passed, and offers a
cash-out when the shell does. When the shell cancels a round that failed
verification, the Wrapper keeps reading the round until the cancel settles,
shows "still resolving — contact support" with a "check again" control when it
does not, and a neutral "round ended" when the round ended with no result. A
round that ended shows its result with the next bet beside it. The game iframe
is mounted only once the game's origin comes from the session, which the Play
API does not serve yet. Embedded by an operator page, it opens a session only
when it is embedded directly by a listed operator origin and the operator page
has completed the `se.operator/1` handshake; until then it redeems nothing and
signs nothing, and with no handshake within 10 s it shows that the game cannot
start. It then tells the operator page the height its content needs, and offers
the operator's lobby and deposit as the player's own links, only between rounds.

## What it guarantees

- The player's action key never leaves the Wrapper's shell
  (`@intraverse/se-client-shell`). The page and the game never receive a secret.
- The game runs in a sandboxed iframe and talks to the Wrapper only through the
  controller protocol `se.controller/1`.
- The page that embeds the Wrapper can only unlock it, through the operator
  protocol `se.operator/1`: it receives `welcome` and the least height the
  Wrapper needs (a minimum for the iframe's box), never a secret, an id, or an
  amount.
- The game shows in one place for the whole session and takes input only in a
  round the shell has checked and found ready; it is never sent a round in play
  before that.
- The Wrapper renders only a Snapshot that has been validated.
- The Wrapper writes nothing to `localStorage`, cookies, or any persistent
  storage unless its specification says so; the key is never persisted.
- Amounts are shown from strings or `bigint`, never `number`.

Specified, partly implemented: rendering only validated Snapshots, showing
amounts from `formatted` strings, and keeping the key and the token in the shell
hold today; the game iframe and the controller protocol are wired and wait for
the game's origin to be served.

## Accessibility

The Wrapper's own interface targets WCAG 2.2 level AA: status changes are
announced politely and errors as alerts, an update never moves focus unless the
player acted, win, loss, and error have text and an icon beside colour, motion
stops when the system asks for reduced motion, and the layout reflows at 200 %
zoom.

## Release bundle

The release bundle has no inline script or style. Its page loads its script and
stylesheet with Subresource Integrity and carries a Content Security Policy in a
`<meta>` element. It also carries the verify page under `verify/`, built on its
own and held to the same rules, with its own policy. Beside the pages,
`headers.json` holds the recommended response headers by path: `/*` for the
Wrapper (a strict `Content-Security-Policy`, `Referrer-Policy: no-referrer`, and
a `Permissions-Policy`) and `/verify/*` for the verify page, with placeholders
for the origins each environment configures (a host must apply only the more
specific rule on `/verify/*`; one that merges matching rules would send both
policies); `integrity-manifest.json` holds the SHA-256 of every other file. The
build reads its output back and fails unless it holds only regular files (no
symbolic link), exactly those the manifest lists, each with its hash, and only
the allowed types: scripts and stylesheets a page loads with their integrity,
the two JSON files above, and the two pages, `index.html` and
`verify/index.html`. Any other type, such as another HTML file or an SVG, fails
the build.

## Test data never ships

The test vectors of the kit are not part of the Wrapper bundle or of the verify
page in it. Both builds refuse a bundle in which they could appear, and it also
inspects the final files: a vector's content found in any emitted file, however
it got there (including a file copied verbatim from a `public/` directory),
fails the build. That inspection finds content that is present in one of its
recognisable forms (the file itself, its JSON, escaped or base64 text, also with
the trailing newline trimmed or with CRLF line breaks). It does not find data
transformed so that none of those forms remains (a re-encoded or compressed
copy, a line-wrapped base64, hex, or UTF-16 copy); a re-indented JSON copy is
found only through the minified form, and only when the vector parses as JSON.
Vectors below a small minimum size are outside it.

## For game developers and integrators

A game receives its state from the Wrapper and sends its choices back through
the controller protocol. It shows from the session's start, at `idle` too, and
takes input only while a round is playable, so it must play a reveal with no
input and render every state it is sent. See the Wrapper specification for the
protocol, and its operator guidance for how an operator page embeds the Wrapper:
the Wrapper fills the box it is given, and `resize` is a minimum height.

## More

- [The Wrapper specification](https://github.com/IntraverseGame/se-client-kit/blob/main/specs/wrapper.md)
- [The game iframe and the controller boundary](https://github.com/IntraverseGame/se-client-kit/blob/main/specs/wrapper/the-game-iframe-and-the-controller-boundary.md)
- [Operator embedding](https://github.com/IntraverseGame/se-client-kit/blob/main/specs/wrapper/operator-embedding.md),
  with the operator guidance
- [The action key and what may be stored](https://github.com/IntraverseGame/se-client-kit/blob/main/specs/wrapper/the-action-key-and-what-may-be-stored.md)

Contributing: see
[CONTRIBUTING.md](https://github.com/IntraverseGame/se-client-kit/blob/main/CONTRIBUTING.md).
