const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { mkdtemp, readFile, rm, writeFile } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { test } = require('node:test');

test('driver release metadata describes the exact signed artifact', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'donkeyride-driver-release-'));
  try {
    const apk = join(directory, 'donkeyride-driver-1.0.3.apk');
    const payload = Buffer.from('test APK bytes, not a real package');
    await writeFile(apk, payload);
    const { writeDriverReleaseMetadata } = await import('../../scripts/write-driver-release-metadata.mjs');

    const metadata = await writeDriverReleaseMetadata({
      outputDir: directory,
      apkPath: apk,
      version: '1.0.3',
      versionCode: 4,
      certificateSha256: 'ab'.repeat(32),
      sourceCommit: 'c'.repeat(40),
    });
    const expectedHash = createHash('sha256').update(payload).digest('hex');

    assert.equal(metadata.android.sha256, expectedHash);
    assert.equal(metadata.android.bytes, payload.length);
    assert.equal(metadata.android.url, `/downloads/donkeyride-driver-1.0.3.apk?sha256=${expectedHash.slice(0, 16)}`);
    assert.equal(metadata.android.certificateSha256, 'ab'.repeat(32));
    assert.equal(metadata.android.sourceCommit, 'c'.repeat(40));
    assert.equal(
      await readFile(join(directory, 'donkeyride-driver-1.0.3.apk.sha256'), 'utf8'),
      `${expectedHash}\n`,
    );
    assert.deepEqual(
      JSON.parse(await readFile(join(directory, 'driver-app.json'), 'utf8')),
      metadata,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
