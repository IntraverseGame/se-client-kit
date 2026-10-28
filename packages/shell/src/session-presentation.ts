// One presentation per session (book-playback.md W-53, the kit's own rule):
// the session's `presentation`, `model`, `config.kind`, and `config.model` are
// those of its first validated Snapshot. A later Snapshot in which any of the
// four differs is a changed session, final for the session until the page is
// reloaded: that Snapshot is not read into the session, and from then on the
// session reads, signs, starts, and forwards nothing. The guard keeps the
// first values and the differing ones (those four fields, and nothing else of
// the Snapshot) with the session's evidence (W-27). Every validated Snapshot
// the session takes passes here first, before the round's own rules (W-52 for
// a book round, W-26 for a config round), so a Snapshot that changes both the
// round and the session is a changed session.

import type { ValidSnapshot } from "@intraverse/se-client-snapshot";

/** The four fields that fix a session's presentation (W-53). */
export type PresentationValues = {
  readonly presentation: ValidSnapshot["presentation"];
  readonly model: ValidSnapshot["model"];
  readonly configKind: ValidSnapshot["config"]["kind"];
  /** A book round's mode; a `steps` config has none. */
  readonly configModel: string | undefined;
};

/** What the session keeps of a changed session (W-53, W-27). */
export type SessionChange = {
  /** The values of the session's first validated Snapshot. */
  readonly first: PresentationValues;
  /** The values of the Snapshot that changed them. */
  readonly changed: PresentationValues;
};

export type PresentationGuard = {
  /**
   * Whether the session may read `snapshot` in: `true` for its first validated
   * Snapshot (whose values it fixes) and for one with the same four values;
   * `false` for one that differs (recorded once, as the change) and for every
   * Snapshot after a change.
   */
  readonly admit: (snapshot: ValidSnapshot) => boolean;
  /** The change, once a Snapshot made one: final for the session. */
  readonly change: () => SessionChange | undefined;
};

const valuesOf = (snapshot: ValidSnapshot): PresentationValues =>
  Object.freeze({
    presentation: snapshot.presentation,
    model: snapshot.model,
    configKind: snapshot.config.kind,
    configModel:
      snapshot.config.kind === "book" ? snapshot.config.model : undefined,
  });

const sameValues = (a: PresentationValues, b: PresentationValues): boolean =>
  a.presentation === b.presentation &&
  a.model === b.model &&
  a.configKind === b.configKind &&
  a.configModel === b.configModel;

export const createPresentationGuard = (): PresentationGuard => {
  let first: PresentationValues | undefined;
  let change: SessionChange | undefined;

  const admit = (snapshot: ValidSnapshot): boolean => {
    if (change !== undefined) return false;
    const values = valuesOf(snapshot);
    if (first === undefined) {
      first = values;
      return true;
    }
    if (sameValues(first, values)) return true;
    change = Object.freeze({ first, changed: values });
    return false;
  };

  return Object.freeze({
    admit,
    change: (): SessionChange | undefined => change,
  });
};
