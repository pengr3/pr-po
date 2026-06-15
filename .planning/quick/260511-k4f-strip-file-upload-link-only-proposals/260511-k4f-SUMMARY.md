---
quick_id: 260511-k4f
status: complete
date: 2026-05-11
commit: 9eec78f
---

# Quick Task 260511-k4f: Strip File Upload — Link-Only Attachments

## What changed

**proposals.js** (-224 lines net):
- Removed `import { storage, ref, uploadBytes, getDownloadURL, deleteObject }` line
- Main attachment widget: removed radio group + file input; URL input now shown directly
- Deleted `_switchProposalAttachmentKind()` function
- `saveProposalAttachment()`: removed file branch, `oldPathToDelete`, both `deleteObject` calls — now link-only
- `removeProposalAttachment()`: removed `wasFile`, `oldStoragePath`, `deleteObject` block
- Comms log form: replaced 3-radio group (None/Link/File) + file input with a single optional URL input
- Deleted `_switchCommsAttachmentKind()` function
- `saveCommsEntry()`: removed `kind` radio read + `else if (kind === 'file')` branch; reads URL directly (optional)
- `toggleAddCommsForm()`: simplified close path — clears URL input, removes radio/fileBox refs
- Removed `window._switchProposalAttachmentKind` and `window._switchCommsAttachmentKind` from init() + destroy()

**firebase.js** (-30 lines):
- Removed firebase-storage.js CDN import block
- Removed `const storage = getStorage(app)`
- Removed `storage` from export line
- Removed `export { getStorage, ref, uploadBytes, getDownloadURL, deleteObject }`
- Removed `window.firebaseStorage = { ... }`

**firebase.json**: removed `"storage"` block

**storage.rules**: deleted (no longer needed)

## Decisions
- attachment_kind='link' path fully preserved in both widgets
- `attachment_storage_path` / `attachment_filename` fields still written as `null` — graceful fallback for any legacy docs
- `_openProposalAttachmentReplace` and `_openProposalAttachmentRemoveConfirm` unchanged — still functional
- `_renderCommsEntry` file-attachment display branch kept as graceful read fallback for legacy docs
