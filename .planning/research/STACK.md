# Stack Research: v3.2 — Supplier Search, Proof of Procurement & Payables Tracking

**Domain:** Zero-build static SPA — new external integration (Google Drive) + client-side filtering + Firestore schema additions
**Researched:** 2026-03-13
**Confidence:** HIGH (supplier search + Firestore schema) / MEDIUM (Google Drive integration)

---

## Executive Summary

Two of the three features require zero new libraries:

1. **Supplier search bar** — pure client-side filtering of an already-loaded in-memory array. No Firestore query changes. No library. One input event listener.

2. **RFP / payables tracking** — new Firestore collections and fields only. No date library needed; all payment-due-date arithmetic is 1–3 lines of vanilla `Date` math. Staggered payments stored as a subcollection within each RFP document.

3. **Proof of procurement (Google Drive upload)** — the only genuine stack addition. Requires two Google CDN scripts. Works entirely client-side with the OAuth token model (no backend required). The Drive link is stored in Firestore; no Firebase Storage is touched.

The core zero-build vanilla JS + Firebase Firestore v10.7.1 stack is unchanged. No npm packages, no build step, no new Firebase products.

---

## Feature 1: Supplier Search Bar

### Decision: Client-side filtering, not Firestore query

The suppliers collection is already loaded in full via an `onSnapshot` listener in `procurement.js`. Filtering against an in-memory array is instantaneous and costs zero Firestore reads.

A Firestore `where('supplier_name', '>=', term)` range query would require a composite index, consume reads on every keystroke, and still not support substring matching (Firestore only supports prefix queries on strings). Client-side substring matching with `String.prototype.includes()` or `toLowerCase()` covers the "search by name and/or contact person" requirement fully.

### Implementation

```javascript
// No new library. No new Firestore query.
// Filter the existing suppliersData array already in memory:

function renderFilteredSuppliers(searchTerm) {
    const term = searchTerm.toLowerCase().trim();
    const filtered = suppliersData.filter(s =>
        s.supplier_name?.toLowerCase().includes(term) ||
        s.contact_person?.toLowerCase().includes(term)
    );
    renderSuppliersTable(filtered);
}

// Attach to existing search input:
document.getElementById('supplierSearch').addEventListener('input', e => {
    renderFilteredSuppliers(e.target.value);
});
```

**Confidence:** HIGH — exact same pattern already used for the project search bar (projects.js) and client search bar (clients.js) in the current codebase.

---

## Feature 2: Proof of Procurement — Google Drive Integration

### Stack Additions Required

| Technology | Source | Purpose |
|------------|--------|---------|
| Google API Client Library (gapi) | `https://apis.google.com/js/api.js` (CDN) | Loads Picker library, wraps Drive API v3 calls |
| Google Identity Services (GIS) | `https://accounts.google.com/gsi/client` (CDN) | OAuth 2.0 token model — issues access tokens client-side |

Both are loaded as `<script defer>` in `index.html`. No npm install. No build step.

### OAuth Approach: Token Model (Implicit-style), Not Authorization Code Flow

The recommended long-term approach is Authorization Code + PKCE, but it requires a backend to exchange the code and manage refresh tokens. This project has no backend and cannot add one.

