---
quick_id: 260704-luf
title: Lifecycle gate file upload (Inspection / Completion / COC / NTP)
status: complete
date: 2026-07-04
branch: v4.1
supersedes: v4.1 milestone "in-app generated documents" (paused mid-discussion)
---

# Quick Task 260704-luf: Lifecycle Gate File Upload

## Origin

Pivot from the paused **v4.1** milestone. That milestone proposed turning the 3
lifecycle gate documents (Inspection Report, Completion Report, COC) into **in-app
generated** documents (form-fill modals, doc numbers, signatures, a shared
`document-gen.js`). Mid-discussion the user revised scope to the minimal ask:

> "let's just do a file upload on the mentioned gates. Let's add an option to do
> file upload and that's it."

So: keep the existing external-link box, **add a file-upload option beside it**.
No generation, no templates, no signatures.

## Key finding — this rewires a deliberate removal

File upload via Firebase Storage was built for **proposals** in Phase 87, then
**stripped** on 2026-05-11 (`quick 260511-k4f`) back to link-only: the Storage SDK
import, `getStorage`, `storage.rules`, and the `firebase.json` storage block were
all removed. `lcAttachFile` in project/service-detail was left as a **stub** (stored
the filename string, no bytes). This task re-adds Storage, scoped to lifecycle docs.

## Decisions

- **Backend = Firebase Storage** (recommended over base64-in-Firestore, which caps
  ~750 KB — too small for real report PDFs). Requires the **Blaze plan** on both
  Firebase projects (see punch list — a console step the user must do).
- **Parity**: implement in both `project-detail.js` and `service-detail.js`.
- **Gate rule unchanged**: gates already pass on `<doc>_url` present; a file upload
  sets `<doc>_url` to the download URL, so no gate-logic change.
- **Path convention**: `projects/{id}/<docKey>.<ext>` and `services/{id}/<docKey>.<ext>`
  (deterministic, one object per doc type; re-upload same ext overwrites).
- **New field** `<docKey>_storage_path` persisted for reliable `deleteObject` on
  replace/remove. Added to the projects `hasOnly()` field-mask (services has none).
- **Constraints**: 10 MB cap; ext allowlist pdf/doc/docx/pptx/xlsx/png/jpg/jpeg
  (mirrors the proven Phase 87 proposals upload).

## Tasks

1. `firebase.js` — re-import firebase-storage; export `storage` + `ref`/`uploadBytes`/
   `getDownloadURL`/`deleteObject`; `window.firebaseStorage`.
2. `storage.rules` (new) + `firebase.json` storage block; `firestore.rules` add
   `*_storage_path` to projects field-mask.
3. `project-detail.js` — Link/Upload tabs in `buildAttachZone`; real `lcAttachFile`
   upload; `_storage_path` tracking + `deleteObject` cleanup in attachLink/removeDoc;
   clickable attached-doc name.
4. `service-detail.js` — mirror of task 3.

## Out of scope

- In-app document generation (the original v4.1 idea) — dropped.
- CSP change — not needed (`connect-src https://*.googleapis.com` already covers
  `firebasestorage.googleapis.com`).
- Enabling Blaze billing / deploying rules — user/operator actions (punch list).
