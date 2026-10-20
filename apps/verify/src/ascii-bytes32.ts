// Text in the `bytes32` form `newRound` uses for the bet's unit and the entropy
// source: ASCII, left-aligned, zero-padded to 32 bytes.

const WORD_BYTES = 32;
const MAX_ASCII = 0x7f;

/** `undefined` for text that is not ASCII or is longer than 32 bytes. */
export const asciiBytes32 = (text: string): `0x${string}` | undefined => {
  if (text.length > WORD_BYTES) return undefined;
  let hex = "";
  for (let i = 0; i < text.length; i += 1) {
    const code = text.codePointAt(i) ?? 0;
    if (code > MAX_ASCII) return undefined;
    hex += code.toString(16).padStart(2, "0");
  }
  return `0x${hex.padEnd(WORD_BYTES * 2, "0")}`;
};