The **token model** (`google.accounts.oauth2.initTokenClient`) is:
- Still fully supported (Google's own Picker quickstart uses it as of 2025)
- Works entirely in the browser without a server
- Appropriate for internal tools where users are a known, small set
- Issues a short-lived access token (~1 hour) sufficient for a one-time upload session

The authorization code flow is the right choice for a consumer app that needs long-lived offline access. It is the wrong choice here.

**Confidence:** MEDIUM — token model support confirmed in official quickstart docs. Google has signaled long-term preference for auth-code flow but has not deprecated the token model.

### Required Google Cloud Setup (one-time, outside codebase)

1. Enable Google Drive API and Google Picker API in Google Cloud Console
2. Create an OAuth 2.0 Client ID (type: Web Application) — add `https://your-netlify-domain.app` as authorized JS origin
3. Create an API Key (restricted to Picker API + your domain)
4. App ID = Google Cloud project number (from IAM & Admin > Settings)

These values are **not secrets** — they are safe to embed in client-side JavaScript. The OAuth Client ID for a web application does not expose privileged access; it only allows the OAuth consent flow to proceed.

### OAuth Consent Screen: "Unverified App" Warning

The app will show a Google "unverified app" warning until the OAuth consent screen is verified. For an internal company tool with fewer than 100 users, this warning is acceptable and Google does not require verification. The Procurement officer sees it once, clicks "Advanced > Go to [app] (unsafe)", and proceeds. Verification requires domain ownership in Google Search Console + a submitted app review (2–3 days).

**Recommendation:** Ship without verification first. If the "unverified" warning creates friction for users, do verification. It is not a blocker.

### Scope: Use `drive.file`, Not `drive`

```
https://www.googleapis.com/auth/drive.file
```

`drive.file` is non-sensitive (no verification required for it alone). It grants read/write access only to files the app creates — the user cannot accidentally expose their entire Drive. `drive` (full access) triggers sensitive scope verification and shows a stronger warning.

### Upload Flow

```javascript
// 1. Load both CDN scripts (index.html):
// <script src="https://apis.google.com/js/api.js" defer></script>
// <script src="https://accounts.google.com/gsi/client" defer></script>

// 2. Initialize token client (once, on Procurement tab init):
const tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_CLIENT_ID,
    scope: 'https://www.googleapis.com/auth/drive.file',
    callback: (tokenResponse) => {
        accessToken = tokenResponse.access_token;
    },
});

// 3. On "Upload Document" button click — request token then upload:
function uploadProofDocument(file, poId) {
    tokenClient.requestAccessToken({ prompt: '' });
    // callback fires with accessToken, then:
    const metadata = { name: `PO-${poId}-proof-${Date.now()}`, mimeType: file.type };
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', file);

    fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
        body: form,
    })
    .then(r => r.json())
    .then(driveFile => {
        // driveFile.id is the Drive file ID
        // Store driveFile.webViewLink (or construct it) in Firestore on the PO document
        updateDoc(doc(db, 'pos', poId), {
            proof_drive_file_id: driveFile.id,
            proof_drive_link: `https://drive.google.com/file/d/${driveFile.id}/view`,
            proof_uploaded_by: currentUser.uid,
            proof_uploaded_at: serverTimestamp(),
        });
    });
}
```

**File size limit:** Multipart upload supports up to 5 MB. For larger files (invoices, photos), switch to `uploadType=resumable`. Procurement documents (PDFs, photos) are typically under 5 MB.

### What Gets Stored in Firestore

No binary data goes to Firestore or Firebase Storage. Only:

```
pos/{poId}:
  proof_drive_file_id: "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"
  proof_drive_link: "https://drive.google.com/file/d/.../view"
  proof_uploaded_by: "uid-of-procurement-user"
  proof_uploaded_at: Timestamp
```

**Confidence:** HIGH — pattern confirmed via official Drive API v3 multipart upload documentation.

### Alternative Considered: Direct Google Drive Folder Link

The simplest approach would be: give Procurement a shared Google Drive folder URL, they upload manually via Google Drive's own UI, then paste the link into a Firestore text field. This requires zero code. It was considered and rejected because it creates no audit trail, no upload timestamp, no uploader identity — and the link field could be any URL (malformed, wrong doc, etc.). The API approach ties the upload to the specific PO and records who did it.

### Alternative Considered: Firebase Storage

Explicitly rejected by the user. Firebase Storage costs mount with document storage; the company already has Google Drive with available space.

---

## Feature 3: RFP / Payables Tracking — Firestore Schema

### Decision: No Date Library

Payment due date math is addition of N days to a known date. Vanilla JavaScript handles this in one line:

```javascript
// Add 30 days to a date — no library:
function addDays(date, days) {
    const d = new Date(date);
    d.setUTCDate(d.getUTCDate() + days);
    return d;
}

