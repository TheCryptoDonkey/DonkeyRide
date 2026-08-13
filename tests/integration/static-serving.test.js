/**
 * What the operator serves for a file it does not have.
 *
 * The SPA catch-all existed to make client-side routing work: any path that
 * is not an API route gets the React shell. It skipped four extensions
 * (.html, .js, .css, .map) and served the shell for everything else — so a
 * request for a file the operator had never built was answered
 * 200 text/html with the rider app inside it.
 *
 * That was not theoretical. `/download.html` advertised
 * "Download the app (5 MB)" pointing at
 * /downloads/donkeyride-driver-1.0.apk. No operator in this repo has ever
 * built that file. A driver tapping the button on their phone downloaded a
 * 1 KB HTML page wearing an .apk name, which Android refuses to install with
 * no useful explanation. The same hole swallowed every missing icon,
 * webmanifest and font: a 404 that answers 200 cannot be seen in a log or a
 * browser console.
 *
 * Proves:
 *   - a missing FILE 404s rather than impersonating the app
 *   - real SPA routes still get their shell (rider and driver are separate)
 *   - /api/driver-app reports honestly when no build is published
 */

process.env.DISABLE_REDIS = 'true';
process.env.PAYMENT_PROVIDER = 'demo';
process.env.ENABLE_RATE_LIMITING = 'false';
process.env.ENABLE_NIP98_AUTH = 'false';
require('../helpers/isolate-relays');
const WS_PORT = 54200 + Math.floor(Math.random() * 300);
process.env.WS_PORT = String(WS_PORT);

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { app, startServer, getWss } = require('../../server.js');

const DOWNLOADS_DIR = path.join(__dirname, '..', '..', 'public', 'downloads');
const REACT_BUILD = path.join(__dirname, '..', '..', 'web', 'dist');

let server;
let baseUrl;

before(async () => {
  await startServer({ listen: false });
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.close();
  const wss = getWss();
  if (wss) {
    wss.clients.forEach((client) => client.terminate());
    wss.close();
  }
});

test('a file the operator does not have 404s instead of returning the app', async () => {
  // A build this operator does not publish. Deliberately NOT the filename the
  // page used to hardcode (donkeyride-driver-1.0.apk): an operator who has
  // run scripts/publish-driver-apk.sh really does serve that one, and this
  // test is about the absent case.
  const res = await fetch(`${baseUrl}/downloads/donkeyride-driver-0.0-nonexistent.apk`);

  assert.equal(res.status, 404, 'a missing APK must 404');
  const body = await res.text();
  assert.ok(
    !/<div id="root">/.test(body),
    'the rider shell must never be served under a file name'
  );
});

test('missing assets of any type 404 — the old denylist covered four extensions', async () => {
  for (const missing of [
    '/icons/does-not-exist-192.png',
    '/manifest-nonexistent.webmanifest',
    '/fonts/absent.woff2',
    '/downloads/whatever.apk'
  ]) {
    const res = await fetch(`${baseUrl}${missing}`);
    assert.equal(res.status, 404, `${missing} should 404`);
    assert.ok(
      !(res.headers.get('content-type') || '').includes('text/html'),
      `${missing} must not be answered with an HTML page`
    );
  }
});

test('real SPA routes still get their shell, rider and driver kept apart', async (t) => {
  if (!fs.existsSync(path.join(REACT_BUILD, 'index.html'))) {
    t.skip('web/dist not built — run npm run web:build');
    return;
  }

  // Extension-less paths are page navigations and must still resolve.
  for (const route of ['/request/history', '/provide/earnings', '/request/profile']) {
    const res = await fetch(`${baseUrl}${route}`);
    assert.equal(res.status, 200, `${route} should serve a shell`);
    assert.ok(
      (res.headers.get('content-type') || '').includes('text/html'),
      `${route} should be HTML`
    );
  }

  if (fs.existsSync(path.join(REACT_BUILD, 'driver.html'))) {
    const driver = await fetch(`${baseUrl}/provide`).then((r) => r.text());
    const rider = await fetch(`${baseUrl}/request`).then((r) => r.text());
    assert.notEqual(
      driver,
      rider,
      'the driver path must get the driver shell, not the rider one'
    );
  }
});

test('/driver.html serves the React driver shell, not the retired console', async (t) => {
  if (!fs.existsSync(path.join(REACT_BUILD, 'driver.html'))) {
    t.skip('web/dist not built — run npm run web:build');
    return;
  }
  // express.static('public') is mounted before the React build, so a legacy
  // public/driver.html shadowed the driver app's own shell: /driver.html
  // served a retired vanilla console instead. Nothing linked to it, but it is
  // a plausible URL to type and the page it returned still spoke to APIs that
  // have since moved. The legacy pair now lives under legacy-*.html.
  const res = await fetch(`${baseUrl}/driver.html`);
  assert.equal(res.status, 200);
  const body = await res.text();

  assert.ok(
    body.includes('<div id="root">'),
    '/driver.html must serve the React shell'
  );
  assert.ok(
    !/DonkeyRide Driver Console/.test(body),
    'the retired vanilla console must not be served at /driver.html'
  );
});

test('/api/driver-app tells the truth about what is published', async () => {
  const res = await fetch(`${baseUrl}/api/driver-app`);
  assert.equal(res.status, 200);
  const body = await res.json();

  assert.equal(body.webApp, '/provide', 'the browser app is always an answer');
  assert.ok(body.android, 'the android key is always present');

  // Whatever this checkout happens to hold, the report must match the disk —
  // the page renders straight from it, and a confident button for a file
  // that is not there is the bug this endpoint exists to prevent.
  const apks = fs.existsSync(DOWNLOADS_DIR)
    ? fs.readdirSync(DOWNLOADS_DIR).filter((n) => n.endsWith('.apk'))
    : [];

  assert.equal(
    body.android.available,
    apks.length > 0,
    'availability must reflect the downloads directory'
  );

  if (!body.android.available) {
    assert.ok(!body.android.url, 'an unavailable build offers no download URL');
  } else {
    assert.ok(body.android.url.startsWith('/downloads/'));
    assert.ok(body.android.bytes > 0, 'a published build reports its real size');
    if (/^[0-9a-f]{64}$/i.test(body.android.sha256 || '')) {
      assert.ok(
        body.android.url.includes(`?sha256=${body.android.sha256.slice(0, 16).toLowerCase()}`),
        'a checksummed build uses a content-derived CDN cache key'
      );
    }
    // The link it advertises must actually be fetchable.
    const dl = await fetch(`${baseUrl}${body.android.url}`);
    assert.equal(dl.status, 200, 'the advertised build must download');
  }
});
