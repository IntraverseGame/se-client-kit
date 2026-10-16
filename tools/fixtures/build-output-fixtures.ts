// Shared fixtures for the build-output tests: a `contracts` dist as tsdown
// emits it (a runtime entry re-exporting a shared schema chunk, and a test-only
// entry with the vectors).

import type { Dist } from "../build-output.ts";

export const dist = (
  name: string,
  files: Record<string, string>,
  exportTargets?: string[],
): Dist => ({
  name,
  files: new Map(Object.entries(files)),
  ...(exportTargets === undefined ? {} : { exportTargets }),
});

export const map = (...sources: string[]): string =>
  JSON.stringify({ version: 3, sources });

// What tsdown emits for `contracts` when the runtime entry only re-exports a
// shared chunk of the schemas and the test-only entry adds the vectors.
export const cleanContracts = (): Record<string, string> => ({
  "index.js": 'export { t as schema } from "./schema-AAAA.js";\n',
  "index.d.ts": "export {};\n",
  "schema-AAAA.js":
    "const t = 1;\nexport { t };\n//# sourceMappingURL=schema-AAAA.js.map",
  "schema-AAAA.js.map": map("../src/schemas/schema.ts"),
  "testing.js":
    'import { t } from "./schema-AAAA.js";\nexport const vector = [t];\n',
  "testing.js.map": map("../src/vectors/v.ts", "../src/testing.ts"),
  "testing.d.ts": "export {};\n",
});

const CONTRACTS_EXPORTS = [
  "./dist/index.d.ts",
  "./dist/index.js",
  "./dist/testing.d.ts",
  "./dist/testing.js",
];

export const contracts = (overrides: Record<string, string> = {}): Dist =>
  dist("contracts", { ...cleanContracts(), ...overrides }, CONTRACTS_EXPORTS);
