---
slug: 86-4-gantt-header-overlay
status: complete
commit: 8af0c04
---

Replaced renderGanttHeaderLabels() with renderCustomGanttHeader() + _bindOverlayScrollSync().
Overlay (#ganttHeaderOverlay) appended inside #ganttPane, position:absolute, z-index:20, height = gantt.config.header_height.
Three modes: Day (date+letter per column), Week (date label + MTWTFSS sub-row), Month (Mon YYYY per column).
Frappe .upper-header/.lower-header hidden via display:none after every render.
Horizontal scroll synced via _overlayScrollHandler (translateX on .gho-inner).
Cleanup wired into destroy(). CSS: removed old .gantt-custom-label rules, added gho-* styles.
