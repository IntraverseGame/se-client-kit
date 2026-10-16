import type { UserConfig } from "tsdown";

const SOURCE_MAP_COMMENT = /\n?\/\/# sourceMappingURL=.*$/u;

export const base = {
  format: "esm",
  platform: "neutral",
  target: "es2023",
  outDir: "dist",
  clean: true,
  // Declarations come from the explicit types (isolatedDeclarations), and carry
  // no declaration map: nothing ships the sources they would point at.
  dts: { generator: "oxc", sourcemap: false },
  // JavaScript keeps its source maps.
  sourcemap: true,
  tsconfig: "tsconfig.json",
  // Only a package's own source is bundled into its dist; nothing from
  // node_modules ever is. A kit package stays an import (`neverBundle`), and any
  // other package that is not in `dependencies` (a devDependency, or one that is
  // not declared at all) fails the build (`onlyBundle: []`) instead of being
  // inlined. tsdown otherwise inlines anything not listed in `dependencies`,
  // which would copy another package, a dependency the allow-list never saw, or
  // the `contracts` vectors into this one.
  deps: { neverBundle: [/^@intraverse\//u], onlyBundle: [] },
  plugins: [
    {
      // Rolldown appends a `sourceMappingURL` comment to a declaration file
      // even when no map is written for it, which leaves a dangling reference.
      name: "no-dangling-declaration-map-comment",
      generateBundle: (_options, bundle) => {
        for (const file of Object.values(bundle)) {
          if (file.type === "chunk" && file.fileName.endsWith(".d.ts")) {
            file.code = file.code.replace(SOURCE_MAP_COMMENT, "");
          }
        }
      },
    },
  ],
} satisfies UserConfig;
