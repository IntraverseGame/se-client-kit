// A deliberately small reader for the sections of pnpm-workspace.yaml that
// carry dependency information: `overrides`, `catalog`, and `catalogs`. The
// repository has no YAML parser (a new dependency needs an ADR), and these
// sections are plain block mappings of scalars. Anything else in those sections
// (flow style, anchors, lists, multi-line scalars) is reported, never skipped,
// so the check fails closed.

export type YamlValue = string | { [key: string]: YamlValue };

export interface WorkspaceSections {
  readonly sections: Record<string, YamlValue>;
  readonly problems: string[];
}

const SECTIONS: ReadonlySet<string> = new Set([
  "overrides",
  "catalog",
  "catalogs",
]);

function unquote(token: string): string {
  const trimmed = token.trim();
  const first = trimmed.at(0);
  if (
    (first === '"' || first === "'") &&
    trimmed.endsWith(first) &&
    trimmed.length >= 2
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

/** Split `key: value` at the first colon that is outside quotes. */
function splitEntry(text: string): { key: string; value: string } | undefined {
  let quote = "";
  for (let index = 0; index < text.length; index += 1) {
    const char = text.charAt(index);
    if (quote !== "") {
      if (char === quote) quote = "";
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (
      char === ":" &&
      (index === text.length - 1 || text.charAt(index + 1) === " ")
    ) {
      return {
        key: unquote(text.slice(0, index)),
        value: text.slice(index + 1),
      };
    }
  }
  return undefined;
}

function stripComment(line: string): string {
  let quote = "";
  for (let index = 0; index < line.length; index += 1) {
    const char = line.charAt(index);
    if (quote !== "") {
      if (char === quote) quote = "";
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (
      char === "#" &&
      (index === 0 || line.charAt(index - 1) === " ")
    ) {
      return line.slice(0, index);
    }
  }
  return line;
}

interface Line {
  readonly number: number;
  readonly indent: number;
  readonly text: string;
}

function toLines(source: string[]): Line[] {
  const lines: Line[] = [];
  source.forEach((raw, index) => {
    const text = stripComment(raw).trimEnd();
    if (text.trim() !== "") {
      lines.push({
        number: index + 1,
        indent: text.length - text.trimStart().length,
        text: text.trim(),
      });
    }
  });
  return lines;
}

/** Parse the block mapping made of `lines` (all indented deeper than the key). */
function parseBlock(
  lines: readonly Line[],
  problems: string[],
): Record<string, YamlValue> {
  const result: Record<string, YamlValue> = {};
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (line === undefined) break;
    const entry = splitEntry(line.text);
    if (entry === undefined) {
      problems.push(
        `pnpm-workspace.yaml:${String(line.number)}: unsupported construct "${line.text}"`,
      );
      index += 1;
      continue;
    }
    const children: Line[] = [];
    index += 1;
    while (index < lines.length && (lines[index]?.indent ?? 0) > line.indent) {
      const child = lines[index];
      if (child !== undefined) children.push(child);
      index += 1;
    }
    const value = entry.value.trim();
    if (value === "" && children.length > 0) {
      result[entry.key] = parseBlock(children, problems);
    } else if (
      value === "" ||
      value.startsWith("{") ||
      value.startsWith("[") ||
      /^[&*!|>]/u.test(value)
    ) {
      if (value !== "{}") {
        problems.push(
          `pnpm-workspace.yaml:${String(line.number)}: unsupported value for "${entry.key}"`,
        );
      }
    } else {
      result[entry.key] = unquote(value);
    }
  }
  return result;
}

export function readWorkspaceSections(text: string): WorkspaceSections {
  const problems: string[] = [];
  const sections: Record<string, YamlValue> = {};
  const lines = toLines(text.split("\n"));
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    index += 1;
    if (line === undefined || line.indent !== 0) continue;
    const entry = splitEntry(line.text);
    if (entry === undefined || !SECTIONS.has(entry.key)) continue;
    const body: Line[] = [];
    while (index < lines.length && (lines[index]?.indent ?? 0) > 0) {
      const next = lines[index];
      if (next !== undefined) body.push(next);
      index += 1;
    }
    const inline = entry.value.trim();
    if (inline !== "" && inline !== "{}") {
      problems.push(
        `pnpm-workspace.yaml:${String(line.number)}: unsupported value for "${entry.key}"`,
      );
    } else if (body.length > 0) {
      sections[entry.key] = parseBlock(body, problems);
    }
  }
  return { sections, problems };
}
