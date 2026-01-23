# External Integrations

**Analysis Date:** 2026-01-23

## APIs & External Services

**Firebase:**
- Google Firebase Platform - Backend-as-a-Service
  - SDK/Client: Firebase JavaScript SDK v10.7.1 (CDN)
  - Auth: Hardcoded client configuration in `app/firebase.js`
  - Purpose: Real-time database, data persistence, cloud storage
  - Config location: `app/firebase.js` lines 28-35

## Data Storage

**Databases:**
- Firebase Firestore (NoSQL document database)
  - Connection: Direct client-side connection via Firebase SDK
  - Client: Native Firestore modular SDK (v10.7.1)
  - Project: `clmc-procurement`
  - Collections: `mrfs`, `prs`, `pos`, `transport_requests`, `suppliers`, `projects`, `deleted_mrfs`
  - Real-time listeners: `onSnapshot()` for live data updates

**File Storage:**
- None - No file upload or cloud storage integration
- Static assets served directly from repository

**Caching:**
- Browser caching only via HTTP headers
  - HTML: no-cache, must-revalidate
  - CSS/JS: 1 year immutable cache
  - Images/Fonts: 1 year immutable cache
  - Configuration: `_headers`, `netlify.toml`, `.htaccess`, `nginx-headers.conf`

## Authentication & Identity

**Auth Provider:**
- None - No authentication system implemented
  - No user login/logout
  - No access control
  - Public access to all features

## Monitoring & Observability

**Error Tracking:**
- None - No Sentry, Rollbar, or error tracking service

**Logs:**
- Browser console.log statements only
  - Router logs: `[Router]` prefix
  - Procurement logs: `[Procurement]` prefix
  - Firebase logs: "Firebase initialized successfully"

## CI/CD & Deployment

**Hosting:**
- Netlify (static site hosting)
  - Auto-deploy on git push
  - Configuration: `netlify.toml`
  - Security headers: `_headers` file

**CI Pipeline:**
- None - No automated testing or build pipeline
  - Direct deployment of source files
  - No GitHub Actions, CircleCI, or similar

## Environment Configuration

**Required env vars:**
- None - All configuration is hardcoded

**Secrets location:**
- Firebase config exposed in client code (`app/firebase.js`)
  - apiKey: `AIzaSyAlHcmPmkCk6CKsRbfpHpCheHb2GcLz0Oc`
  - authDomain: `clmc-procurement.firebaseapp.com`
  - projectId: `clmc-procurement`
  - storageBucket: `clmc-procurement.firebasestorage.app`
  - Note: Client-side Firebase configs are safe to expose publicly

## Webhooks & Callbacks

**Incoming:**
- None - No webhook endpoints

**Outgoing:**
- None - No external API calls or webhooks

---

*Integration audit: 2026-01-23*
