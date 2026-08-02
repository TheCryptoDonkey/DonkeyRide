#!/usr/bin/env node
/**
 * End-to-end lifecycle proof against a RUNNING operator (local or live).
 *
 * Exercises the full production surface with real signatures:
 *   rider request (NIP-98) -> driver online via authenticated WS ->
 *   geo-dispatch broadcast -> accept -> location update -> arrive -> start ->
 *   complete -> rider rating as a signed kind 30520 event -> earnings.
 *
 * Usage:
 *   BASE=http://localhost:3000 WS_URL=ws://localhost:3001 node scripts/e2e-lifecycle.js
 *   BASE=https://operator.example.com node scripts/e2e-lifecycle.js
 *
 * Exits non-zero on the first failed assertion.
 */

const WebSocket = require('ws');
const crypto = require('crypto');
const tools = require('nostr-tools');

const BASE = process.env.BASE || 'http://localhost:3000';
const WS_URL = process.env.WS_URL
    || (BASE.startsWith('https') ? `${BASE.replace('https', 'wss')}/ws` : 'ws://localhost:3001');

const riderSk = tools.generatePrivateKey();
const riderPk = tools.getPublicKey(riderSk);
const driverSk = tools.generatePrivateKey();
const driverPk = tools.getPublicKey(driverSk);

const PICKUP = { lat: 51.5074, lon: -0.1278 };
const DROPOFF = { lat: 51.5155, lon: -0.0922 };

let failures = 0;
function check(condition, label, detail) {
    if (condition) {
        console.log(`  ✔ ${label}`);
    } else {
        failures += 1;
        console.error(`  ✖ ${label}${detail ? ` -- ${detail}` : ''}`);
    }
}

function signedEvent(sk, kind, tags, content = '') {
    return tools.finishEvent({
        kind,
        created_at: Math.floor(Date.now() / 1000),
        tags: [...tags, ['nonce', crypto.randomBytes(8).toString('hex')]],
        content,
        pubkey: tools.getPublicKey(sk)
    }, sk);
}

function authHeader(sk, url, method) {
    const event = signedEvent(sk, 27235, [['u', url], ['method', method]]);
    return `Nostr ${Buffer.from(JSON.stringify(event)).toString('base64')}`;
}

async function api(sk, method, path, body) {
    const url = `${BASE}${path}`;
    const res = await fetch(url, {
        method,
        headers: {
            'Content-Type': 'application/json',
            ...(sk ? { Authorization: authHeader(sk, url, method) } : {})
        },
        body: body ? JSON.stringify(body) : undefined
    });
    let json = null;
    try { json = await res.json(); } catch (e) { /* non-JSON */ }
    return { status: res.status, body: json };
}

/** Authenticated WS: sends the auth frame, waits for auth_ok. */
function connectDriverWs() {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(WS_URL);
        const broadcasts = [];
        let authed = false;
        ws.on('message', (raw) => {
            let msg;
            try { msg = JSON.parse(raw); } catch { return; }
            if (msg.type === 'auth_ok') {
                authed = true;
                resolve({ ws, broadcasts });
            } else if (msg.type === 'error' && msg.error === 'auth_required') {
                ws.send(JSON.stringify({ type: 'auth', event: signedEvent(driverSk, 27235, [['u', WS_URL], ['method', 'GET']]) }));
            } else if (msg.type === 'ride_request' || msg.type === 'task_broadcast') {
                broadcasts.push(msg);
            }
        });
        ws.on('open', () => {
            ws.send(JSON.stringify({ type: 'auth', event: signedEvent(driverSk, 27235, [['u', WS_URL], ['method', 'GET']]) }));
        });
        ws.on('error', reject);
        setTimeout(() => { if (!authed) reject(new Error('WS auth timed out')); }, 8000);
    });
}

