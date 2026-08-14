#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const SHA256 = /^[a-f0-9]{64}$/;

export async function writeDriverReleaseMetadata({
  outputDir,
  apkPath,
  version,
  versionCode,
  certificateSha256,
  sourceCommit,
}) {
  if (!version || !/^[0-9A-Za-z._-]+$/.test(version)) throw new Error('invalid version');
  if (!Number.isSafeInteger(Number(versionCode)) || Number(versionCode) < 1) {
    throw new Error('invalid versionCode');
  }
  const certificate = String(certificateSha256 || '').toLowerCase();
  if (!SHA256.test(certificate)) throw new Error('invalid certificate SHA-256');
  if (!/^[a-f0-9]{40}$/i.test(String(sourceCommit || ''))) throw new Error('invalid source commit');

  const directory = resolve(outputDir);
  const apk = resolve(apkPath);
  const filename = basename(apk);
  if (!/^donkeyride-driver-[0-9A-Za-z._-]+\.apk$/.test(filename)) {
    throw new Error('unexpected APK filename');
  }

  const bytes = (await stat(apk)).size;
  const sha256 = createHash('sha256').update(await readFile(apk)).digest('hex');
  const metadata = {
    schemaVersion: 1,
    android: {
      available: true,
      version,
      versionCode: Number(versionCode),
      url: `/downloads/${filename}?sha256=${sha256.slice(0, 16)}`,
      filename,
      bytes,
      sha256,
      certificateSha256: certificate,
      sourceCommit: String(sourceCommit).toLowerCase(),
    },
    webApp: '/provide',
  };

  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, `${filename}.sha256`), `${sha256}\n`, { mode: 0o644 });
  const target = join(directory, 'driver-app.json');
  const temporary = `${target}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(metadata, null, 2)}\n`, { mode: 0o644 });
  await rename(temporary, target);
  return metadata;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [outputDir, apkPath, version, versionCode, certificateSha256, sourceCommit] = process.argv.slice(2);
  if (!sourceCommit) {
    console.error('usage: write-driver-release-metadata.mjs <out-dir> <apk> <version> <version-code> <cert-sha256> <source-commit>');
    process.exitCode = 2;
  } else {
    const metadata = await writeDriverReleaseMetadata({
      outputDir, apkPath, version, versionCode, certificateSha256, sourceCommit,
    });
    console.log(JSON.stringify(metadata));
  }
}
