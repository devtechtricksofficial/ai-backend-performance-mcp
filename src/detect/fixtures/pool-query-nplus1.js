async function loadRows(pool) {
  const { rows } = await pool.query("SELECT id FROM users");
  for (const row of rows) {
    await pool.query(`SELECT * FROM orders WHERE user_id = ${row.id}`);
  }
}