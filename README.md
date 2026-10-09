# OAuth to localhost via GitHub Pages

A small, dependency-free static website that forwards OAuth callbacks from an
HTTPS GitHub Pages URL to your local development server. It preserves both the
original query string (including `code` and `state`) and hash fragment.

## Deploy

1. Create a GitHub repository (e.g. `oauth-to-localhost`).
2. Commit `index.html` and `redirect.js` to its root.
3. Under **Settings → Pages**, select **Deploy from a branch → main → /(root)**.
4. Visit `https://YOUR-USERNAME.github.io/oauth-to-localhost/`.
5. Set the host, port, and callback path of your local app, then click
   **Save and enable**. Your settings stay in this browser's localStorage.
6. Register the exact HTTPS URL shown on the page as an authorized OAuth
   redirect URI, and use that same URL as `redirect_uri` in the authorization
   request (and in any token request that requires `redirect_uri`).

## Example

Public registered OAuth callback:

    https://YOUR-USERNAME.github.io/oauth-to-localhost/

Saved local destination:

    http://localhost:5173/auth/callback

When the OAuth provider navigates the browser to:

    https://YOUR-USERNAME.github.io/oauth-to-localhost/?code=abc123&state=xyz

The page redirects it to:

    http://localhost:5173/auth/callback?code=abc123&state=xyz

The same works for fragment callbacks (e.g. `#access_token=...`).

If the bridge has not been enabled in the current browser, it displays the
settings form and lets you enable forwarding of the current callback.

## Important limitations

- This is a *client-side browser redirect*, not an HTTP 302 response or a proxy.
- Works for front-channel OAuth callbacks with query or fragment parameters;
  **not** `response_mode=form_post`, API webhooks, or server-to-server requests.
- The OAuth provider must allow your GitHub Pages HTTPS callback URL. Some
  providers disallow particular domains or have other restrictions.
- Use the public callback URL consistently in the OAuth authorization and code
  redemption steps if the provider validates redirect URI equality.
- Use OAuth `state` validation and PKCE. GitHub Pages receives the initial
  callback URL, including any authorization code, before forwarding it; avoid
  this design for sensitive production flows. Do not forward tokens to remote
  or user-supplied hosts; this implementation permits only loopback targets.
- If you clear site storage, use a new browser profile, or enter a new device,
  enable forwarding again. The local server must be running in the browser's
  own environment.
