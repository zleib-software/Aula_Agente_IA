const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const dbPath = path.resolve(__dirname, "database.db");
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error("Erro ao abrir banco:", err.message);
    process.exit(1);
  }
});

db.all("SELECT id, session_id, role, content, timestamp FROM messages ORDER BY id DESC LIMIT 10", [], (err, rows) => {
  if (err) {
    console.error("Erro na consulta:", err.message);
  } else {
    console.log("\n📋 Últimos 10 registros na tabela 'messages':\n");
    console.table(rows);
  }
  db.close();
});
