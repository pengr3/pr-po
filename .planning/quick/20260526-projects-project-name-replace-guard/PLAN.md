---
slug: projects-project-name-replace-guard
date: 2026-05-26
status: in-progress
---

# Guard project.project_name.replace() in renderProjectsTable

## Problem
`projects.js:955` calls `project.project_name.replace(/'/g, "\\'")` inside the delete button
`onclick` attribute with no null guard. If any Firestore document in `projects` is missing
`project_name`, the entire `renderProjectsTable` map() throws:

> TypeError: Cannot read properties of undefined (reading 'replace')

This crashes the `#/Projects` view completely.

## Fix
Replace the bare field access with a null-safe expression:

```js
// Before
'${project.project_name.replace(/'/g, "\\'")}'

// After
'${(project.project_name || '').replace(/'/g, "\\'")}'
```

## File
`app/views/projects.js` line 955
