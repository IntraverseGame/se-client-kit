---
"@intraverse/se-client-wrapper": minor
---

The verify page in the release artifact accepts a round signed under an earlier
registry domain and signer (V-3b), when its site's configuration lists that pair
in the new optional `earlierPins`. A round's domain and signer must together
equal the current pair or exactly one listed pair; a mix of two pairs fails check
3, and a pair not listed fails it as before. A round under an earlier pair gets
the same verdict, and check 3 says so and names the pair. The list comes only
from the configuration, never from the round's answer. The Pages configuration
tool writes it to the verifier's document only. The Wrapper's own behavior does
not change: it binds and checks only under the current pins, and refuses a
document with the field as an unknown field.
