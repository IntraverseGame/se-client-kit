// The bridge's mount check (W-37, ADR-007): D and the Wrapper's origin are
// serialized origins, D is not the Wrapper's own, not on its registrable
// domain by the comparison key, and on the configuration's allow-list.

import type { Environment } from "./chain-config.ts";
import { isSerializedOrigin, mayShareSite } from "./serialized-origin.ts";

/** Why the bridge refused to mount the game (W-37). */
export type ControllerMountRefusal =
  /** D or the Wrapper's origin is not a serialized origin. */
  | "invalid-origin"
  /** D is not on the configuration's allow-list. */
  | "origin-not-allowed"
  /** D is the Wrapper's own origin. */
  | "same-origin"
  /**
   * D's host shares its comparison key (its last two labels) with the
   * Wrapper's: they may be on one registrable domain (W-37, ADR-007).
   */
  | "same-site";

/** What the mount check reads of the bridge's options. */
type MountFields = {
  readonly gameOrigin: string;
  readonly gameOrigins: readonly string[];
  readonly ownOrigin: string;
  readonly environment: Environment;
};

export const checkMount = (
  options: MountFields,
): ControllerMountRefusal | undefined => {
  const { gameOrigin, ownOrigin, gameOrigins, environment } = options;
  if (!isSerializedOrigin(gameOrigin) || !isSerializedOrigin(ownOrigin)) {
    return "invalid-origin";
  }
  if (gameOrigin === ownOrigin) return "same-origin";
  // W-37's "different registrable domain", by the comparison key (ADR-007).
  if (mayShareSite(gameOrigin, ownOrigin, environment)) return "same-site";
  if (!gameOrigins.includes(gameOrigin)) return "origin-not-allowed";
  return undefined;
};
