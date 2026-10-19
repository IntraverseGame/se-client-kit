// Every text the Wrapper's own UI shows, per language (W-48). The session's
// language is the Snapshot's `context.language`; a language with no catalogue
// falls back to English, and the UI's `lang` attribute names the language
// actually shown. Texts never carry a value from the network except where the
// UI places one beside them (an amount's `formatted`, a round id, a
// `requestId`), always as text, never as markup.

export type MessageKey =
  | "status.loading"
  | "status.idle"
  | "status.starting"
  | "status.active"
  | "status.resolving"
  | "status.won"
  | "status.lost"
  | "status.canceled"
  | "status.ended"
  | "detail.starting"
  | "detail.resolving"
  | "detail.canceled"
  | "detail.canceledUnverified"
  | "detail.expired"
  | "detail.verifying"
  | "label.balance"
  | "label.bet"
  | "label.betUnavailable"
  | "label.multiplier"
  | "label.game"
  | "label.roundId"
  | "label.requestId"
  | "action.start"
  | "action.newRound"
  | "action.cashOut"
  | "action.copyRoundId"
  | "action.retry"
  | "action.checkAgain"
  | "action.verify"
  | "action.lobby"
  | "action.deposit"
  | "notice.copied"
  | "notice.slow"
  | "notice.chainNotIndependent"
  | "notice.opensInNewTab"
  | "state.configuration"
  | "state.configurationDetail"
  | "state.sessionEnded"
  | "state.sessionEndedDetail"
  | "state.otherTab"
  | "state.otherTabDetail"
  | "state.unsupported"
  | "state.unsupportedDetail"
  | "state.chainUnverified"
  | "state.chainUnverifiedDetail"
  | "state.connection"
  | "state.connectionDetail"
  | "state.offline"
  | "state.verificationFailed"
  | "state.verificationFailedDetail"
  | "state.outOfSync"
  | "state.outOfSyncDetail"
  | "state.checkLater"
  | "state.moveUnconfirmed"
  | "state.cashOutUnconfirmed"
  | "state.unconfirmedDetail"
  | "state.rejected"
  | "state.rejectedDetail"
  | "error.heading"
  | "error.generic"
  | "error.gameIncompatible"
  | "error.INSUFFICIENT_FUNDS"
  | "error.LIMIT_EXCEEDED"
  | "error.PLAYER_RESTRICTED"
  | "error.FUNDING_UNCONFIRMED"
  | "error.ENTROPY_UNAVAILABLE"
  | "error.PREPARATION_TIMEOUT"
  | "error.ROUND_VOIDED"
  | "error.UNAVAILABLE"
  | "icon.win"
  | "icon.loss"
  | "icon.error"
  | "icon.info"
  | "icon.progress";

export type Messages = Readonly<Record<MessageKey, string>>;

