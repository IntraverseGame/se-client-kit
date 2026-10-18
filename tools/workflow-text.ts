// A deliberately small reader for the workflow files under .github/workflows,
// used by their tests (tools/release-workflow.test.ts,
// tools/release-version-guard.test.ts). The repository has no YAML parser (a
// new dependency needs an ADR), and the workflows keep to block style: two
// spaces per level, `- ` list items, plain, `|`, and `>-` scalars. A list
// item's first key is read as if it stood on its own line, two columns in.
// Anything the tests look for and this reader cannot find fails the test.

/** One line: its indentation and its text after the indentation. */
export type Line = {
  readonly indent: number;
  readonly text: string;
  /** The line opened a list item (`- `). */
  readonly item: boolean;
  /** The line as written. */
  readonly raw: string;
};

export const readLines = (source: string): Line[] =>
  source.split("\n").map(raw => {
    const text = raw.trimStart();
    const indent = raw.length - text.length;
    return text.startsWith("- ")
      ? { indent: indent + 2, text: text.slice(2), item: true, raw }
      : { indent, text, item: false, raw };
  });

const isBlank = (line: Line): boolean => line.text === "";
const isComment = (line: Line): boolean => line.text.startsWith("#");

/**
 * The end (exclusive) of what belongs to the line at `index`: the lines below
 * it up to the next non-blank line at its indentation or less. A list item ends
 * at the next item of its list instead, unless `asKey` asks for the value of
 * the item's first key.
 */
export const blockEnd = (
  lines: readonly Line[],
  index: number,
  { asKey = false }: { readonly asKey?: boolean } = {},
): number => {
  const own = lines[index];
  if (own === undefined) throw new RangeError(`no line ${String(index)}`);
  const item = own.item && !asKey;
  let end = index + 1;
  for (; end < lines.length; end += 1) {
    const line = lines[end];
    if (line === undefined || isBlank(line)) continue;
    if (line.indent < own.indent) break;
    if (line.indent === own.indent && (!item || line.item)) break;
  }
  while (end > index + 1 && isBlank(lines[end - 1] ?? own)) end -= 1;
  return end;
};

/** The lines inside `[from, to)` that are keys `key` at exactly `indent`. */
export const keyLines = (
  lines: readonly Line[],
  from: number,
  to: number,
  indent: number,
  key: string,
): number[] => {
  const found: number[] = [];
  for (let index = from; index < to; index += 1) {
    const line = lines[index];
    if (
      line !== undefined &&
      line.indent === indent &&
      (line.text === `${key}:` || line.text.startsWith(`${key}: `))
    ) {
      found.push(index);
    }
  }
  return found;
};

/** The one key `key` at `indent` inside `[from, to)`; none or two fail. */
export const keyLine = (
  lines: readonly Line[],
  from: number,
  to: number,
  indent: number,
  key: string,
): number => {
  const found = keyLines(lines, from, to, indent, key);
  if (found.length !== 1 || found[0] === undefined) {
    throw new Error(
      `expected one ${key}: at indentation ${String(indent)}, found ${String(found.length)}`,
    );
  }
  return found[0];
};

/** A trailing ` # comment` of a plain value, outside quotes. */
const stripComment = (value: string): string => {
  const hash = value.search(/\s#/u);
  return hash === -1 || /["']/u.test(value.slice(0, hash))
    ? value
    : value.slice(0, hash).trimEnd();
};

/**
 * The scalar value of the key at `index`, whole: a `|` block with its line
 * breaks (indentation removed), a `>-` block or a plain multi-line value folded
 * into one line with single spaces.
 */
export const scalarAt = (lines: readonly Line[], index: number): string => {
  const line = lines[index];
  if (line === undefined) throw new RangeError(`no line ${String(index)}`);
  const rest = line.text.slice(line.text.indexOf(":") + 1).trim();
  const body = lines.slice(index + 1, blockEnd(lines, index, { asKey: true }));
  if (rest === "|" || rest === "|-") {
    const indent = Math.min(
      ...body
        .filter(entry => !isBlank(entry))
        .map(entry => entry.raw.length - entry.raw.trimStart().length),
    );
    return body.map(entry => entry.raw.slice(indent)).join("\n");
  }
  const folded = body.filter(entry => !isBlank(entry)).map(entry => entry.text);
  const head = rest === ">-" || rest === ">" ? [] : [stripComment(rest)];
  return [...head, ...folded].filter(part => part !== "").join(" ");
};

/** The entries of a block mapping under the key at `index`, comments dropped. */
export const mappingAt = (lines: readonly Line[], index: number): string[] =>
  lines
    .slice(index + 1, blockEnd(lines, index, { asKey: true }))
    .filter(entry => !isBlank(entry) && !isComment(entry))
    .map(entry => stripComment(entry.text));

/** The names of the jobs (the keys under the top-level `jobs:`). */
export const jobNames = (lines: readonly Line[]): string[] => {
  const jobs = keyLine(lines, 0, lines.length, 0, "jobs");
  return lines
    .slice(jobs + 1, blockEnd(lines, jobs))
    .filter(line => line.indent === 2 && /^[A-Za-z0-9_-]+:$/u.test(line.text))
    .map(line => line.text.slice(0, -1));
};

/** The line range `[start, end)` of job `name`. */
export const jobRange = (
  lines: readonly Line[],
  name: string,
): [number, number] => {
  const jobs = keyLine(lines, 0, lines.length, 0, "jobs");
  const start = keyLine(lines, jobs, blockEnd(lines, jobs), 2, name);
  return [start, blockEnd(lines, start)];
};

/** The line ranges of the steps of the job in `[start, end)`. */
export const stepRanges = (
  lines: readonly Line[],
  [start, end]: readonly [number, number],
): [number, number][] => {
  const steps = keyLine(lines, start, end, 4, "steps");
  const ranges: [number, number][] = [];
  for (let index = steps + 1; index < blockEnd(lines, steps); index += 1) {
    const line = lines[index];
    if (line?.item === true && line.indent === 8) {
      ranges.push([index, blockEnd(lines, index)]);
    }
  }
  return ranges;
};

/** The step of the job in `range` whose `name:` is `name`. */
export const stepNamed = (
  lines: readonly Line[],
  range: readonly [number, number],
  name: string,
): [number, number] => {
  const found = stepRanges(lines, range).filter(([from, to]) =>
    keyLines(lines, from, to, 8, "name").some(
      index => scalarAt(lines, index) === name,
    ),
  );
  if (found.length !== 1 || found[0] === undefined) {
    throw new Error(`expected one step named ${name}`);
  }
  return found[0];
};