// Example: Net 30 from PO issue date
const dueDate = addDays(po.date_issued.toDate(), 30);
```

DST edge cases do not affect this use case because payment terms are in calendar days, not hours. Using `setUTCDate` avoids the DST-crossing bug. No `date-fns`, no `dayjs`, no `moment` needed.

**Confidence:** HIGH — this is a solved problem in vanilla JS.

### New Firestore Collection: `rfps`

```
rfps/{rfpId}
  rfp_id: "RFP-2026-001"           // Sequential, same pattern as PR-YYYY-###
  po_id: "PO-2026-012"             // Parent PO
  pr_id: "PR-2026-009"             // Linked PR
  mrf_id: "MRF-2026-004"          // Linked MRF
  supplier_name: string            // Denormalized for display (no join)
  total_amount: number             // Full PO amount
  payment_terms: string            // "Net 30" | "Net 60" | "Net 90" | "50/50" | "Custom"
  payment_notes: string            // Optional freetext
  status: "Pending" | "Approved" | "Rejected" | "Partially Paid" | "Paid"
  submitted_by: string             // uid
  submitted_at: Timestamp
  approved_by: string              // uid (Finance)
  approved_at: Timestamp
  proof_drive_link: string         // Drive link (if attached at RFP submission)
```

### Subcollection: `rfps/{rfpId}/payment_schedule`

Staggered payments are stored as a subcollection (not an array field) because each installment has its own status lifecycle and will be queried/updated independently by Finance.

```
rfps/{rfpId}/payment_schedule/{scheduleId}
  installment_number: number       // 1, 2, 3...
  amount: number                   // This installment's amount
  percentage: number               // Optional: 50, 25, 25...
  due_date: Timestamp              // Calculated from payment_terms + po date_issued
  status: "Pending" | "Paid"
  paid_at: Timestamp               // Set when Finance marks paid
  paid_by: string                  // uid
  notes: string                    // Optional
```

**Why subcollection, not array:** Firestore arrays cannot be partially updated — updating one installment's status requires reading and rewriting the entire array. A subcollection allows `updateDoc(doc(db, 'rfps', rfpId, 'payment_schedule', scheduleId), { status: 'Paid' })` without touching sibling installments.

### PO Document: New Fields

```
pos/{poId}:
  rfp_id: string                   // Set when RFP is created for this PO (null if none yet)
  payment_status: "Unpaid" | "Partially Paid" | "Paid"   // Derived and stored for display
  proof_drive_file_id: string      // From Google Drive upload
  proof_drive_link: string         // Viewable URL
  proof_uploaded_by: string        // uid
  proof_uploaded_at: Timestamp
```

### Payables View: Client-Side Aggregation

The Finance payables summary (total outstanding per supplier) is computed client-side from the `rfps` collection, exactly like the existing expense breakdown modal. No new Firestore aggregation queries, no Cloud Functions. At the current data volume this is performant.

```javascript
// Aggregate outstanding payables per supplier:
const payablesBySupplier = {};
rfpsData.forEach(rfp => {
    if (rfp.status !== 'Paid') {
        payablesBySupplier[rfp.supplier_name] =
            (payablesBySupplier[rfp.supplier_name] || 0) + rfp.total_amount;
    }
});
```

**Confidence:** HIGH — same pattern as existing expense breakdown modal (expense-modal.js).

### Sequential ID Generation for RFPs

Reuse `generateSequentialId()` from `utils.js` with `rfps` collection and prefix `RFP`. No new utility needed.

---

## Recommended Stack Summary

### Core Technologies (Unchanged)

| Technology | Version | Purpose |
|------------|---------|---------|
| Firebase Firestore | v10.7.1 (CDN) | Data storage, real-time listeners, new `rfps` collection |
| Firebase Auth | v10.7.1 (CDN) | Existing auth — unchanged |
| Vanilla JavaScript | ES6 Modules | Zero-build SPA — unchanged |

### New CDN Additions (Google Drive integration only)

| Library | CDN URL | Purpose | When to Load |
|---------|---------|---------|--------------|
| Google API Client (gapi) | `https://apis.google.com/js/api.js` | Picker library loader, Drive API wrapper | `index.html` with `defer` |
| Google Identity Services | `https://accounts.google.com/gsi/client` | OAuth 2.0 token model for access tokens | `index.html` with `defer` |

These two scripts add ~150 KB to the initial page load (both are served by Google CDN and likely cached). They are not needed for supplier search or RFP features — but since they load deferred and are only initialized when the Procurement tab is accessed, there is no perceptible impact.

### No New Libraries For

| Capability | Why No Library |
|------------|----------------|
| Supplier search/filter | `Array.prototype.filter()` + `String.prototype.includes()` — 3 lines |
| Payment date arithmetic | `Date.setUTCDate()` — 4 lines, no DST issues |
| Payables aggregation | `Array.prototype.reduce()` — same as existing expense modal |
| RFP ID generation | `generateSequentialId()` already in `utils.js` |

