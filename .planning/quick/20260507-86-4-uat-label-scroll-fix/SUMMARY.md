---
slug: 86-4-uat-label-scroll-fix
status: complete
commit: f206966
---

Fixed 3 Phase 86.4 UAT failures:
1. Labels: mode was compared as object (gantt.config.view_mode={name:...}) instead of string (gantt.options.view_mode). Now uses options string. Also switched from SVG injection to HTML span injection into .lower-header.
2. Scroll sync: was listening on .gantt-pane; actual scroll container is .gantt-container. Fixed element reference in bindScrollSync() and destroy().