async function main() {
    console.log(`E2E lifecycle against ${BASE} (WS ${WS_URL})`);
    console.log(`  rider ${riderPk.slice(0, 12)}  driver ${driverPk.slice(0, 12)}`);

    // 0. Operator is up and honest about its payment rail
    const info = await api(null, 'GET', '/info');
    check(info.status === 200, 'operator /info reachable', `status ${info.status}`);
    check(info.body?.payment?.provider, 'operator advertises a payment provider', JSON.stringify(info.body?.payment));

    // 1. Driver goes online over an authenticated WebSocket
    const { ws, broadcasts } = await connectDriverWs();
    check(true, 'driver authenticated over WebSocket');
    ws.send(JSON.stringify({ type: 'register_driver', location: PICKUP }));
    await new Promise((r) => setTimeout(r, 400));

    // 2. Rider requests a ride (signed)
    const requested = await api(riderSk, 'POST', '/api/rides/request', {
        pickup_lat: PICKUP.lat, pickup_lon: PICKUP.lon,
        dropoff_lat: DROPOFF.lat, dropoff_lon: DROPOFF.lon,
        rider_pubkey: riderPk, currency: 'GBP'
    });
    check(requested.status === 200, 'rider requests a ride', JSON.stringify(requested.body));
    const rideId = requested.body?.ride_id || requested.body?.ride?.id || requested.body?.rideId || requested.body?.id;
    check(!!rideId, 'ride id returned', JSON.stringify(requested.body));

    // 3. Driver received the geo-dispatch broadcast
    await new Promise((r) => setTimeout(r, 600));
    check(broadcasts.length > 0, 'driver received geo-dispatch broadcast', `broadcasts=${broadcasts.length}`);

    // 4. Driver accepts (signed)
    const accepted = await api(driverSk, 'POST', `/api/rides/${rideId}/accept`, {
        driver_npub: tools.nip19.npubEncode(driverPk),
        driver_pubkey: driverPk,
        driver_location: PICKUP
    });
    check(accepted.status === 200, 'driver accepts the ride', JSON.stringify(accepted.body));

    // 5. Location update, arrive, start
    const loc = await api(driverSk, 'POST', `/api/rides/${rideId}/location`, { lat: PICKUP.lat, lon: PICKUP.lon });
    check(loc.status === 200, 'driver posts a location update', JSON.stringify(loc.body));

    const arrived = await api(driverSk, 'POST', `/api/rides/${rideId}/arrive`, {});
    check(arrived.status === 200, 'driver marks arrived', JSON.stringify(arrived.body));

    const started = await api(driverSk, 'POST', `/api/rides/${rideId}/start`, {});
    check(started.status === 200, 'trip starts', JSON.stringify(started.body));

    // 6. Complete
    const completed = await api(driverSk, 'POST', `/api/rides/${rideId}/complete`, {});
    check(completed.status === 200, 'trip completes', JSON.stringify(completed.body));
    check(
        completed.body?.payment && completed.body.payment.payment_hash === undefined
            ? true
            : completed.body?.payment?.status !== undefined,
        'completion returns an honest settlement record',
        JSON.stringify(completed.body?.payment)
    );

    // 6b. Non-custodial settlement: driver advertises rails, rider pays cash
    // directly, driver confirms. The operator moves nothing.
    const setMethods = await api(driverSk, 'POST', `/api/rides/${rideId}/payment-methods`, {
        methods: [{ rail: 'lnaddress', handle: 'driver@walletofsatoshi.com' }, { rail: 'cash' }]
    });
    check(setMethods.status === 200, 'driver advertises accepted rails', JSON.stringify(setMethods.body));

    const options = await api(riderSk, 'GET', `/api/rides/${rideId}/payment-options`);
    check(options.status === 200 && Array.isArray(options.body?.methods), 'rider sees accepted rails', JSON.stringify(options.body));
    check(options.body?.custody === 'none', 'settlement is non-custodial', JSON.stringify(options.body));

    const cashInstruction = await api(riderSk, 'POST', `/api/rides/${rideId}/pay-instruction`, { rail: 'cash' });
    check(cashInstruction.status === 200 && cashInstruction.body.operator_transmitted === 0, 'pay instruction shows operator transmits nothing', JSON.stringify(cashInstruction.body));

    const settled = await api(riderSk, 'POST', `/api/rides/${rideId}/settle`, { rail: 'cash', proof: {} });
    check(settled.status === 200 && settled.body.settlement?.custody === 'none', 'rider records a direct settlement', JSON.stringify(settled.body));

    const confirmed = await api(driverSk, 'POST', `/api/rides/${rideId}/confirm-received`, {});
    check(confirmed.status === 200 && confirmed.body.settlement?.status === 'confirmed', 'driver confirms receipt', JSON.stringify(confirmed.body));

    // 7. Rider rates the driver with a signed kind 30520 event (portable reputation)
    const ratingEvent = signedEvent(riderSk, 30520, [
        ['ride', rideId],
        ['rating', '5'],
        ['role', 'rider'],
        ['p', driverPk],
        ['domain', 'ridesharing']
    ], 'great ride');
    const rated = await api(riderSk, 'POST', `/api/rides/${rideId}/rate`, { event: ratingEvent });
    check(rated.status === 200, 'rider submits a signed rating', JSON.stringify(rated.body));
    check(rated.body?.target_hex === driverPk, 'rating targets the driver pubkey', JSON.stringify(rated.body));

    // 8. Driver earnings reflect the completed ride
    const earnings = await api(driverSk, 'GET', `/api/drivers/${driverPk}/earnings`);
    check(earnings.status === 200, 'driver reads their earnings', JSON.stringify(earnings.body));
    check((earnings.body?.rides?.length || 0) >= 1, 'earnings include the completed ride', JSON.stringify(earnings.body?.summary));

    // 9. Reputation is queryable by the driver's npub (cross-operator portable)
    const rep = await api(null, 'GET', `/api/reputation/${tools.nip19.npubEncode(driverPk)}`);
    check(rep.status === 200, 'driver reputation is queryable', JSON.stringify(rep.body));

    ws.close();

    console.log('');
    if (failures === 0) {
        console.log('ALL E2E LIFECYCLE CHECKS PASSED ✅');
        process.exit(0);
    } else {
        console.error(`${failures} E2E CHECK(S) FAILED ❌`);
        process.exit(1);
    }
}

main().catch((err) => {
    console.error('E2E harness error:', err);
    process.exit(1);
});
