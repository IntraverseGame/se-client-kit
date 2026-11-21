// The wallet delegation's part of the Pages sites' configuration
// (specs/signing-page.md, SP-15; specs/client-kit.md, The Pages sites'
// configuration): one set of inputs for the Wrapper's `signingPageOrigin` and
// `acceptPendingNotices` and for the signing page's whole document, so the two
// cannot disagree. Used by pages-config.ts; pure.
//
// - `PAGES_SIGNER_ORIGIN` is optional. Without it nothing of the delegation is
//   written: no field in the Wrapper's document and no signing page document,
//   so the deploy uploads no signing page site and the environment offers no
//   delegation (W-62). With it, it must be an `https` origin the deploy's
//   headers step accepts (`not-https-origin`) and none of the other sites'
//   origins (`overlapping-origins`).
// - `PAGES_ACCEPT_PENDING_NOTICES` is unset or exactly `true`; anything else
//   fails the job. Only `true` writes `acceptPendingNotices: true` (absent reads
//   as `false`), into both documents. Production mode refuses `true`, with or
//   without a signing page (`pending-notices-in-production`), so a `pending`
//   notice is never offered in production.
//
// The signing page's document is `environment` (the chain pins'),
// `wrapperOrigins` (the Wrapper's site alone; the verifier never opens the
// signing page), and the optional flag, in that order. This module does not
// validate it: no app imports the signing page (specs/client-kit/packages.md),
// so the configuration job runs the page's own validator on the written file
// (apps/signing-page/config-check-cli.ts). An issue names an input and a code,
// never a value.

import {
  HEADERS_ORIGIN_PATTERN,
  NOT_HEADERS_ORIGIN,
} from "./pages-config-rules.ts";

/** The wallet delegation's inputs, by the names of the environment's secrets. */
export type SignerInputs = {
  /** Secret, optional: the signing page site's origin. */
  readonly PAGES_SIGNER_ORIGIN?: string | undefined;
  /** Secret, optional: `true`, or unset. */
  readonly PAGES_ACCEPT_PENDING_NOTICES?: string | undefined;
};

/** The two fields the Wrapper's document gets, or none. */
export type SignerFields = Readonly<Record<string, unknown>>;

export type SignerPlan = {
  /** The fields for the Wrapper's document (empty without a signing page). */
  readonly wrapperFields: SignerFields;
  /** The signing page's document, or `undefined` without a signing page. */
  readonly signerDocument: string | undefined;
};

export type SignerContext = {
  readonly wrapperOrigin: string;
  readonly verifierOrigin: string;
  /** `PAGES_CHAIN_PINS`' `environment`, as given. */
  readonly environment: unknown;
  readonly production: boolean;
};

const HEADERS_ORIGIN = new RegExp(HEADERS_ORIGIN_PATTERN, "u");

/** Whether the flag is on, or `undefined` when it is neither unset nor `true`. */
const readFlag = (value: string | undefined): boolean | undefined => {
  if (value === undefined || value === "") return false;
  return value === "true" ? true : undefined;
};

/** The issues of the two inputs alone, before any document is built. */
export const signerInputIssues = (
  inputs: SignerInputs,
  context: Pick<
    SignerContext,
    "wrapperOrigin" | "verifierOrigin" | "production"
  >,
): readonly string[] => {
  const issues: string[] = [];
  const origin = inputs.PAGES_SIGNER_ORIGIN;
  if (origin !== undefined && origin !== "") {
    if (!HEADERS_ORIGIN.test(origin)) {
      issues.push(`PAGES_SIGNER_ORIGIN: ${NOT_HEADERS_ORIGIN}`);
    } else if (
      origin === context.wrapperOrigin ||
      origin === context.verifierOrigin
    ) {
      issues.push("PAGES_SIGNER_ORIGIN: overlapping-origins");
    }
  }
  const flag = readFlag(inputs.PAGES_ACCEPT_PENDING_NOTICES);
  if (flag === undefined) {
    issues.push("PAGES_ACCEPT_PENDING_NOTICES: neither unset nor true");
  } else if (flag && context.production) {
    issues.push("PAGES_ACCEPT_PENDING_NOTICES: pending-notices-in-production");
  }
  return issues;
};

/**
 * What the delegation adds to the sites' documents, once `signerInputIssues`
 * found nothing: the Wrapper's two fields and the signing page's document, or
 * nothing at all without `PAGES_SIGNER_ORIGIN`.
 */
export const signerPlan = (
  inputs: SignerInputs,
  context: SignerContext,
): SignerPlan => {
  const origin = inputs.PAGES_SIGNER_ORIGIN;
  if (origin === undefined || origin === "") {
    return { wrapperFields: {}, signerDocument: undefined };
  }
  const accept: SignerFields =
    readFlag(inputs.PAGES_ACCEPT_PENDING_NOTICES) === true
      ? { acceptPendingNotices: true }
      : {};
  const document = {
    environment: context.environment,
    wrapperOrigins: [context.wrapperOrigin],
    ...accept,
  };
  return {
    wrapperFields: { signingPageOrigin: origin, ...accept },
    signerDocument: `${JSON.stringify(document, undefined, 2)}\n`,
  };
};
