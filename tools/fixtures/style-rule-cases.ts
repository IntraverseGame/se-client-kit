// Fixture cases for the code-style rules of AGENTS.md: `type` over `interface`,
// and arrow functions over `function`. Written from AGENTS.md, not derived from
// .oxlintrc.json. The comments name what enforces each exception.

import type { Case } from "./import-direction-cases.ts";

const INTERFACE = "typescript(consistent-type-definitions)";
const FUNCTION_STYLE = "eslint(func-style)";
const CALLBACK = "eslint(prefer-arrow-callback)";

const style = (
  name: string,
  source: string,
  rule: string,
  fails: boolean,
): Case => ({
  name,
  file: "packages/shell/src/index.ts",
  source,
  rule,
  fails,
});

export const styleCases: readonly Case[] = [
  // `interface` is only for a class to implement or for declaration merging.
  style(
    "an interface fails",
    "export interface A {\n  a: number;\n}\n",
    INTERFACE,
    true,
  ),
  style(
    "a type alias passes",
    "export type A = {\n  a: number;\n};\n",
    INTERFACE,
    false,
  ),
  style(
    "an interface that extends another fails",
    "type A = { a: number };\nexport interface B extends A {\n  b: number;\n}\n",
    INTERFACE,
    true,
  ),
  style(
    "an extension written as an intersection passes",
    "type A = { a: number };\nexport type B = A & { b: number };\n",
    INTERFACE,
    false,
  ),
  style(
    "an interface a class implements, with a disable comment and a reason, passes",
    [
      "// eslint-disable-next-line typescript/consistent-type-definitions -- a class implements it",
      "export interface Clock {\n  now: () => number;\n}",
      "export class SystemClock implements Clock {\n  now = (): number => 0;\n}",
      "",
    ].join("\n"),
    INTERFACE,
    false,
  ),
  style(
    "an interface that a class implements still fails without the comment",
    "export interface Clock {\n  now: () => number;\n}\nexport class SystemClock implements Clock {\n  now = (): number => 0;\n}\n",
    INTERFACE,
    true,
  ),
  style(
    "global augmentation fails without a disable comment",
    "declare global {\n  interface Window {\n    se: number;\n  }\n}\nexport {};\n",
    INTERFACE,
    true,
  ),
  style(
    "global augmentation with a disable comment and a reason passes",
    "declare global {\n  // eslint-disable-next-line typescript/consistent-type-definitions -- declaration merging\n  interface Window {\n    se: number;\n  }\n}\nexport {};\n",
    INTERFACE,
    false,
  ),

  // Arrow functions, everywhere, exported ones included.
  style(
    "a function declaration fails",
    "function f(a: number): number {\n  return a;\n}\nexport const g = f(1);\n",
    FUNCTION_STYLE,
    true,
  ),
  style(
    "an exported function declaration fails",
    "export function f(a: number): number {\n  return a;\n}\n",
    FUNCTION_STYLE,
    true,
  ),
  style(
    "an async function declaration fails",
    "export async function f(): Promise<void> {}\n",
    FUNCTION_STYLE,
    true,
  ),
  style(
    "an exported arrow with explicit types passes",
    "export const f = (a: number): number => a;\n",
    FUNCTION_STYLE,
    false,
  ),
  style(
    "a function expression callback fails",
    "export const doubled = [1].map(function (n) {\n  return n * 2;\n});\n",
    CALLBACK,
    true,
  ),
  style(
    "an arrow callback passes",
    "export const doubled: number[] = [1].map(n => n * 2);\n",
    CALLBACK,
    false,
  ),
  // A generator cannot be an arrow: it is written as a function expression,
  // which neither rule flags (a `function*` declaration would be).
  style(
    "a generator function expression passes",
    "export const count = function* (): Generator<number> {\n  yield 1;\n};\n",
    FUNCTION_STYLE,
    false,
  ),
  style(
    "a generator declaration fails",
    "export function* count(): Generator<number> {\n  yield 1;\n}\n",
    FUNCTION_STYLE,
    true,
  ),
  // `this` and `arguments`: a function expression is not flagged.
  style(
    "a function expression that uses this passes",
    "export const read = function (this: { a: number }): number {\n  return this.a;\n};\n",
    FUNCTION_STYLE,
    false,
  ),
  // Overloads: only declarations can be overloaded, and the rule does not flag
  // an overload set.
  style(
    "an overload set passes",
    "export function pick(a: string): string;\nexport function pick(a: number): number;\nexport function pick(a: string | number): string | number {\n  return a;\n}\n",
    FUNCTION_STYLE,
    false,
  ),
  // Methods and constructors are not functions in this sense.
  style(
    "class and object-literal methods pass",
    "export class C {\n  m(): number {\n    return 1;\n  }\n}\nexport const o = {\n  m(): number {\n    return 1;\n  },\n};\n",
    FUNCTION_STYLE,
    false,
  ),
];
