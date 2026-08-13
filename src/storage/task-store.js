/**
 * Task persistence layer.
 *
 * Tasks are persisted as JSONB rows keyed by task id, with indexed columns
 * for domain, status and party pubkeys so operator queries stay cheap.
 * Backend is selected by DATABASE_URL: PostgreSQL when set, in-memory
 * otherwise (tests and quick demos). Both backends share one contract:
 *
 *   await store.init()
 *   await store.saveTask(task, { terminal })
 *   await store.loadActiveTasks()  → array of task payloads
 *   await store.close()
 */

class MemoryTaskStore {
  constructor() {
    this.rows = new Map();
    this.backend = 'memory';
  }

  async init() {}

  async saveTask(task, { terminal = false } = {}) {
    this.rows.set(task.id, {
      id: task.id,
      domain: task.domain,
      terminal,
      payload: JSON.parse(JSON.stringify(task))
    });
  }

  async loadActiveTasks() {
    return Array.from(this.rows.values())
      .filter((row) => !row.terminal)
      .map((row) => row.payload);
  }

  async loadTasksByParticipant(pubkey) {
    const key = (pubkey || '').toLowerCase();
    return Array.from(this.rows.values())
      .filter((row) => {
        const p = row.payload;
        const provider = p.provider || p.driver;
        const requester = p.requester || p.rider;
        return provider?.pubkey?.toLowerCase() === key
          || requester?.pubkey?.toLowerCase() === key;
      })
      .map((row) => row.payload);
  }

  async saveStake(stake) {
    if (!this.stakes) this.stakes = new Map();
    this.stakes.set(stake.stakeId, JSON.parse(JSON.stringify(stake)));
  }

  async loadStakes() {
    if (!this.stakes) return [];
    return Array.from(this.stakes.values());
  }

  async saveOutboxEvent(event) {
    if (!this.outbox) this.outbox = new Map();
    this.outbox.set(event.id, JSON.parse(JSON.stringify(event)));
  }

  async deleteOutboxEvent(eventId) {
    if (this.outbox) this.outbox.delete(eventId);
  }

  async loadOutboxEvents(limit = 100) {
    if (!this.outbox) return [];
    return Array.from(this.outbox.values()).slice(0, limit);
  }

  async healthCheck() {
    return true;
  }

  async close() {}
}

class PgTaskStore {
  constructor(databaseUrl) {
    this.databaseUrl = databaseUrl;
    this.pool = null;
    this.backend = 'postgres';
  }

  async init() {
    const { Pool } = require('pg');
    this.pool = new Pool({
      connectionString: this.databaseUrl,
      connectionTimeoutMillis: 5000
    });

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        domain TEXT NOT NULL,
        status TEXT NOT NULL,
        requester_pubkey TEXT,
        provider_pubkey TEXT,
        terminal BOOLEAN NOT NULL DEFAULT FALSE,
        payload JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await this.pool.query(
      'CREATE INDEX IF NOT EXISTS tasks_active_idx ON tasks (terminal, domain)'
    );

    // Stake persistence: hodl-invoice preimages MUST survive a restart or
    // held customer funds become permanently unsettleable.
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS stakes (
        stake_id TEXT PRIMARY KEY,
        provider TEXT NOT NULL,
        payload JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    // Nostr outbox: events that failed to reach any relay are retried,
    // not silently dropped.
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS nostr_outbox (
        event_id TEXT PRIMARY KEY,
        event JSONB NOT NULL,
        attempts INT NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
  }

  async saveTask(task, { terminal = false } = {}) {
    const provider = task.provider || task.driver || null;
    await this.pool.query(
      `INSERT INTO tasks (id, domain, status, requester_pubkey, provider_pubkey, terminal, payload, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, now())
       ON CONFLICT (id) DO UPDATE SET
         status = EXCLUDED.status,
         requester_pubkey = EXCLUDED.requester_pubkey,
         provider_pubkey = EXCLUDED.provider_pubkey,
         terminal = EXCLUDED.terminal,
         payload = EXCLUDED.payload,
         updated_at = now()`,
      [
        task.id,
        task.domain,
        task.status,
        task.requester?.pubkey || null,
        provider?.pubkey || null,
        terminal,
        JSON.stringify(task)
      ]
    );
  }

  async loadActiveTasks() {
    const result = await this.pool.query('SELECT payload FROM tasks WHERE NOT terminal');
    return result.rows.map((row) => row.payload);
  }

  async loadTasksByParticipant(pubkey) {
    const key = (pubkey || '').toLowerCase();
    const result = await this.pool.query(
      `SELECT payload FROM tasks
       WHERE provider_pubkey = $1 OR requester_pubkey = $1
       ORDER BY updated_at DESC
       LIMIT 500`,
      [key]
    );
    return result.rows.map((row) => row.payload);
  }

  async saveStake(stake) {
    await this.pool.query(
      `INSERT INTO stakes (stake_id, provider, payload, updated_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (stake_id) DO UPDATE SET
         provider = EXCLUDED.provider,
         payload = EXCLUDED.payload,
         updated_at = now()`,
      [stake.stakeId, stake.provider || 'unknown', JSON.stringify(stake)]
    );
  }

  async loadStakes() {
    const result = await this.pool.query('SELECT payload FROM stakes');
    return result.rows.map((row) => row.payload);
  }

  async saveOutboxEvent(event) {
    await this.pool.query(
      `INSERT INTO nostr_outbox (event_id, event, attempts)
       VALUES ($1, $2, 0)
       ON CONFLICT (event_id) DO UPDATE SET attempts = nostr_outbox.attempts + 1`,
      [event.id, JSON.stringify(event)]
    );
  }

  async deleteOutboxEvent(eventId) {
    await this.pool.query('DELETE FROM nostr_outbox WHERE event_id = $1', [eventId]);
  }

  async loadOutboxEvents(limit = 100) {
    const result = await this.pool.query(
      'SELECT event FROM nostr_outbox WHERE attempts < 50 ORDER BY created_at LIMIT $1',
      [limit]
    );
    return result.rows.map((row) => row.event);
  }

  async healthCheck() {
    await this.pool.query('SELECT 1');
    return true;
  }

  async close() {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }
}

/**
 * Create the appropriate store for the environment.
 *
 * @param {string|undefined} databaseUrl - PostgreSQL connection string
 * @returns {MemoryTaskStore|PgTaskStore}
 */
function createTaskStore(databaseUrl) {
  return databaseUrl ? new PgTaskStore(databaseUrl) : new MemoryTaskStore();
}

module.exports = {
  createTaskStore,
  MemoryTaskStore,
  PgTaskStore
};
