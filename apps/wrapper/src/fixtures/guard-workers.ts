// Worker fixtures for the guard tests. Vite bundles a worker with its own plugin
// pipeline (`worker.plugins`), separate from the main one, so a worker that
// imports the contracts test-only entry must be caught there too.

type Write = (path: string, text: string) => void;

const TESTING = "@intraverse/se-client-contracts/testing";

/** Entry file, and the case it exercises. */
export const WORKER_CASES: ReadonlyArray<readonly [string, string]> = [
  ["new Worker(new URL(...)) with a direct import", "src/worker-url-direct.ts"],
  [
    "new Worker(new URL(...)) with a transitive import",
    "src/worker-url-transitive.ts",
  ],
  ["a ?worker import", "src/worker-query.ts"],
  ["a ?worker&inline import", "src/worker-inline.ts"],
  ["a ?worker&url import", "src/worker-url-query.ts"],
  ["a ?sharedworker import", "src/shared-worker.ts"],
  ["a ?sharedworker&inline import", "src/shared-worker-inline.ts"],
  ["a worker that starts another worker", "src/worker-nested.ts"],
];

export const writeWorkerFixtures = (write: Write): void => {
  write(
    "src/w-direct.ts",
    `import { vector } from "${TESTING}";\nself.postMessage(vector);\n`,
  );
  write("src/w-helper.ts", `export { vector } from "${TESTING}";\n`);
  write(
    "src/w-transitive.ts",
    'import { vector } from "./w-helper.ts";\nself.postMessage(vector);\n',
  );
  write(
    "src/w-outer.ts",
    'const inner = new Worker(new URL("./w-direct.ts", import.meta.url), { type: "module" });\nself.postMessage(inner);\n',
  );
  write(
    "src/worker-url-direct.ts",
    'export const w = new Worker(new URL("./w-direct.ts", import.meta.url), { type: "module" });\n',
  );
  write(
    "src/worker-url-transitive.ts",
    'export const w = new Worker(new URL("./w-transitive.ts", import.meta.url), { type: "module" });\n',
  );
  const queries: ReadonlyArray<readonly [string, string, string]> = [
    ["worker-query", "Worker", "?worker"],
    ["worker-inline", "Worker", "?worker&inline"],
    ["worker-url-query", "url", "?worker&url"],
    ["shared-worker", "Worker", "?sharedworker"],
    ["shared-worker-inline", "Worker", "?sharedworker&inline"],
  ];
  for (const [file, local, query] of queries) {
    write(
      `src/${file}.ts`,
      `import ${local} from "./w-direct.ts${query}";\nconsole.log(${local});\n`,
    );
  }
  write(
    "src/worker-nested.ts",
    'import Outer from "./w-outer.ts?worker";\nconsole.log(Outer);\n',
  );
};
