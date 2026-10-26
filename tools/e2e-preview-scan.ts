// Reads the preview specs' source for the clean secret scan every one of them must
// end with (tools/e2e-preview-specs.test.ts).

import { inDirectory, sources } from "./e2e-preview-support.ts";

/**
 * Whether the spec `text` takes the `secretScan` fixture and ends with a clean
 * scan: `secretScan.expectClean()` called, the fixture named in the test's
 * arguments (comments left out, so a comment cannot stand in for the call).
 */
export const endsWithCleanScan = (text: string): boolean => {
  const code = text
    .replaceAll(/\/\*[\s\S]*?\*\//gu, "")
    .replaceAll(/^\s*\/\/.*$/gmu, "");
  return (
    /\(\s*\{[^}]*\bsecretScan\b[^}]*\}\s*(?:,[^)]*)?\)\s*=>/u.test(code) &&
    /\bawait\s+secretScan\.expectClean\(\)/u.test(code)
  );
};

/** The files of `directory` whose source does not end with a clean scan. */
export const withoutCleanScan = (directory: string): readonly string[] =>
  [...sources]
    .filter(([path]) => inDirectory(directory, path))
    .filter(([, text]) => !endsWithCleanScan(text))
    .map(([path]) => path);
