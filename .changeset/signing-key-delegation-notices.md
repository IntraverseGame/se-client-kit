---
"@intraverse/se-client-signing": minor
---

Add `readKeyDelegationNotices`, which reads the `key-delegation/v1` notices
list (data of unknown shape, such as `@intraverse/se-client-contracts`'
`keyDelegationNotices`) and returns its entries, frozen and in the list's
order, each with its `id`, `text`, `noticeHash`, and `status`. It refuses with
`invalid-input`, naming no value, anything but version 1 with exactly
`version` and `notices`; an entry that is not exactly `id`, `text`,
`keccak256`, and `status`; an `id` off `^[a-z0-9-]{1,64}$`; a text that is
empty, longer than 512 UTF-8 bytes (stricter than the schemas' 512 code points
for a notice in a Snapshot or a verify body: the list's limit is the one that
holds for a listed text), or holds a control or format character, a line or
paragraph separator, or a lone surrogate; a hash that is not the text's, in
lowercase; an unknown status; and a repeated `id` or hash. With the types
`KeyDelegationNotice` and `NoticeStatus`. Choosing a notice by status, or
looking one up by hash, is the caller's.
