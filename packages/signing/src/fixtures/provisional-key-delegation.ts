// Test-only and provisional: only `*.test.ts` imports it. Copied from the
// backend's key-delegation contract vectors, its published
// `key-delegation/v1 vectors` (the accepted case); independently re-derived
// here. S2, #220's vendoring task (RFC-006), deletes this file and moves its
// tests to the lock-pinned vectors on `contracts`' test-only entry. The notice
// is `en-draft-1`, given by its hash only. The signer is a public, well-known
// local development account; no key is held here.

import type { Address, Bytes32, Hex } from "../hex.ts";

export type ProvisionalKeyDelegation = {
  readonly encodeType: string;
  readonly typeHash: Bytes32;
  readonly domainEncodeType: string;
  readonly domainSeparator: Bytes32;
  readonly noticeHash: Bytes32;
  readonly actionKey: Address;
  readonly sessionId: string;
  readonly sessionIdBytes32: Bytes32;
  readonly expiry: number;
  readonly structHash: Bytes32;
  readonly digest: Bytes32;
  readonly signature: Hex;
  readonly wallet: Address;
};

export const provisionalKeyDelegation: ProvisionalKeyDelegation = {
  encodeType:
    "KeyDelegation(string notice,address actionKey,bytes32 sessionId,uint64 expiry)",
  typeHash:
    "0x3f61f038833be2c4a751a98b54b11d874f7683ea8d0c052705a241abd33c0daf",
  domainEncodeType: "EIP712Domain(string name,string version)",
  domainSeparator:
    "0xdf1a3469adcdcfcc9f3bbd698fd36df7cee6c4dddad538d44b80ab537d6fdabf",
  noticeHash:
    "0x71508a4d7d3e376ef39a9d928b6ce49120f86f99de1987add45b405f8b5ba777",
  actionKey: "0x90f79bf6eb2c4f870365e785982e1f101e93b906",
  sessionId: "ses_0192f0c4a1b27c3d8e9f00112233aabb",
  sessionIdBytes32:
    "0x0192f0c4a1b27c3d8e9f00112233aabb00000000000000000000000000000000",
  expiry: 1_795_000_000,
  structHash:
    "0xf9137991171a6063f5d74cf89b44c02a12d62deedf89ccf499d6090d3e979d87",
  digest: "0x1e8f00b98749a4104f405d810a91fe9705e8c1f545754a08a6cd8881abec7b17",
  signature:
    "0x9ad187814121626d2b32fea77688284c45d7ce9b9403a4fa929c78a6042b1f8b460ddb0b51ab48d910c58c84a22c216610fed39ccf2dab52c1cbc608e15c85a81b",
  wallet: "0x70997970c51812dc3a010c7d01b50e0d17dc79c8",
};
