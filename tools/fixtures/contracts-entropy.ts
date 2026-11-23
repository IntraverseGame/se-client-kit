export const ENTROPY_CASES = [
  "produced-slot",
  "skipped-slot-ledger-gap",
  "skipped-slot",
  "skipped-slots-long-term-storage",
] as const;

export const entropyPath = (name: string): string =>
  `src/vectors/entropy/v1/solana/${name}.json`;

export const ENTROPY_PATHS: readonly string[] = ENTROPY_CASES.map(name =>
  entropyPath(name),
);
