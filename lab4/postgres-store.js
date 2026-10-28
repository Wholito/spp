const { Pool } = require('pg');

const createPostgresStore = (connectionString) => {
  const pool = new Pool({ connectionString, max: 2 });
  const ready = pool.query('CREATE TABLE IF NOT EXISTS lab4_state (id integer PRIMARY KEY, data jsonb NOT NULL)');

  const load = async () => {
    await ready;
    const result = await pool.query('SELECT data FROM lab4_state WHERE id = 1');
    return result.rows[0]?.data || { rooms: [] };
  };

  const save = async (data) => {
    await ready;
    await pool.query(
      'INSERT INTO lab4_state (id, data) VALUES (1, $1::jsonb) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data',
      [JSON.stringify(data)]
    );
  };

  return { load, save, close: () => pool.end() };
};

module.exports = { createPostgresStore };
