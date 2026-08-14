const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');

const root = join(__dirname, '..', '..');

test('the legacy driver never falls back to a shared private key', () => {
  const source = readFileSync(join(root, 'public', 'driver-app.js'), 'utf8');
  assert.doesNotMatch(source, /DEMO_DRIVER_PRIVKEY/);
  assert.match(source, /Driver identity unavailable/);
  assert.match(source, /removeItem\(DRIVER_PRIV_STORAGE_KEY\)/);
});

test('the web runtime contains no restricted React Leaflet wrapper', () => {
  const manifest = readFileSync(join(root, 'web', 'package.json'), 'utf8');
  const lockfile = readFileSync(join(root, 'web', 'package-lock.json'), 'utf8');
  assert.doesNotMatch(manifest, /react-leaflet/);
  assert.doesNotMatch(lockfile, /Hippocratic-2\.1/);
});

test('the public license links resolve to shipped files', () => {
  const readme = readFileSync(join(root, 'README.md'), 'utf8');
  assert.match(readme, /\[LICENSE\]\(\.\/LICENSE\)/);
  assert.match(readme, /\[THIRD_PARTY_NOTICES\]\(\.\/THIRD_PARTY_NOTICES\.md\)/);
  assert.ok(readFileSync(join(root, 'LICENSE'), 'utf8').startsWith('MIT License'));
  assert.match(readFileSync(join(root, 'THIRD_PARTY_NOTICES.md'), 'utf8'), /Leaflet 1\.9\.4/);
});
