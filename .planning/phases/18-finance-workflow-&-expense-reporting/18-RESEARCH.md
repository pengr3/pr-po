# Phase 18: Finance Workflow & Expense Reporting - Research

**Researched:** 2026-02-07
**Domain:** Signature capture, PDF generation, Firestore aggregation, user attribution
**Confidence:** HIGH

## Summary

Phase 18 requires signature capture in approval modals, enhanced document generation with embedded signatures, user attribution for document creators, removal of unused UI tabs, and comprehensive project expense reporting with aggregation queries.

The standard approach uses signature_pad library (szimek) for canvas-based signature capture, HTML5 canvas toDataURL() for image export, embedded base64 images in HTML print documents (no jsPDF needed for this codebase's print-to-PDF workflow), Firestore getAggregateFromServer() for efficient expense calculation, and denormalized user attribution following Phase 15/17 patterns.

**Primary recommendation:** Use signature_pad 5.x via CDN for signature capture in approval modal, export as base64 PNG, store signature data URL in Firestore with PO/PR documents, embed signatures in existing HTML document templates, use getAggregateFromServer() with sum() for multi-collection expense aggregation (separate queries combined in application code), follow established denormalization pattern for Finance user attribution.

## Standard Stack

The established libraries/tools for signature capture, PDF generation, and Firestore aggregation:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| signature_pad | 5.x (latest) | HTML5 canvas signature capture | Industry standard, 26k+ GitHub stars, zero dependencies, smooth Bézier curve interpolation, touch/stylus/mouse support |
| Firestore Web SDK | v10.7.1 | Aggregation queries (getAggregateFromServer) | Built-in aggregation (count, sum, average), efficient server-side calculation, cost-effective (1 read per 1000 entries) |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| HTML print window | Browser native | PDF generation via Print > Save as PDF | Already used in codebase (procurement.js:4880), zero dependencies, works client-side |
| Canvas API | Browser native | High-DPI signature rendering | toDataURL() export to base64 PNG/JPEG, devicePixelRatio scaling for retina displays |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| signature_pad | jSignature, LemonadeJS Signature | signature_pad is more mature (2015+), better touch handling, actively maintained |
| signature_pad | Custom canvas implementation | Hand-rolling signature capture misses velocity-based stroke width, pressure sensitivity, multi-touch prevention |
| jsPDF | Print window to PDF | This codebase already uses HTML templates + print window (see generatePRHTML, generatePOHTML in procurement.js). jsPDF adds 200KB+ and has CVE-2025-68428 path traversal vulnerability in versions <4.0.0 |
| Client-side aggregation | getAggregateFromServer | Loading all POs client-side wastes bandwidth and Firestore reads; aggregation is 1000x more efficient |

**Installation:**
```html
<!-- Add to Finance view modal HTML or index.html -->
<script src="https://cdn.jsdelivr.net/npm/signature_pad@5.0.3/dist/signature_pad.umd.min.js"></script>
```

## Architecture Patterns

### Recommended Signature Capture Flow
```
Approval Modal:
├── Canvas element (sized for signature)
├── Clear button (signaturePad.clear())
├── Approve button (captures signature + creates PO)
└── Signature validation (isEmpty() check)

On Approve:
1. Check signaturePad.isEmpty() → reject if empty
2. Get base64 PNG: signaturePad.toDataURL('image/png')
3. Store in Firestore: po.finance_signature_url = dataURL
4. Embed in PO document template: <img src="{{SIGNATURE_PLACEHOLDER}}">
```

### Pattern 1: Canvas Setup with High-DPI Support
**What:** Initialize signature_pad with devicePixelRatio scaling
**When to use:** On modal open, before user interaction
**Example:**
```javascript
// Source: https://github.com/szimek/signature_pad README
function initializeSignaturePad() {
    const canvas = document.getElementById('signatureCanvas');
    const signaturePad = new SignaturePad(canvas, {
        minWidth: 0.5,
        maxWidth: 2.5,
        penColor: 'rgb(0, 0, 0)',
        backgroundColor: 'rgb(255, 255, 255)'
    });

    // Handle high-DPI displays (retina scaling)
    function resizeCanvas() {
        const ratio = Math.max(window.devicePixelRatio || 1, 1);
        canvas.width = canvas.offsetWidth * ratio;
        canvas.height = canvas.offsetHeight * ratio;
        canvas.getContext("2d").scale(ratio, ratio);
        signaturePad.clear(); // Clears previous signatures on resize
    }

    window.addEventListener("resize", resizeCanvas);
    resizeCanvas();

    return signaturePad;
}
```

### Pattern 2: Signature Validation Before PO Creation
**What:** Ensure signature exists before processing approval
**When to use:** In approvePR/approveTR functions before Firestore write
**Example:**
```javascript
// Source: https://github.com/szimek/signature_pad API
async function approvePRWithSignature() {
    if (signaturePad.isEmpty()) {
        showToast('Please provide your signature before approving', 'error');
        return;
    }

    // Export signature as base64 PNG
    const signatureDataURL = signaturePad.toDataURL('image/png');

    // Store with PO document
    await addDoc(collection(db, 'pos'), {
        // ... other fields
        finance_signature_url: signatureDataURL,
        finance_approver_user_id: currentUser.uid,
        finance_approver_name: currentUser.full_name,
        approved_at: serverTimestamp()
    });
}
```

### Pattern 3: Embedding Signature in HTML Document Templates
**What:** Insert base64 image into existing HTML print templates
**When to use:** In generatePODocument/generatePRDocument functions
**Example:**
```javascript
// Source: Existing pattern in procurement.js:4915-4929
const documentData = {
    PO_ID: po.po_id,
    // ... other fields
    FINANCE_SIGNATURE_URL: po.finance_signature_url || '', // base64 data URL
    FINANCE_APPROVER: po.finance_approver_name || 'Finance Team'
};

// In HTML template (generatePOHTML function):
const htmlTemplate = `
    <div class="signature-section">
        <p><strong>Approved by:</strong> {{FINANCE_APPROVER}}</p>
        ${documentData.FINANCE_SIGNATURE_URL ?
            `<img src="${documentData.FINANCE_SIGNATURE_URL}"
                  alt="Signature"
                  style="max-width: 200px; height: auto; border-bottom: 1px solid #000;">`
            : '<div style="border-bottom: 1px solid #000; width: 200px; height: 50px;"></div>'}
    </div>
`;
```

### Pattern 4: Multi-Collection Expense Aggregation
**What:** Calculate project expenses from POs across multiple categories
**When to use:** refreshProjectExpenses() function for Project List tab
**Example:**
```javascript
// Source: https://firebase.google.com/docs/firestore/query-data/aggregation-queries
async function calculateProjectExpenses(projectName) {
    const posRef = collection(db, 'pos');
    const projectQuery = query(posRef, where('project_name', '==', projectName));

    // Single aggregation call gets all totals
    const snapshot = await getAggregateFromServer(projectQuery, {
        totalExpense: sum('total_amount'),
        poCount: count()
    });

    return {
        totalExpense: snapshot.data().totalExpense,
        poCount: snapshot.data().poCount
    };
}

// For category breakdown (materials, transport, subcon):
async function getExpenseByCategory(projectName) {
    // Transport category expenses
    const transportQuery = query(
        collection(db, 'transport_requests'),
        where('project_name', '==', projectName),
        where('finance_status', '==', 'Approved')
    );
    const transportSnapshot = await getAggregateFromServer(transportQuery, {
        transportTotal: sum('total_amount')
    });

    // Material POs (non-subcon)
    const materialQuery = query(
        collection(db, 'pos'),
        where('project_name', '==', projectName),
        where('is_subcon', '==', false)
    );
    const materialSnapshot = await getAggregateFromServer(materialQuery, {
        materialTotal: sum('total_amount')
    });

    // Subcon POs
    const subconQuery = query(
        collection(db, 'pos'),
        where('project_name', '==', projectName),
        where('is_subcon', '==', true)
    );
    const subconSnapshot = await getAggregateFromServer(subconQuery, {
        subconTotal: sum('total_amount')
    });

    return {
        materials: materialSnapshot.data().materialTotal,
        transport: transportSnapshot.data().transportTotal,
        subcon: subconSnapshot.data().subconTotal
    };
}
```

### Pattern 5: User Attribution for Document Creators
**What:** Capture Finance user who approved PR and created PO
**When to use:** In approvePR/approveTR functions when creating PO documents
**Example:**
```javascript
// Source: Phase 15/17 denormalization pattern
const currentUser = window.getCurrentUser();

if (!currentUser) {
    showToast('Session expired. Please log in again.', 'error');
    return;
}

// When creating PO from approved PR
await addDoc(collection(db, 'pos'), {
    // ... other fields
    finance_approver_user_id: currentUser.uid,
    finance_approver_name: currentUser.full_name || currentUser.email || 'Finance User',
    finance_approved_at: serverTimestamp(),
    date_approved: new Date().toISOString().split('T')[0] // Legacy compatibility
});

// When updating PR with creator info (Procurement side - already done in Phase 17)
// PR already has:
// - pr_creator_user_id
// - pr_creator_name
// - created_at
```

### Pattern 6: Preventing Auto-Redirect After PO Generation
**What:** Keep user on Pending Approvals tab after creating PO
**When to use:** In approvePR function after successful PO creation
**Example:**
```javascript
// Source: Existing router behavior (router.js doesn't call destroy() on tab switches)
async function approvePR(prId) {
    // ... approval logic, create PO

    showToast('PO generated successfully!', 'success');

    // DO NOT redirect: router already handles tab persistence
    // Just refresh the PR list to show updated status
    await refreshPRs();
    closePRModal();

    // User stays on #/finance/approvals tab automatically
}
```

### Anti-Patterns to Avoid
- **Storing raw signature strokes as JSON:** Leads to large documents and complex reconstruction. Use toDataURL() for final image instead.
- **Using jsPDF for this codebase:** The project already has working HTML print templates. Adding jsPDF introduces 200KB+ library, security vulnerabilities (CVE-2025-68428), and complexity.
- **Client-side expense totaling:** Loading all POs to calculate totals wastes reads (1 read per PO vs 1 per 1000 with aggregation).
- **Separate signature approval step:** Integrate signature capture directly into approval modal to reduce clicks.
- **Using client Date.now() for timestamps:** ServerTimestamp prevents clock skew, tampering, and provides millisecond precision.
- **Redirecting after PO creation:** Breaks user flow; they expect to stay on approvals to process next PR.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Signature capture | Custom canvas drawing with mouse events | signature_pad library | Hand-rolled solutions miss: velocity-based stroke width (natural pen feel), pressure sensitivity (stylus support), Bézier curve smoothing (no jagged lines), multi-touch prevention (no accidental scrolling), high-DPI scaling (retina support) |
| Expense totaling | Loop through all POs in JavaScript to sum totals | getAggregateFromServer with sum() | Client-side totaling requires loading all documents (expensive reads, bandwidth). Aggregation does calculation server-side with 1000x fewer reads. |
| User attribution | Manual form input for "approved by" field | window.getCurrentUser() denormalization | Manual input allows spoofing. Auth-based attribution is tamper-proof and automatic. |
| PDF generation with signatures | jsPDF library for programmatic PDF creation | HTML template + browser Print to PDF | This codebase already has working HTML templates (generatePRHTML, generatePOHTML). Print window approach is zero-dependency, smaller bundle, avoids CVE-2025-68428 vulnerability. |
| High-DPI signature rendering | Fixed canvas size | devicePixelRatio scaling | Fixed-size canvas looks blurry on retina displays. Proper scaling maintains sharpness across all screen densities. |

**Key insight:** Signature capture has many edge cases (touch events, pressure sensitivity, smooth curves, DPI scaling). signature_pad has solved these over 10+ years of development. Firestore aggregation is built for server-side totaling; client-side loops waste resources.

## Common Pitfalls

### Pitfall 1: Canvas Cleared on Window Resize
**What goes wrong:** User signs, window resizes (mobile orientation change), signature disappears
**Why it happens:** Canvas width/height modification automatically clears canvas content (HTML5 spec behavior)
**How to avoid:**
1. Save signature data before resize: `const data = signaturePad.toData();`
2. Resize canvas
3. Restore signature: `signaturePad.fromData(data);`
**Warning signs:** Mobile users report "signature disappearing" or "canvas goes blank"

### Pitfall 2: Forgetting devicePixelRatio Scaling
**What goes wrong:** Signatures look blurry/pixelated on retina/high-DPI displays
**Why it happens:** Canvas renders at CSS pixel size, not device pixel size (2x or 3x on retina)
**How to avoid:** Always scale canvas by devicePixelRatio and apply matching CSS transform
**Warning signs:** Signatures look sharp on desktop but fuzzy on MacBook/iPhone

### Pitfall 3: Modal Re-initialization Without Cleanup
**What goes wrong:** Multiple SignaturePad instances created, event listeners leak, memory grows
**Why it happens:** Opening approval modal multiple times without destroying previous instances
**How to avoid:**
```javascript
let signaturePad = null;

function openApprovalModal() {
    if (signaturePad) {
        signaturePad.off(); // Remove event listeners
    }
    signaturePad = initializeSignaturePad();
}

function closeApprovalModal() {
    if (signaturePad) {
        signaturePad.off();
        signaturePad = null;
    }
}
```
**Warning signs:** Browser DevTools shows increasing listener count, memory usage grows over time

### Pitfall 4: Base64 Data URL Size Limits
**What goes wrong:** Firestore write fails with "Document size exceeds 1MB limit"
**Why it happens:** Large canvas or high JPEG quality creates massive base64 strings
**How to avoid:**
- Keep signature canvas reasonable size (e.g., 400x150px, not 4000x1500px)
- Use JPEG with quality 0.7-0.8 instead of PNG: `toDataURL('image/jpeg', 0.8)`
- Consider storing signature in Firebase Storage for very large canvases (though not needed for typical signature sizes)
**Warning signs:** Firestore write errors mentioning document size

### Pitfall 5: Aggregation Query on Non-Indexed Fields
**What goes wrong:** Firestore aggregation query fails with "requires index" error
**Why it happens:** sum() and average() require indexed fields; Firestore auto-indexes single fields but may not index all fields
**How to avoid:**
- Firestore auto-indexes single fields like `total_amount` by default
- If error occurs, create composite index via Firebase Console (Firestore > Indexes)
- Test aggregation queries in development before deploying
**Warning signs:** Console error: "The query requires an index"

### Pitfall 6: Combining Aggregations on Different Fields Without All Documents Having Both
**What goes wrong:** Aggregation returns unexpectedly low totals
**Why it happens:** "If you combine aggregations that are on different fields, the calculation includes only the documents that contain all those fields" (Firebase docs)
**How to avoid:**
- Use separate aggregation queries if fields may be missing
- Or ensure all documents have required fields (even if null/0)
**Warning signs:** Sum totals lower than expected, count mismatches between queries

### Pitfall 7: Not Handling Empty Signature Before Approval
**What goes wrong:** POs created without signatures, defeating audit purpose
**Why it happens:** Forgot to validate isEmpty() before proceeding
**How to avoid:** Always check `if (signaturePad.isEmpty())` and show error before creating PO
**Warning signs:** PO documents with missing signature images

### Pitfall 8: Using Date.now() Instead of serverTimestamp()
**What goes wrong:** Timestamps vary based on user's clock; malicious users can forge dates
**Why it happens:** Client clocks can be incorrect (wrong timezone, manual adjustment, clock skew)
**How to avoid:** Use serverTimestamp() for audit fields (created_at, approved_at), keep legacy date fields for backward compatibility
**Warning signs:** Timestamps out of order, future dates in historical records

## Code Examples

Verified patterns from official sources:

### Complete Approval Modal with Signature Capture
```javascript
// Source: https://github.com/szimek/signature_pad + Phase 17 user attribution pattern

// Global variable for signature pad instance
let approvalSignaturePad = null;

/**
 * Open approval modal with signature capture
 */
async function viewPRDetails(prId) {
    // ... existing PR loading logic

    // Add signature canvas to modal HTML
    const modalFooter = document.getElementById('prModalFooter');
    modalFooter.innerHTML = `
        <div style="margin-bottom: 1rem;">
            <label style="display: block; margin-bottom: 0.5rem; font-weight: 600;">
                Finance Signature (Required)
            </label>
            <canvas id="approvalSignatureCanvas"
                    style="border: 1.5px solid #e2e8f0; border-radius: 8px; background: white;
                           width: 100%; max-width: 400px; height: 150px; cursor: crosshair;">
            </canvas>
            <button class="btn btn-secondary"
                    onclick="window.clearApprovalSignature()"
                    style="margin-top: 0.5rem;">
                Clear Signature
            </button>
        </div>
        <div style="display: flex; gap: 1rem;">
            <button class="btn btn-secondary" onclick="window.closePRModal()">Cancel</button>
            <button class="btn btn-primary" onclick="window.approvePRWithSignature('${prId}')">
                Approve & Generate PO
            </button>
        </div>
    `;

    // Initialize signature pad after DOM update
    requestAnimationFrame(() => {
        approvalSignaturePad = initializeApprovalSignaturePad();
    });
}

/**
 * Initialize signature pad with high-DPI support
 */
function initializeApprovalSignaturePad() {
    const canvas = document.getElementById('approvalSignatureCanvas');
    if (!canvas) return null;

    const signaturePad = new SignaturePad(canvas, {
        minWidth: 0.5,
        maxWidth: 2.5,
        penColor: 'rgb(0, 0, 0)',
        backgroundColor: 'rgb(255, 255, 255)',
        throttle: 16 // 60fps
    });

    // Handle high-DPI displays
    function resizeCanvas() {
        const ratio = Math.max(window.devicePixelRatio || 1, 1);
        const { width, height } = canvas.getBoundingClientRect();

        // Save signature data before resize
        const data = signaturePad.toData();

        canvas.width = width * ratio;
        canvas.height = height * ratio;
        canvas.getContext("2d").scale(ratio, ratio);

        // Restore signature after resize
        if (data && data.length > 0) {
            signaturePad.fromData(data);
        }
    }

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    return signaturePad;
}

/**
 * Clear signature canvas
 */
function clearApprovalSignature() {
    if (approvalSignaturePad) {
        approvalSignaturePad.clear();
    }
}
window.clearApprovalSignature = clearApprovalSignature;

/**
 * Approve PR with signature and create PO
 */
async function approvePRWithSignature(prId) {
    if (window.canEditTab?.('finance') === false) {
        showToast('You do not have permission to approve PRs', 'error');
        return;
    }

    const currentUser = window.getCurrentUser();
    if (!currentUser) {
        showToast('Session expired. Please log in again.', 'error');
        return;
    }

    // Validate signature
    if (!approvalSignaturePad || approvalSignaturePad.isEmpty()) {
        showToast('Please provide your signature before approving', 'error');
        return;
    }

    // Export signature as base64 PNG
    const signatureDataURL = approvalSignaturePad.toDataURL('image/png');

    showLoading(true);

    try {
        // Get PR document
        const prRef = doc(db, 'prs', prId);
        const prDoc = await getDoc(prRef);

        if (!prDoc.exists()) {
            throw new Error('PR not found');
        }

        const pr = prDoc.data();

        // Update PR status
        await updateDoc(prRef, {
            finance_status: 'Approved',
            finance_approver_user_id: currentUser.uid,
            finance_approver_name: currentUser.full_name || currentUser.email || 'Finance User',
            finance_approved_at: serverTimestamp(),
            date_approved: new Date().toISOString().split('T')[0] // Legacy compatibility
        });

        // Generate PO ID
        const posRef = collection(db, 'pos');
        const posSnapshot = await getDocs(posRef);
        let maxNum = 0;
        posSnapshot.forEach(docSnap => {
            const parts = docSnap.data().po_id.split('-');
            if (parts[1] === new Date().getFullYear().toString()) {
                maxNum = Math.max(maxNum, parseInt(parts[2]));
            }
        });
        const poId = `PO-${new Date().getFullYear()}-${String(maxNum + 1).padStart(3, '0')}`;

        // Create PO with signature
        await addDoc(posRef, {
            po_id: poId,
            pr_id: pr.pr_id,
            mrf_id: pr.mrf_id,
            project_name: pr.project_name,
            project_code: pr.project_code,
            supplier_name: pr.supplier_name,
            items_json: pr.items_json,
            total_amount: pr.total_amount,
            delivery_address: pr.delivery_address,
            procurement_status: 'Pending Procurement',
            is_subcon: false,
            finance_approver_user_id: currentUser.uid,
            finance_approver_name: currentUser.full_name || currentUser.email || 'Finance User',
            finance_signature_url: signatureDataURL, // Embedded base64 signature
            date_issued: serverTimestamp(),
            date_issued_legacy: new Date().toISOString().split('T')[0]
        });

        showToast(`PO ${poId} created successfully!`, 'success');

        // Refresh PR list and close modal (STAY on approvals tab)
        await refreshPRs();
        closePRModal();

    } catch (error) {
        console.error('Error approving PR:', error);
        showToast('Failed to approve PR: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}
window.approvePRWithSignature = approvePRWithSignature;

/**
 * Clean up signature pad when modal closes
 */
function closePRModal() {
    if (approvalSignaturePad) {
        approvalSignaturePad.off();
        approvalSignaturePad = null;
    }

    const modal = document.getElementById('prModal');
    modal?.classList.remove('active');
}
```

### Embedding Signature in PO Document
```javascript
// Source: Existing pattern from procurement.js:4898-4944

async function generatePODocument(poDocId) {
    // ... existing logic

    const po = poDoc.data();

    const documentData = {
        PO_ID: po.po_id,
        // ... other fields
        FINANCE_APPROVER: po.finance_approver_name || 'Finance Team',
        FINANCE_SIGNATURE_URL: po.finance_signature_url || '',
        // ... rest of fields
    };

    const html = generatePOHTML(documentData);
    openPrintWindow(html, documentData.PO_ID);
}

function generatePOHTML(data) {
    return `
        <!DOCTYPE html>
        <html>
        <head>
            <title>${data.PO_ID} - Purchase Order</title>
            <style>
                /* ... existing styles ... */
                .signature-section {
                    margin-top: 3rem;
                    display: flex;
                    justify-content: space-between;
                }
                .signature-box {
                    text-align: center;
                }
                .signature-box img {
                    max-width: 200px;
                    height: auto;
                    margin-bottom: 0.5rem;
                }
                .signature-line {
                    border-top: 1px solid #000;
                    width: 200px;
                    margin: 0 auto;
                }
            </style>
        </head>
        <body>
            <!-- ... existing PO content ... -->

            <div class="signature-section">
                <div class="signature-box">
                    <p><strong>Prepared by:</strong></p>
                    <p>${data.PROCUREMENT_PIC || 'Procurement Team'}</p>
                    <div class="signature-line"></div>
                </div>

                <div class="signature-box">
                    <p><strong>Approved by:</strong></p>
                    ${data.FINANCE_SIGNATURE_URL ?
                        `<img src="${data.FINANCE_SIGNATURE_URL}" alt="Finance Signature">`
                        : '<div style="height: 50px;"></div>'}
                    <p>${data.FINANCE_APPROVER}</p>
                    <div class="signature-line"></div>
                </div>
            </div>
        </body>
        </html>
    `;
}
```

### Project Expense Aggregation with Category Breakdown
```javascript
// Source: https://firebase.google.com/docs/firestore/query-data/aggregation-queries

/**
 * Calculate comprehensive project expenses
 */
async function refreshProjectExpenses() {
    showLoading(true);

    try {
        // Get all projects
        const projectsSnapshot = await getDocs(collection(db, 'projects'));
        const projectExpenses = [];

        for (const projectDoc of projectsSnapshot.docs) {
            const project = projectDoc.data();

            // Aggregate PO totals for this project
            const posQuery = query(
                collection(db, 'pos'),
                where('project_name', '==', project.project_name)
            );
            const posAgg = await getAggregateFromServer(posQuery, {
                totalExpense: sum('total_amount'),
                poCount: count()
            });

            // Aggregate Transport Request totals
            const trQuery = query(
                collection(db, 'transport_requests'),
                where('project_name', '==', project.project_name),
                where('finance_status', '==', 'Approved')
            );
            const trAgg = await getAggregateFromServer(trQuery, {
                transportTotal: sum('total_amount')
            });

            const totalExpense = (posAgg.data().totalExpense || 0) + (trAgg.data().transportTotal || 0);

            projectExpenses.push({
                projectCode: project.project_code || 'N/A',
                projectName: project.project_name,
                clientName: project.client_name || 'N/A',
                totalExpense: totalExpense,
                budget: project.budget || 0,
                remainingBudget: (project.budget || 0) - totalExpense,
                poCount: posAgg.data().poCount || 0,
                status: project.status || 'active'
            });
        }

        renderProjectExpensesTable(projectExpenses);

    } catch (error) {
        console.error('Error calculating project expenses:', error);
        showToast('Failed to calculate project expenses', 'error');
    } finally {
        showLoading(false);
    }
}

/**
 * Show expense breakdown modal with category details
 */
async function showProjectExpenseModal(projectName) {
    showLoading(true);

    try {
        // Material POs (non-subcon)
        const materialQuery = query(
            collection(db, 'pos'),
            where('project_name', '==', projectName),
            where('is_subcon', '==', false)
        );
        const materialAgg = await getAggregateFromServer(materialQuery, {
            materialTotal: sum('total_amount'),
            materialCount: count()
        });

        // Subcon POs
        const subconQuery = query(
            collection(db, 'pos'),
            where('project_name', '==', projectName),
            where('is_subcon', '==', true)
        );
        const subconAgg = await getAggregateFromServer(subconQuery, {
            subconTotal: sum('total_amount'),
            subconCount: count()
        });

        // Transport Requests
        const transportQuery = query(
            collection(db, 'transport_requests'),
            where('project_name', '==', projectName),
            where('finance_status', '==', 'Approved')
        );
        const transportAgg = await getAggregateFromServer(transportQuery, {
            transportTotal: sum('total_amount'),
            transportCount: count()
        });

        const expenses = {
            materials: materialAgg.data().materialTotal || 0,
            materialCount: materialAgg.data().materialCount || 0,
            transport: transportAgg.data().transportTotal || 0,
            transportCount: transportAgg.data().transportCount || 0,
            subcon: subconAgg.data().subconTotal || 0,
            subconCount: subconAgg.data().subconCount || 0,
            totalCost: (materialAgg.data().materialTotal || 0) +
                      (transportAgg.data().transportTotal || 0) +
                      (subconAgg.data().subconTotal || 0)
        };

        // Render modal with scorecards
        const modalBody = document.getElementById('projectExpenseModalBody');
        modalBody.innerHTML = `
            <div class="scorecards">
                <div class="scorecard">
                    <h3>Material Purchases</h3>
                    <p class="amount">₱${formatCurrency(expenses.materials)}</p>
                    <p class="count">${expenses.materialCount} POs</p>
                </div>
                <div class="scorecard">
                    <h3>Transport Fees</h3>
                    <p class="amount">₱${formatCurrency(expenses.transport)}</p>
                    <p class="count">${expenses.transportCount} TRs</p>
                </div>
                <div class="scorecard">
                    <h3>Subcon Cost</h3>
                    <p class="amount">₱${formatCurrency(expenses.subcon)}</p>
                    <p class="count">${expenses.subconCount} POs</p>
                </div>
                <div class="scorecard primary">
                    <h3>Total Project Cost</h3>
                    <p class="amount">₱${formatCurrency(expenses.totalCost)}</p>
                </div>
            </div>

            <!-- View switcher: Category / Materials / Transport -->
            <div class="view-switcher">
                <button class="active" onclick="window.showExpenseView('category')">Category</button>
                <button onclick="window.showExpenseView('materials')">Materials</button>
                <button onclick="window.showExpenseView('transport')">Transport</button>
            </div>

            <div id="expenseViewContent">
                <!-- Dynamic content based on selected view -->
            </div>
        `;

        document.getElementById('projectExpenseModal').classList.add('active');

    } catch (error) {
        console.error('Error loading project expense breakdown:', error);
        showToast('Failed to load expense breakdown', 'error');
    } finally {
        showLoading(false);
    }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| jsPDF programmatic generation | HTML template + Print to PDF | Already established in codebase (2024+) | Zero-dependency PDF generation, no CVE-2025-68428 vulnerability |
| Client-side loops for totals | getAggregateFromServer() | Added Nov 2023 in Firestore SDK | 1000x more efficient (1 read per 1000 entries vs 1 per document) |
| Manual user name entry | window.getCurrentUser() denormalization | Phase 15 (v2.2, Jan 2026) | Tamper-proof attribution, automatic population |
| Client Date.now() timestamps | serverTimestamp() | Phase 17 (v2.2, Jan 2026) | Clock-skew protection, millisecond precision |
| Auto-redirect after PO creation | Stay on current tab | Established router pattern (2024+) | Better UX for batch processing |

**Deprecated/outdated:**
- **jsPDF <4.0.0**: CVE-2025-68428 path traversal vulnerability (Jan 2026). Upgrade to 4.0.0+ if using jsPDF, but this codebase doesn't need it.
- **Manual aggregation loops**: Inefficient and expensive compared to getAggregateFromServer()
- **Freetext user fields**: Replaced by user_id + name denormalization for referential integrity

## Open Questions

Things that couldn't be fully resolved:

1. **Budget field in projects collection**
   - What we know: Success criteria #7 requires "Budget" and "Remaining Budget" columns
   - What's unclear: Does projects collection already have a `budget` field?
   - Recommendation: Check projects.js schema. If missing, add `budget` field (number) to project creation form and Firestore writes. Default to 0 for existing projects.

2. **Transport Request collection schema**
   - What we know: Success criteria #11 mentions "transport, delivery fees" in expense accounting
   - What's unclear: Is there a separate `transport_requests` collection or are TRs stored in `prs`?
   - Recommendation: Verify collection name with `getDocs(collection(db, 'transport_requests'))`. Adjust aggregation queries accordingly.

3. **Client Name field in projects**
   - What we know: Success criteria #7 requires "Client Name" in Project List table
   - What's unclear: Does projects collection have `client_name` field?
   - Recommendation: Check schema. If missing, add optional `client_name` field to project creation form.

4. **Historical Data tab removal timing**
   - What we know: Success criteria #6 requires removing Historical Data tab
   - What's unclear: Should this be replaced with anything, or just removed?
   - Recommendation: Remove tab navigation link and section from finance.js render() function. Keep Projects tab as replacement analytics view.

## Sources

### Primary (HIGH confidence)
- [signature_pad GitHub repository](https://github.com/szimek/signature_pad) - Official library documentation
- [Firebase Firestore aggregation queries](https://firebase.google.com/docs/firestore/query-data/aggregation-queries) - Official Firebase documentation
- [Google Cloud Firestore aggregation queries](https://docs.cloud.google.com/firestore/docs/query-data/aggregation-queries) - Detailed examples and billing
- CLAUDE.md - Project-specific patterns (denormalization, router behavior, document generation)

### Secondary (MEDIUM confidence)
- [Firestore sum and average guide (Medium)](https://nithinkvarrier.medium.com/sum-and-average-in-firestore-leverage-getaggregatefromserver-in-the-latest-update-november-2023-06fd10f92847) - Verified with official docs
- [Aggregate with SUM and AVG blog](https://cloud.google.com/blog/products/databases/aggregate-with-sum-and-avg-in-firestore) - Google Cloud official blog
- [jsPDF security advisory CVE-2025-68428](https://github.com/parallax/jsPDF/security/advisories/GHSA-f8cm-6447-x5h2) - Official security disclosure
- [Firebase timestamps best practices (Medium)](https://medium.com/@shuhan.chan08/firebase-timestamps-done-right-why-your-apps-time-logic-might-be-broken-25188c3b5b24) - Verified with Firebase docs

### Tertiary (LOW confidence)
- [10 Best Signature Pad Plugins (2026 Update)](https://www.jqueryscript.net/blog/best-signature-pad.html) - Community roundup, used for library comparison only
- [HTML5 canvas touch events guide](https://bencentra.com/code/2014/12/05/html5-canvas-touch-events.html) - Older but fundamental concepts haven't changed

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - signature_pad is industry standard (26k stars), Firestore aggregation is official Firebase API
- Architecture: HIGH - Patterns verified from official docs and existing codebase (procurement.js, Phase 15/17)
- Pitfalls: MEDIUM - Based on GitHub issues, community reports, and official documentation warnings
- Open questions: LOW - Schema fields need verification in actual codebase

**Research date:** 2026-02-07
**Valid until:** 2026-03-07 (30 days - stable APIs, mature libraries)
