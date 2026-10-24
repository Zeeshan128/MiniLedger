import dotenv from "dotenv";
dotenv.config();
import app from "./app";
import { pool } from "./db";

const port = Number(process.env.PORT || 4000);

async function start() {
  // Fail early with a useful message if PostgreSQL is unavailable.
  await pool.query("SELECT 1");
  app.listen(port, "0.0.0.0", () => {
    console.log(`MiniLedger API listening on http://localhost:${port}`);
  });
}

start().catch((err) => {
  console.error("Unable to start MiniLedger. Check DATABASE_URL and ensure PostgreSQL is running.", err);
  process.exit(1);
});
