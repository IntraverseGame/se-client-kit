// The round id with its copy control and the verify link (W-39), shown beside a
// round that ended (W-40) and in the alert of a round's own failed state.

import {
  button,
  type Builder,
  type Child,
  externalLink,
  roundIdField,
} from "./dom.ts";
import type { Messages } from "./messages.ts";
import { verifyUrlFor } from "./verify-link.ts";
import type { ViewOptions } from "./view-options.ts";

export const roundIdAndVerify = (
  el: Builder,
  m: Messages,
  roundId: string,
  options: ViewOptions,
  announce: (text: string) => void,
): Child[] => {
  const copy = options.intents.copyText;
  return [
    roundIdField(el, m["label.roundId"], roundId),
    el("div", { class: "se-actions" }, [
      copy !== undefined &&
        button(el, m["action.copyRoundId"], "copy-round-id", () => {
          copy(roundId).then(
            () => {
              announce(m["notice.copied"]);
              return null;
            },
            () => {
              // The clipboard refused: the round id stays visible to copy by hand.
              return null;
            },
          );
        }),
      options.verifyBaseUrl !== undefined &&
        externalLink(
          el,
          m,
          verifyUrlFor(options.verifyBaseUrl, roundId),
          "action.verify",
          "verify",
        ),
    ]),
  ];
};
