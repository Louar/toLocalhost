/**
 * A static OAuth callback bridge for GitHub Pages.
 *
 * Register the GitHub Pages URL as your OAuth redirect URI. Configure the
 * desired local destination once on this page; subsequent OAuth responses
 * are forwarded by the browser. This uses only client-side navigation.
 *
 * Security: destinations are deliberately restricted to loopback hosts.
 */
const DEFAULT_SETTINGS = {
    protocol: 'http:',
    host: 'localhost',
    port: 3000,
    path: '/',
    externalPath: '/',
};
const ALLOWED_HOSTS = new Set([
    'localhost',
    '127.0.0.1',
    '[::1]',
]);
/** Reject dangerous or malformed destinations, including non-loopback hosts. */
export function validateSettings(value) {
    if (!value || typeof value !== 'object') {
        throw new Error('Invalid redirect settings.');
    }
    const candidate = value;
    const { protocol, host, port, path } = candidate;
    // Settings saved before external paths were supported used the page root.
    const externalPath = candidate.externalPath ?? '/';
    if (protocol !== 'http:' && protocol !== 'https:') {
        throw new Error('Choose HTTP or HTTPS.');
    }
    if (typeof host !== 'string' || !ALLOWED_HOSTS.has(host)) {
        throw new Error('Only localhost and loopback IP addresses are allowed.');
    }
    if (typeof port !== 'number' || !Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error('Enter a port between 1 and 65535.');
    }
    if (typeof path !== 'string' ||
        !path.startsWith('/') ||
        path.startsWith('//') ||
        /[?#\\\u0000-\u001f\u007f]/.test(path)) {
        throw new Error('Enter a local path starting with /, without ? or #.');
    }
    if (typeof externalPath !== 'string' ||
        !externalPath.startsWith('/') ||
        externalPath.startsWith('//') ||
        /[?#\\\u0000-\u001f\u007f]/.test(externalPath)) {
        throw new Error('Enter an external path starting with /, without ? or #.');
    }
    return {
        protocol,
        host: host,
        port,
        path,
        externalPath,
    };
}
/** Keep the incoming OAuth query and fragment exactly as supplied. */
export function buildLocalUrl(incoming, settings) {
    const { protocol, host, port, path } = validateSettings(settings);
    const target = new URL(`${protocol}//${host}:${port}/`);
    target.pathname = path;
    target.search = incoming.search;
    target.hash = incoming.hash;
    return target;
}
/** Any query or hash at this dedicated callback URL may be an OAuth response. */
export function hasCallbackData(incoming) {
    return incoming.search.length > 0 || incoming.hash.length > 0;
}
function buildExternalCallbackUrl(settings, appUrl) {
    const callbackUrl = new URL(settings.externalPath.slice(1), appUrl);
    if (!callbackUrl.pathname.startsWith(appUrl.pathname)) {
        throw new Error('The external path must stay within this GitHub Pages site.');
    }
    return callbackUrl;
}
function initializePage() {
    const appUrl = new URL('.', import.meta.url);
    // Including the app pathname prevents settings from colliding across
    // repositories hosted on the same username.github.io origin.
    const storageKey = `oauth-to-localhost:v1:${appUrl.pathname}`;
    const incoming = new URL(window.location.href);
    function loadSettings() {
        try {
            const stored = window.localStorage.getItem(storageKey);
            if (!stored) return null;
            const settings = validateSettings(JSON.parse(stored));
            buildExternalCallbackUrl(settings, appUrl);
            return settings;
        }
        catch {
            return null;
        }
    }
    const saved = loadSettings();
    const savedCallbackUrl = saved
        ? buildExternalCallbackUrl(saved, appUrl)
        : null;
    if (savedCallbackUrl &&
        incoming.pathname === savedCallbackUrl.pathname &&
        hasCallbackData(incoming)) {
        window.location.replace(buildLocalUrl(incoming, saved).href);
        return;
    }
    const form = document.querySelector('#settings-form');
    const protocolInput = document.querySelector('#protocol');
    const hostInput = document.querySelector('#host');
    const portInput = document.querySelector('#port');
    const pathInput = document.querySelector('#path');
    const externalPathInput = document.querySelector('#external-path');
    const publicUrl = document.querySelector('#public-url');
    const localUrl = document.querySelector('#local-url');
    const status = document.querySelector('#status');
    const disableButton = document.querySelector('#disable');
    const cancelButton = document.querySelector('#cancel');
    const copyButton = document.querySelector('#copy-url');
    let callbackUrl;
    let redirectTimer;
    function setStatus(message, kind = 'normal') {
        status.className = `status ${kind}`;
        status.textContent = message;
    }
    function populateForm(settings) {
        protocolInput.value = settings.protocol;
        hostInput.value = settings.host;
        portInput.value = String(settings.port);
        pathInput.value = settings.path;
        externalPathInput.value = settings.externalPath;
        updatePreview();
    }
    function readForm() {
        const portString = portInput.value.trim();
        const settings = validateSettings({
            protocol: protocolInput.value,
            host: hostInput.value,
            port: /^\d+$/.test(portString) ? Number(portString) : NaN,
            path: pathInput.value.trim(),
            externalPath: externalPathInput.value.trim(),
        });
        buildExternalCallbackUrl(settings, appUrl);
        return settings;
    }
    function updatePreview() {
        try {
            const settings = readForm();
            callbackUrl = buildExternalCallbackUrl(settings, appUrl).href;
            const target = buildLocalUrl(new URL(callbackUrl), settings);
            localUrl.textContent = target.origin + target.pathname;
            publicUrl.textContent = callbackUrl;
        }
        catch {
            localUrl.textContent = 'Enter a valid local destination.';
        }
    }
    function cancelRedirect() {
        if (redirectTimer !== undefined) {
            window.clearTimeout(redirectTimer);
            redirectTimer = undefined;
            cancelButton.hidden = true;
            setStatus('Redirect paused. Update the destination or click Save and enable.', 'warning');
        }
    }
    function forward(settings) {
        const target = buildLocalUrl(incoming, settings);
        cancelRedirect();
        // Never print authorization codes, tokens, or state values on the page.
        setStatus(`Forwarding to ${target.origin}${target.pathname}…`, 'success');
        cancelButton.hidden = false;
        redirectTimer = window.setTimeout(() => {
            // replace() avoids trapping the Back button on the callback page.
            window.location.replace(target.href);
        }, 900);
    }
    callbackUrl = buildExternalCallbackUrl(saved ?? DEFAULT_SETTINGS, appUrl).href;
    populateForm(saved ?? DEFAULT_SETTINGS);
    disableButton.hidden = saved === null;
    cancelButton.hidden = true;
    if (saved) {
        setStatus('Forwarding is enabled. Start your OAuth flow using the callback URL above.', 'success');
    }
    else if (hasCallbackData(incoming)) {
        setStatus('An OAuth response arrived. Save and enable a local destination to forward it.', 'warning');
    }
    else {
        setStatus('Configure a destination and enable forwarding before you start OAuth.');
    }
    form.addEventListener('input', () => {
        cancelRedirect();
        updatePreview();
    });
    form.addEventListener('submit', (event) => {
        event.preventDefault();
        cancelRedirect();
        try {
            const settings = readForm();
            window.localStorage.setItem(storageKey, JSON.stringify(settings));
            disableButton.hidden = false;
            if (incoming.pathname === buildExternalCallbackUrl(settings, appUrl).pathname &&
                hasCallbackData(incoming)) {
                forward(settings);
            }
            else {
                setStatus('Forwarding enabled. You can now begin the OAuth flow.', 'success');
            }
        }
        catch (error) {
            setStatus(error instanceof Error ? error.message : 'Could not save settings.', 'error');
        }
    });
    disableButton.addEventListener('click', () => {
        cancelRedirect();
        try {
            window.localStorage.removeItem(storageKey);
            disableButton.hidden = true;
            setStatus('Forwarding disabled.', 'normal');
        }
        catch {
            setStatus('Could not access browser storage.', 'error');
        }
    });
    cancelButton.addEventListener('click', cancelRedirect);
    copyButton.addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(callbackUrl);
            setStatus('Callback URL copied.', 'success');
        }
        catch {
            setStatus('Could not copy automatically. Select and copy the URL above.', 'warning');
        }
    });
}
// A module script runs after the document has been parsed.
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    initializePage();
}
