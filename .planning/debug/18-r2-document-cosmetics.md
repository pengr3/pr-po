---
status: resolved
trigger: "Investigate two cosmetic UAT issues in document templates"
created: 2026-02-08T00:00:00Z
updated: 2026-02-08T00:00:00Z
---

## Current Focus

hypothesis: Both issues are cosmetic HTML/CSS changes in document generation functions
test: Located exact lines in procurement.js
expecting: Clear identification of problematic code and proposed fixes
next_action: Document findings and provide fix recommendations

## Symptoms

expected:
- PO "Approved by" section should be left-aligned
- PR "Prepared by" section should be inline text format "Prepared by: Francis Gerard Silva" with no underline

actual:
- PO "Approved by" section is right-aligned
- PR "Prepared by" section has separate label with underline and name on separate line below

errors: None (cosmetic issues only)

reproduction: Generate PO or PR documents and observe formatting

started: Existing behavior, user wants format changes

## Evidence

### Issue #1: PO "Approved by" Right-Alignment

**Location:** `app/views/procurement.js` line 4796

**Problematic Code:**
```javascript
// Line 4796 in generatePOHTML()
<div class="signature-section" style="justify-content: flex-end;">
    <div class="signature-box">
        <p class="sig-label">Approved by:</p>
        ${data.FINANCE_SIGNATURE_URL ? `
            <img src="${data.FINANCE_SIGNATURE_URL}" alt="Finance Signature">
        ` : `
            <div class="sig-placeholder"></div>
        `}
        <div class="sig-line"></div>
        <p>${data.FINANCE_APPROVER}</p>
    </div>
</div>
```

**Root Cause:** Inline style `style="justify-content: flex-end;"` on line 4796 overrides the default flexbox behavior, forcing content to right-align.

**CSS Context:** The `.signature-section` class is defined at lines 4718-4725:
```css
.signature-section {
    margin-top: 3rem;
    display: flex;
    justify-content: space-between;  /* Default in class */
    align-items: flex-end;
    padding: 0 2rem;
    page-break-inside: avoid;
}
```

The inline style `justify-content: flex-end` on line 4796 overrides the class default `justify-content: space-between`.

### Issue #2: PR "Prepared by" Format

**Location:** `app/views/procurement.js` lines 4570 and 4592-4597

**Two "Prepared by" instances found:**

1. **Line 4570** (In section fields - inline format, CORRECT):
```javascript
<div class="field"><span class="label">Prepared by:</span> ${data.PREPARED_BY}</div>
```

2. **Lines 4592-4597** (Bottom signature section - PROBLEMATIC):
```javascript
<div style="margin-top: 30px;">
    <div style="text-align: left; min-width: 200px; display: inline-block;">
        <p style="font-weight: bold; font-size: 10pt; margin-bottom: 0.5rem;">Prepared by:</p>
        <div style="border-top: 1px solid #000; width: 200px; margin: 0.5rem 0 0.25rem 0;"></div>
        <p style="margin: 0.25rem 0; font-size: 0.875rem;">${data.PREPARED_BY}</p>
    </div>
</div>
```

**Root Cause:** The bottom "Prepared by" section (lines 4592-4597) creates a signature-style format with:
- Separate paragraph for "Prepared by:" label (line 4594)
- Underline div with border-top (line 4595)
- Separate paragraph for the name (line 4596)

This duplicates the already-present inline format at line 4570 but with unnecessary signature styling.

## Resolution

### Issue #1 Fix: Remove inline style

**File:** `app/views/procurement.js`
**Line:** 4796

**Change:**
```javascript
// BEFORE (line 4796):
<div class="signature-section" style="justify-content: flex-end;">

// AFTER:
<div class="signature-section" style="justify-content: flex-start;">
```

**Rationale:** Changing `flex-end` to `flex-start` will left-align the "Approved by" box. Alternatively, could remove the inline style entirely and update the CSS class definition, but inline style change is simpler.

### Issue #2 Fix: Remove duplicate "Prepared by" section

**File:** `app/views/procurement.js`
**Lines:** 4592-4598

**Change:** Delete the entire bottom "Prepared by" section (lines 4592-4598):

```javascript
// BEFORE (lines 4588-4599):
<div style="margin-top: 40px; page-break-inside: avoid;">
    <div style="margin: 8px 0;">
        <span style="font-weight: bold; display: inline-block; width: 150px;">Requested By:</span> ${data.REQUESTOR}
    </div>
    <div style="margin-top: 30px;">
        <div style="text-align: left; min-width: 200px; display: inline-block;">
            <p style="font-weight: bold; font-size: 10pt; margin-bottom: 0.5rem;">Prepared by:</p>
            <div style="border-top: 1px solid #000; width: 200px; margin: 0.5rem 0 0.25rem 0;"></div>
            <p style="margin: 0.25rem 0; font-size: 0.875rem;">${data.PREPARED_BY}</p>
        </div>
    </div>
</div>

// AFTER (lines 4588-4591):
<div style="margin-top: 40px; page-break-inside: avoid;">
    <div style="margin: 8px 0;">
        <span style="font-weight: bold; display: inline-block; width: 150px;">Requested By:</span> ${data.REQUESTOR}
    </div>
</div>
```

**Rationale:** The "Prepared by" information is already displayed inline at line 4570 in the correct format. The bottom section creates redundant signature-style formatting that the user wants removed. Keep only the "Requested By" field in the bottom section.

## Verification Plan

1. Apply both fixes to `app/views/procurement.js`
2. Generate a PO document - verify "Approved by" is left-aligned
3. Generate a PR document - verify only one inline "Prepared by" appears (no underline, no separate name line)
4. Check print preview to ensure formatting looks correct on paper

## Files Changed

- `app/views/procurement.js`: Lines 4796 (Issue #1) and 4592-4598 (Issue #2)
