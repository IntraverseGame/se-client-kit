import schema from "./se.snapshot.v1.schema.json" with { type: "json" };

/**
 * The Snapshot JSON Schema `se.snapshot/1`, as vendored from the backend. It is
 * data of unknown shape here on purpose: `@intraverse/se-client-snapshot`
 * interprets it.
 */
export const snapshotSchema: Readonly<Record<string, unknown>> = schema;
