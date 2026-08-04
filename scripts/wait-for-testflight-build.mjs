#!/usr/bin/env node

/**
 * Wait until a build actually reaches TestFlight, and say so only then.
 *
 * `altool --upload-app` succeeding means Apple ACCEPTED the bytes, not that
 * the build processed. A build can be accepted and then land in FAILED or
 * INVALID minutes later, so a workflow that stops at the upload step reports
 * a delivery that never happened. This polls App Store Connect until the
 * exact marketing version and build number reads VALID.
 *
 * Optionally attaches the validated build to a named internal beta group, so
 * testers get it without anyone opening the web UI.
 *
 * Ported from the meatchat app, which proved the approach. No dependencies:
 * the ES256 JWT is signed with node:crypto.
 *
 * Environment: APP_STORE_CONNECT_API_ISSUER_ID, APP_STORE_CONNECT_API_KEY_ID,
 * APP_STORE_CONNECT_API_KEY_PATH
 */

import { readFileSync } from 'node:fs';
import { sign } from 'node:crypto';

function argument(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  const value = process.argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${name} requires a value`);
  return value;
}

function requiredArgument(name) {
  const value = argument(name);
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function requiredEnvironment(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function positiveInteger(name, value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}

function appStoreConnectToken({ issuerId, keyId, privateKeyPath }) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'ES256', kid: keyId, typ: 'JWT' }));
  const payload = base64url(
    JSON.stringify({ iss: issuerId, iat: issuedAt, exp: issuedAt + 19 * 60, aud: 'appstoreconnect-v1' }),
  );
  const signingInput = `${header}.${payload}`;
  const signature = sign('sha256', Buffer.from(signingInput), {
    key: readFileSync(privateKeyPath, 'utf8'),
    dsaEncoding: 'ieee-p1363',
  });
  return `${signingInput}.${signature.toString('base64url')}`;
}

function appleError(body) {
  if (!Array.isArray(body?.errors)) return JSON.stringify(body);
  return body.errors
    .map((error) => [error.status, error.code, error.title, error.detail].filter(Boolean).join(' '))
    .join('; ');
}

async function api(path, token, { method = 'GET', body } = {}) {
  const response = await fetch(`https://api.appstoreconnect.apple.com${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const responseBody = response.status === 204 ? undefined : await response.json();
  if (!response.ok) {
    throw new Error(`App Store Connect ${response.status}: ${appleError(responseBody)}`);
  }
  return responseBody;
}

function query(path, params) {
  const url = new URL(path, 'https://api.appstoreconnect.apple.com');
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
  return `${url.pathname}${url.search}`;
}

const bundleId = requiredArgument('--bundle-id');
const marketingVersion = requiredArgument('--marketing-version');
const buildNumber = requiredArgument('--build-number');
const timeoutSeconds = positiveInteger('--timeout-seconds', argument('--timeout-seconds', '900'));
const pollSeconds = positiveInteger('--poll-seconds', argument('--poll-seconds', '15'));
const listInternalGroups = hasFlag('--list-internal-groups');
const internalGroupName = argument('--internal-group');

if (!/^[A-Za-z0-9.-]+$/.test(bundleId)) throw new Error('Invalid --bundle-id');
if (!/^\d+(?:\.\d+){1,2}$/.test(marketingVersion)) throw new Error('Invalid --marketing-version');
if (!/^\d+(?:\.\d+)*$/.test(buildNumber)) throw new Error('Invalid --build-number');

const token = appStoreConnectToken({
  issuerId: requiredEnvironment('APP_STORE_CONNECT_API_ISSUER_ID'),
  keyId: requiredEnvironment('APP_STORE_CONNECT_API_KEY_ID'),
  privateKeyPath: requiredEnvironment('APP_STORE_CONNECT_API_KEY_PATH'),
});

const apps = await api(
  query('/v1/apps', {
    'filter[bundleId]': bundleId,
    'fields[apps]': 'bundleId',
    limit: '2',
  }),
  token,
);

if (apps.data?.length !== 1) {
  throw new Error(`Expected one App Store Connect app for ${bundleId}; found ${apps.data?.length ?? 0}`);
}

const appId = apps.data[0].id;
const buildsPath = query('/v1/builds', {
  'filter[app]': appId,
  'filter[version]': buildNumber,
  'filter[preReleaseVersion.version]': marketingVersion,
  'fields[builds]': 'version,uploadedDate,processingState,minOsVersion,expired',
  limit: '10',
  sort: '-uploadedDate',
});

const deadline = Date.now() + timeoutSeconds * 1000;
let previousState;
let validatedBuild;

while (Date.now() < deadline) {
  const builds = await api(buildsPath, token);
  const build = builds.data?.find((candidate) => candidate.attributes?.version === buildNumber);
  const state = build?.attributes?.processingState ?? 'NOT_VISIBLE';
  if (state !== previousState) {
    console.log(`TestFlight ${marketingVersion} (${buildNumber}): ${state}`);
    previousState = state;
  }

  if (state === 'VALID') {
    if (build.attributes.expired) throw new Error('The processed TestFlight build is already expired');
    console.log(
      `Validated TestFlight build ${marketingVersion} (${buildNumber}), minimum OS ${build.attributes.minOsVersion ?? 'unknown'}, uploaded ${build.attributes.uploadedDate ?? 'unknown'}.`,
    );
    validatedBuild = build;
    break;
  }
  if (state === 'FAILED' || state === 'INVALID') {
    throw new Error(`TestFlight processing ended in ${state}`);
  }

  await new Promise((resolve) => setTimeout(resolve, pollSeconds * 1000));
}

if (!validatedBuild) {
  throw new Error(
    `Timed out after ${timeoutSeconds}s waiting for TestFlight ${marketingVersion} (${buildNumber})`,
  );
}

if (listInternalGroups || internalGroupName) {
  const groups = await api(
    query(`/v1/apps/${appId}/betaGroups`, {
      'fields[betaGroups]': 'name,isInternalGroup,hasAccessToAllBuilds',
      limit: '200',
    }),
    token,
  );
  const internalGroups = (groups.data ?? []).filter((group) => group.attributes?.isInternalGroup);

  if (internalGroups.length === 0) {
    throw new Error('No internal TestFlight beta groups exist for this app');
  }

  for (const group of internalGroups) {
    console.log(
      `Internal TestFlight group: ${group.attributes.name} (all builds: ${Boolean(group.attributes.hasAccessToAllBuilds)})`,
    );
  }

  if (internalGroupName) {
    const matches = internalGroups.filter((group) => group.attributes?.name === internalGroupName);
    if (matches.length !== 1) {
      throw new Error(
        `Expected one internal TestFlight group named ${JSON.stringify(internalGroupName)}; found ${matches.length}`,
      );
    }

    const group = matches[0];
    const groupBuilds = await api(
      query(`/v1/betaGroups/${group.id}/relationships/builds`, { limit: '200' }),
      token,
    );
    const alreadyAttached = (groupBuilds.data ?? []).some(
      (candidate) => candidate.type === 'builds' && candidate.id === validatedBuild.id,
    );

    if (alreadyAttached) {
      console.log(
        `TestFlight ${marketingVersion} (${buildNumber}) is already attached to internal group ${JSON.stringify(internalGroupName)}.`,
      );
    } else {
      await api(`/v1/betaGroups/${group.id}/relationships/builds`, token, {
        method: 'POST',
        body: { data: [{ type: 'builds', id: validatedBuild.id }] },
      });
      console.log(
        `Attached TestFlight ${marketingVersion} (${buildNumber}) to internal group ${JSON.stringify(internalGroupName)}.`,
      );
    }
  }
}
