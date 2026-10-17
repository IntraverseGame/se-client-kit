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
and polling while a round is prepared or resolved. Opening a session from a
launch code, the start, move, and cash-out actions, the game iframe, and
operator embedding are not built yet.

## What it guarantees

- The player's action key never leaves the Wrapper's shell
  (`@intraverse/se-client-shell`). The page and the game never receive a secret.
- The game runs in a sandboxed iframe and talks to the Wrapper only through the
  controller protocol `se.controller/1`.
- The Wrapper renders only a Snapshot that has been validated.
- The Wrapper writes nothing to `localStorage`, cookies, or any persistent
  storage unless its specification says so; the key is never persisted.
- Amounts are shown from strings or `bigint`, never `number`.

Specified, partly implemented: rendering only validated Snapshots and showing
amounts from `formatted` strings hold today; the key, the game iframe, and the
controller protocol arrive with the session and the game.

## Accessibility

The Wrapper's own interface targets WCAG 2.2 level AA: status changes are
announced politely and errors as alerts, an update never moves focus unless the
player acted, win, loss, and error have text and an icon beside colour, motion
stops when the system asks for reduced motion, and the layout reflows at 200 %
zoom.

## Release bundle

The release bundle has no inline script or style. Its page loads its script and
stylesheet with Subresource Integrity and carries a Content Security Policy in a
`<meta>` element. Beside the page, `headers.json` holds the recommended response
headers (a strict `Content-Security-Policy`, `Referrer-Policy: no-referrer`, and
a `Permissions-Policy`), with placeholders for the origins each environment
configures, and `integrity-manifest.json` holds the SHA-256 of every other file.
The build reads its output back and fails unless it holds only regular files (no
symbolic link), exactly those the manifest lists, each with its hash, and only
the allowed types: scripts and stylesheets the page loads with their integrity,
the two JSON files above, and the one page, `index.html`. Any other type, such
as another HTML file or an SVG, fails the build.

## Test data never ships

The test vectors of the kit are not part of the Wrapper bundle. The release
build refuses a bundle in which they could appear, and it also inspects the
final files: a vector's content found in any emitted file, however it got there
(including a file copied verbatim from a `public/` directory), fails the build.
That inspection finds content that is present in one of its recognisable forms
(the file itself, its JSON, escaped or base64 text, also with the trailing
newline trimmed or with CRLF line breaks). It does not find data transformed so
that none of those forms remains (a re-encoded or compressed copy, a
line-wrapped base64, hex, or UTF-16 copy); a re-indented JSON copy is found only
through the minified form, and only when the vector parses as JSON. Vectors
below a small minimum size are outside it.

## For game developers and integrators

A game receives its state from the Wrapper and sends its choices back through
the controller protocol. See the Wrapper specification for the protocol and for
how an operator embeds the Wrapper.

## More

- [The Wrapper specification](https://github.com/IntraverseGame/se-client-kit/blob/main/specs/wrapper.md)
- [The game iframe and the controller boundary](https://github.com/IntraverseGame/se-client-kit/blob/main/specs/wrapper/the-game-iframe-and-the-controller-boundary.md)
- [The action key and what may be stored](https://github.com/IntraverseGame/se-client-kit/blob/main/specs/wrapper/the-action-key-and-what-may-be-stored.md)

Contributing: see
[CONTRIBUTING.md](https://github.com/IntraverseGame/se-client-kit/blob/main/CONTRIBUTING.md).
