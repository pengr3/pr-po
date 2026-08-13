# HTTP Headers Configuration

This repository includes proper HTTP security and caching headers to fix all browser console warnings.

## What Was Fixed

✅ **Security Issues:**
- Added `X-Content-Type-Options: nosniff` header (prevents MIME sniffing attacks)
- Added modern `Content-Security-Policy` with `frame-ancestors` directive
- Removed deprecated headers: `X-XSS-Protection`, `X-Frame-Options`, `Expires`

✅ **Performance Issues:**
- Added proper `Cache-Control` headers for all file types
- HTML files: `no-cache, must-revalidate` (always fresh)
- Static assets (CSS, JS, images, fonts): `max-age=31536000, immutable` (1 year cache)
- Removed conflicting `no-store` directive

## Which File to Use?

Choose the configuration file based on your hosting platform:

### Apache Server
Use `.htaccess` (already in root directory)
- No additional setup needed
- Works automatically when deployed

### Netlify
Use either:
- `_headers` file (simpler, works immediately)
- `netlify.toml` (more flexible, recommended)

Both files are included. Netlify will use whichever you prefer.

### Cloudflare Pages
Use `_headers` file (already in root directory)

### Nginx
Use `nginx-headers.conf`:
```nginx
server {
    include /path/to/nginx-headers.conf;
    # ... rest of your config
}
```

### GitHub Pages
GitHub Pages has limited header customization. Consider:
1. Migrating to Netlify (free tier available)
2. Or use Cloudflare Pages (also free)

### Python SimpleHTTPServer / http.server
These basic servers don't support custom headers. Use instead:
```bash
# Install a better server
npm install -g http-server

# Run with proper headers (using .htaccess-like behavior)
http-server -c 3600
```

## Testing

After deploying, verify the headers are working:

1. Open your site in Chrome/Firefox
2. Open DevTools (F12)
3. Go to Network tab
4. Reload the page
5. Click on `finance.html`
6. Check "Headers" section - you should see:
   - `cache-control: no-cache, must-revalidate, max-age=0`
   - `x-content-type-options: nosniff`
   - `content-security-policy: frame-ancestors 'self'`
   - No `x-xss-protection` or `x-frame-options`

7. Click on any .css or .js file - you should see:
   - `cache-control: public, max-age=31536000, immutable`

## Verifying Sentry / CSP Changes

Both procedures below must be re-run after every deploy that touches CSP. A CSP-blocked
`connect-src` request throws no catchable JavaScript error — the app behaves perfectly, the
console stays clean, and the Sentry dashboard shows zero events, which is indistinguishable from
a healthy, quiet application.

### (a) Read back the live policy

1. Read the `/*` block's live policy:
   ```bash
   curl -sI https://clmcop.netlify.app/ | grep -i content-security-policy
   ```
2. Read the `/*.html` block's live policy (this exercises the second occurrence — the reason
   there are four CSP occurrences across the two files, not two):
   ```bash
   curl -sI https://clmcop.netlify.app/index.html | grep -i content-security-policy
   ```
3. **Expected outcome:** both responses' `content-security-policy` header contains the Sentry
   ingest host inside `connect-src` (`https://o4511903390236672.ingest.us.sentry.io`), and the
   two responses' policies match each other.
4. **Precedence note:** `_headers` and `netlify.toml` are kept byte-identical, so this command
   cannot tell you *which* file Netlify actually served — and that is the point. If the two
   files ever diverge, this command is what tells you which one won, and the answer must then be
   recorded here.

This procedure pairs with `window.__sentryTest()` (registered in `app/sentry-init.js`), the
production probe that fires a real event through the ingest endpoint this procedure just
confirmed is unblocked. Run `window.__sentryTest()` from DevTools on the production site to close
the loop; the full production test-event checkpoint lives in the phase 114 plan record, not here.

### (b) Simulate a blocked bundle (OBS-03)

1. Open the production site, press F12, and go to the Network tab.
2. Reload the page.
3. Right-click the `obs.min.js` request and choose **Block request URL**.
4. Hard-reload with Ctrl+Shift+R.
5. **Expected outcome:**
   - Every view still renders normally.
   - A real write (e.g., saving an MRF) still succeeds.
   - The console shows exactly one `[Sentry] SDK unavailable — error reporting disabled for this
     session` warning and no uncaught errors.
   - `window.Sentry` is `undefined`.
6. Remove the block rule afterward: Network tab → the blocking pane → delete the pattern for
   `obs.min.js`, so your own browser doesn't stay permanently unreported.

## Console Errors - Before vs After

### Before (Warnings):
```
❌ Error: 'cache-control' header is missing or empty
❌ Warning: 'no-store' directive not recommended
❌ Warning: Unneeded 'x-xss-protection' header
❌ Warning: Missing 'immutable' directive
❌ Error: Missing 'x-content-type-options'
❌ Warning: Using deprecated 'Expires' header
❌ Warning: Using deprecated 'X-Frame-Options'
```

### After (Clean):
```
✅ All headers properly configured
✅ No warnings or errors
✅ Improved security and performance
```

## Benefits

1. **Security**: Protection against MIME sniffing and clickjacking attacks
2. **Performance**: Faster page loads with proper caching
3. **Best Practices**: Modern, standards-compliant headers
4. **Compliance**: Better scores on security audits

## Need Help?

If warnings persist:
1. Verify which hosting platform you're using
2. Confirm the correct config file is being read
3. Clear your browser cache (Ctrl+Shift+Delete)
4. Check server logs for configuration errors