const EN: Messages = {
  "status.loading": "Loading the game",
  "status.idle": "Place your bet",
  "status.starting": "Preparing the round",
  "status.active": "Your round is in play",
  "status.resolving": "Resolving",
  "status.won": "You won",
  "status.lost": "You lost",
  "status.canceled": "Round canceled",
  "status.ended": "Round ended",
  "detail.starting": "The round is being prepared and checked.",
  "detail.resolving": "The result is being settled.",
  "detail.canceled": "Round canceled, your bet was returned.",
  "detail.canceledUnverified":
    "This round failed verification and was canceled.",
  "detail.expired": "The time limit ended this round.",
  "detail.verifying": "The round is being checked before you play.",
  "label.balance": "Balance",
  "label.bet": "Bet",
  "label.betUnavailable": "above your balance",
  "label.multiplier": "Multiplier",
  "label.game": "Game",
  "label.roundId": "Round ID",
  "label.requestId": "Reference",
  "action.start": "Start round",
  "action.newRound": "New round",
  "action.cashOut": "Cash out",
  "action.copyRoundId": "Copy round ID",
  "action.retry": "Try again",
  "action.checkAgain": "Check again",
  "action.verify": "Verify this round",
  "action.lobby": "Back to the lobby",
  "action.deposit": "Make a deposit",
  "notice.copied": "Round ID copied",
  "notice.slow": "This is taking longer than expected.",
  "notice.chainNotIndependent": "Chain check not independent (development)",
  "notice.opensInNewTab": "(opens in a new tab)",
  "state.configuration": "The game cannot start",
  "state.configurationDetail":
    "This environment is not configured correctly. Nothing was signed.",
  "state.sessionEnded": "Your session has ended",
  "state.sessionEndedDetail":
    "To play again, relaunch the game from the lobby.",
  "state.otherTab": "This session is open in another tab",
  "state.otherTabDetail": "Continue playing in the other tab.",
  "state.unsupported": "This browser cannot keep your session safe",
  "state.unsupportedDetail":
    "Nothing was signed. Relaunch the game from the lobby in an up-to-date browser.",
  "state.chainUnverified": "Could not verify the chain",
  "state.chainUnverifiedDetail":
    "Nothing more is signed for this round. It ends by its time limit.",
  "state.connection": "Connection problem",
  "state.connectionDetail":
    "Your round is not lost. The game keeps trying to reconnect.",
  "state.offline": "Your device is offline.",
  "state.verificationFailed": "This round failed verification",
  "state.verificationFailedDetail":
    "Nothing more is signed for this round. It ends by its time limit.",
  "state.outOfSync": "This round is out of sync",
  "state.outOfSyncDetail":
    "Nothing more is signed for this round. You can verify it.",
  "state.checkLater": "Still resolving — contact support",
  "state.moveUnconfirmed": "Your move hasn't been confirmed",
  "state.cashOutUnconfirmed": "Your cash-out hasn't been confirmed",
  "state.unconfirmedDetail":
    "If it never arrives, the round ends by its time limit.",
  "state.rejected": "The game state could not be read",
  "state.rejectedDetail": "Something went wrong. Nothing was signed.",
  "error.heading": "Something went wrong",
  "error.generic": "The request could not be completed.",
  "error.gameIncompatible": "This game is not compatible with the player.",
  "error.INSUFFICIENT_FUNDS": "Your balance is too low for this bet.",
  "error.LIMIT_EXCEEDED": "This bet is over your limit.",
  "error.PLAYER_RESTRICTED": "Play is not available for your account.",
  "error.FUNDING_UNCONFIRMED": "The bet could not be confirmed.",
  "error.ENTROPY_UNAVAILABLE": "The round could not be prepared.",
  "error.PREPARATION_TIMEOUT": "The round took too long to prepare.",
  "error.ROUND_VOIDED": "The round was voided. Your bet was not taken.",
  "error.UNAVAILABLE": "The game is unavailable right now.",
  "icon.win": "Win",
  "icon.loss": "Loss",
  "icon.error": "Error",
  "icon.info": "Information",
  "icon.progress": "In progress",
};

/** The language shown when the session's has no catalogue. */
export const FALLBACK_LANGUAGE = "en";

const CATALOGUES: Readonly<Record<string, Messages>> = { en: EN };

export type Localized = {
  /** The language of `messages`, for the UI's `lang` attribute. */
  readonly language: string;
  readonly messages: Messages;
};

/**
 * The catalogue for a session's language (a lowercase ISO 639 code, W-48), by
 * its primary subtag, or the fallback.
 */
export const messagesFor = (language: string | undefined): Localized => {
  const primary = (language ?? "").toLowerCase().split("-")[0] ?? "";
  const messages = Object.hasOwn(CATALOGUES, primary)
    ? CATALOGUES[primary]
    : undefined;
  return messages === undefined
    ? { language: FALLBACK_LANGUAGE, messages: EN }
    : { language: primary, messages };
};

/** The message of a typed error's `code`, or the generic one (W-41, W-42). */
export const problemMessage = (messages: Messages, code: string): string => {
  const key = `error.${code}`;
  return Object.hasOwn(messages, key)
    ? messages[key as MessageKey]
    : messages["error.generic"];
};
