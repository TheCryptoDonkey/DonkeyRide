#!/usr/bin/env bash
# ==========================================
# Regtest Lightning proof for the LND stake provider.
#
# Spins up bitcoind + two LND nodes, opens a channel from payer → operator,
# then runs driver.js which exercises the REAL money paths:
#   lock (hodl invoice) → pay → confirm held → release (cancel = refund)
#   lock → pay → confirm held → forfeit (settle = operator claims penalty)
#
# Usage:  bash tests/regtest/run.sh          (from repo root)
# Requires: docker compose, node (repo deps installed)
# ==========================================
set -euo pipefail

cd "$(dirname "$0")"
COMPOSE="docker compose -f docker-compose.yml"

BTC="$COMPOSE exec -T bitcoind bitcoin-cli -regtest -rpcuser=donkey -rpcpassword=donkey"
OP="$COMPOSE exec -T lnd-operator lncli --network=regtest --lnddir=/home/lnd/.lnd"
PAYER="$COMPOSE exec -T lnd-payer lncli --network=regtest --lnddir=/home/lnd/.lnd"

cleanup() {
  echo "--- tearing down ---"
  $COMPOSE down -v > /dev/null 2>&1 || true
}
trap cleanup EXIT

echo "--- starting bitcoind + 2x lnd ---"
$COMPOSE up -d

wait_for_lnd() {
  local name=$1 cli=$2
  for i in $(seq 1 60); do
    if $cli getinfo > /dev/null 2>&1; then
      echo "$name ready"
      return 0
    fi
    sleep 2
  done
  echo "$name did not become ready" >&2
  return 1
}

echo "--- waiting for nodes ---"
sleep 5
$BTC createwallet miner > /dev/null 2>&1 || true
MINER_ADDR=$($BTC getnewaddress)
$BTC generatetoaddress 101 "$MINER_ADDR" > /dev/null
wait_for_lnd "operator" "$OP"
wait_for_lnd "payer" "$PAYER"

echo "--- funding payer ---"
PAYER_ADDR=$($PAYER newaddress p2wkh | node -pe "JSON.parse(require('fs').readFileSync(0)).address")
$BTC sendtoaddress "$PAYER_ADDR" 1 > /dev/null
$BTC generatetoaddress 6 "$MINER_ADDR" > /dev/null

# Wait for payer to see funds
for i in $(seq 1 30); do
  CONF=$($PAYER walletbalance | node -pe "JSON.parse(require('fs').readFileSync(0)).confirmed_balance")
  [ "$CONF" != "0" ] && break
  sleep 2
done
echo "payer balance: $CONF sats"

echo "--- opening channel payer → operator ---"
OP_PUBKEY=$($OP getinfo | node -pe "JSON.parse(require('fs').readFileSync(0)).identity_pubkey")
$PAYER connect "$OP_PUBKEY@lnd-operator:9735" > /dev/null 2>&1 || true
$PAYER openchannel --node_key="$OP_PUBKEY" --local_amt=1000000 > /dev/null
$BTC generatetoaddress 6 "$MINER_ADDR" > /dev/null

# Wait for channel active
for i in $(seq 1 30); do
  ACTIVE=$($PAYER listchannels | node -pe "JSON.parse(require('fs').readFileSync(0)).channels.filter(c => c.active).length")
  [ "$ACTIVE" = "1" ] && break
  sleep 2
done
echo "channel active: $ACTIVE"

echo "--- extracting credentials ---"
CRED_DIR=$(mktemp -d)
docker cp "$($COMPOSE ps -q lnd-operator)":/home/lnd/.lnd/tls.cert "$CRED_DIR/operator-tls.cert"
docker cp "$($COMPOSE ps -q lnd-operator)":/home/lnd/.lnd/data/chain/bitcoin/regtest/admin.macaroon "$CRED_DIR/operator-admin.macaroon"
docker cp "$($COMPOSE ps -q lnd-payer)":/home/lnd/.lnd/tls.cert "$CRED_DIR/payer-tls.cert"
docker cp "$($COMPOSE ps -q lnd-payer)":/home/lnd/.lnd/data/chain/bitcoin/regtest/admin.macaroon "$CRED_DIR/payer-admin.macaroon"

echo "--- running stake semantics proof (driver.js) ---"
CRED_DIR="$CRED_DIR" node driver.js
RESULT=$?

rm -rf "$CRED_DIR"
exit $RESULT
