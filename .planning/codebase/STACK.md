# Technology Stack

**Analysis Date:** 2026-01-23

## Languages

**Primary:**
- JavaScript ES6 - Client-side application logic (modules in `app/` directory)
- HTML5 - Single page entry point (`index.html`)
- CSS3 - Styling across multiple files (`styles/` directory)

**Secondary:**
- None - Pure frontend application with no backend processing

## Runtime

**Environment:**
- Browser (modern browsers with ES6 module support)
- No server-side runtime required

**Package Manager:**
- None - Zero-build static website with no package.json
- No npm, yarn, or other package managers

## Frameworks

**Core:**
- None - Pure JavaScript ES6 modules with no framework dependencies
- Custom hash-based SPA router (`app/router.js`)
- Native ES6 module system for code organization

**Testing:**
- None - No automated test framework exists
- Manual testing workflow only

**Build/Dev:**
- None - No build system, bundler, or transpilation
- Local development servers:
  - Python: `python -m http.server 8000`
  - Node: `npx http-server`
- Direct file serving with no compilation step

## Key Dependencies

**Critical:**
- Firebase JavaScript SDK v10.7.1 - Database and real-time data
  - Loaded via CDN: `https://www.gstatic.com/firebasejs/10.7.1/`
  - Modules: `firebase-app.js`, `firebase-firestore.js`
  - No local installation - imported directly in browser

**Infrastructure:**
- None - All dependencies loaded via CDN

## Configuration

**Environment:**
- No environment variables or .env files
- Firebase configuration hardcoded in `app/firebase.js` (client-safe config)
- Project ID: `clmc-procurement`

**Build:**
- No build configuration files
- No webpack, vite, rollup, or other bundlers
- Files deployed directly as authored

## Platform Requirements

**Development:**
- Modern browser with ES6 module support
- Local HTTP server (Python or Node.js optional for testing)
- No Node.js, npm, or build tools required

**Production:**
- Static file hosting (Netlify)
- Automatic deployment on git push
- No server-side processing or API endpoints

---

*Stack analysis: 2026-01-23*