---

## Alternatives Considered

| Recommended | Alternative | Why Not |
|-------------|-------------|---------|
| Google Drive API + GIS token model | Firebase Storage | User explicitly rejected; storage costs at scale |
| Google Drive API + GIS token model | Dropbox API | No existing company Dropbox; adds unfamiliar service |
| Google Drive API + GIS token model | Auth code + PKCE with backend | No backend exists; would require Netlify Functions or similar — major scope increase |
| Firestore `rfps` subcollection for installments | Array field on `rfps` | Arrays require full rewrite on partial update; subcollection allows per-installment status updates |
| Client-side payables aggregation | Firestore aggregate queries | Aggregate queries require Firestore billing plan; current data volume makes client-side fast enough |
| `Array.filter()` for supplier search | Firestore prefix query | Prefix query: requires composite index, costs reads per keystroke, no substring match. Client filter: free, instant, substring-capable |

---

## What NOT to Add

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Firebase Storage | User explicitly rejected; Drive already available | Google Drive API |
| `date-fns` or `dayjs` | 4-line vanilla `Date` math covers all payment term arithmetic | `Date.setUTCDate()` |
| Netlify Functions / backend proxy | Adds deployment complexity, new failure surface | GIS token model works fully client-side |
| `drive` (full Drive scope) | Triggers sensitive scope verification, wider permissions | `drive.file` (non-sensitive, files created by app only) |
| Google Picker API (for uploads) | Picker is for *selecting existing* Drive files, not for uploading new files | Drive API v3 multipart upload via `fetch` |

---

## Security Rules Changes Required

```
// New collection (add to firestore.rules):
match /rfps/{rfpId} {
    allow read: if isActiveUser();
    allow create: if hasRole(['super_admin', 'procurement', 'finance']);
    allow update: if hasRole(['super_admin', 'procurement', 'finance']);
    allow delete: if hasRole(['super_admin']);

    match /payment_schedule/{scheduleId} {
        allow read: if isActiveUser();
        allow create: if hasRole(['super_admin', 'finance', 'procurement']);
        allow update: if hasRole(['super_admin', 'finance']);
        allow delete: if false;  // Append-only schedule
    }
}
```

---

## Version Compatibility

| Existing Package | New Addition | Compatibility |
|-----------------|-------------|---------------|
| Firebase SDK v10.7.1 | Google APIs CDN scripts | No interaction — separate scripts on separate origins. No conflict. |
| `apis.google.com/js/api.js` | `accounts.google.com/gsi/client` | Both required; `gapi` handles Drive calls, GIS handles tokens. Load order: both `defer`, GIS initializes first in practice. |

---

## Sources

- [Google Picker API Overview](https://developers.google.com/workspace/drive/picker/guides/overview) — Picker is for file selection; upload requires Drive API v3 directly (HIGH confidence, official docs)
- [Google Drive API JavaScript Quickstart](https://developers.google.com/workspace/drive/api/quickstart/js) — Confirms token model still used in official samples, both CDN scripts required, works client-side (HIGH confidence, official docs)
- [Migrate to Google Identity Services](https://developers.google.com/identity/oauth2/web/guides/migration-to-gis) — Auth code flow recommended for backend apps; token model remains valid for browser-only SPAs (MEDIUM confidence — docs favor auth-code but don't deprecate token model)
- [Google Drive API: Manage Uploads](https://developers.google.com/workspace/drive/api/guides/manage-uploads) — Multipart upload spec, 5 MB limit, fetch-compatible (HIGH confidence, official docs)
- [Google Drive API Scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth) — `drive.file` is non-sensitive, does not trigger verification (HIGH confidence, official docs)
- [Unverified Apps — Google Cloud](https://support.google.com/cloud/answer/7454865) — Apps with <100 users and internal use do not require verification (HIGH confidence, official support page)
- [Firestore Data Modeling — Subcollections](https://firebase.google.com/docs/firestore/manage-data/structure-data) — Subcollections preferred when child documents have independent lifecycles (HIGH confidence, official docs)

---
*Stack research for: v3.2 Supplier Search, Proof of Procurement & Payables Tracking*
*Researched: 2026-03-13*
*Confidence: HIGH (supplier search, Firestore schema, payment math) / MEDIUM (Google Drive OAuth token model longevity)*
