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
