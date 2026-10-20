// The parser of what the game sends under `se.controller/1` (W-38). The game is
// untrusted: a message is read only through the own data properties of a
// plain object (never a getter, so no game code runs), every field is checked,
// and a message with a field outside its set is ignored.

import {
  type ActionMessage,
  CONTROLLER_SCHEMA,
  type HelloMessage,
  type Pick,
  type Presentation,
  PRESENTATIONS,
  ROUND_STATUSES,
  type RoundStatus,
  STATUSES,
} from "./controller-protocol.ts";
import { type Fields, hasExactly, plainFields } from "./plain-fields.ts";

/** What the parser makes of a message from the game. */
export type ParsedGameMessage =
  | { readonly kind: "hello"; readonly message: HelloMessage }
  | { readonly kind: "action"; readonly message: ActionMessage }
  /** A well-formed `action` whose `verb` or `args` are bad: `reject: invalid`. */
  | { readonly kind: "invalid-action"; readonly id: string }
  /** Anything else: ignored. */
  | { readonly kind: "ignored" };

const IGNORED: ParsedGameMessage = Object.freeze({ kind: "ignored" });

const ACTION_ID = /^[A-Za-z0-9_-]{1,64}$/u;

/** A non-empty array with no repeats, every item from `allowed`. */
const readList = <T extends string>(
  value: unknown,
  allowed: ReadonlySet<string>,
): readonly T[] | undefined => {
  try {
    if (!Array.isArray(value) || value.length === 0) return undefined;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    // Exactly the indexes and `length`: no extra or symbol-keyed member.
    if (Reflect.ownKeys(descriptors).length !== value.length + 1) {
      return undefined;
    }
    const items: string[] = [];
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = descriptors[index];
      if (descriptor === undefined || !("value" in descriptor)) {
        return undefined;
      }
      const item: unknown = descriptor.value;
      if (typeof item !== "string" || !allowed.has(item)) return undefined;
      if (items.includes(item)) return undefined;
      items.push(item);
    }
    return Object.freeze(items as T[]);
  } catch {
    return undefined;
  }
};

const isIndex = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

const readPick = (value: unknown): Pick | undefined => {
  const fields = plainFields(value);
  if (fields === undefined || !hasExactly(fields, ["step", "option"])) {
    return undefined;
  }
  const step = fields.get("step");
  const option = fields.get("option");
  if (!isIndex(step) || !isIndex(option)) return undefined;
  return Object.freeze({ step, option });
};

const parseHello = (fields: Fields): ParsedGameMessage => {
  if (!hasExactly(fields, ["schema", "type", "presentations", "statuses"])) {
    return IGNORED;
  }
  const presentations = readList<Presentation>(
    fields.get("presentations"),
    PRESENTATIONS,
  );
  const statuses = readList<RoundStatus>(fields.get("statuses"), STATUSES);
  if (presentations === undefined || statuses === undefined) return IGNORED;
  const message: HelloMessage = Object.freeze({
    schema: CONTROLLER_SCHEMA,
    type: "hello",
    presentations,
    statuses,
  });
  return Object.freeze({ kind: "hello", message });
};

const parseAction = (fields: Fields): ParsedGameMessage => {
  if (!hasExactly(fields, ["schema", "type", "id", "verb", "args"])) {
    return IGNORED;
  }
  const id = fields.get("id");
  if (typeof id !== "string" || !ACTION_ID.test(id)) return IGNORED;
  const args = readPick(fields.get("args"));
  if (fields.get("verb") !== "pick" || args === undefined) {
    return Object.freeze({ kind: "invalid-action", id });
  }
  const message: ActionMessage = Object.freeze({
    schema: CONTROLLER_SCHEMA,
    type: "action",
    id,
    verb: "pick",
    args,
  });
  return Object.freeze({ kind: "action", message });
};

/**
 * Parses a message from the game against `se.controller/1`. A `hello` or an
 * `action` with exactly its fields, each well formed, is returned typed; a
 * well-formed `action` envelope (its fields, the schema, and a valid `id`) with
 * a bad `verb` or `args` is `invalid-action`; anything else is ignored.
 */
export const parseGameMessage = (data: unknown): ParsedGameMessage => {
  const fields = plainFields(data);
  if (fields === undefined || fields.get("schema") !== CONTROLLER_SCHEMA) {
    return IGNORED;
  }
  switch (fields.get("type")) {
    case "hello": {
      return parseHello(fields);
    }
    case "action": {
      return parseAction(fields);
    }
    default: {
      return IGNORED;
    }
  }
};

/**
 * Whether a `hello` declares what the Wrapper sends: `steps` and all seven
 * statuses.
 */
export const isCompatible = (hello: HelloMessage): boolean =>
  hello.presentations.includes("steps") &&
  ROUND_STATUSES.every(status => hello.statuses.includes(status));
