// Minimal Cloudflare D1-compatible adapter over node:sqlite, for tests and
// the local dev server. Implements prepare/bind/first/all/run and batch.
import { DatabaseSync } from "node:sqlite";

export function createD1(file = ":memory:") {
  const db = new DatabaseSync(file);
  const exec = (sql, args, mode) => {
    const st = db.prepare(sql);
    if (mode === "first") return st.get(...args) ?? null;
    if (mode === "all") return { results: st.all(...args), success: true };
    const r = st.run(...args);
    return { success: true, meta: { changes: Number(r.changes) } };
  };
  const stmt = (sql, args = []) => ({
    sql,
    args,
    bind: (...a) => stmt(sql, a),
    first: async () => exec(sql, args, "first"),
    all: async () => exec(sql, args, "all"),
    run: async () => exec(sql, args, "run"),
  });
  return {
    raw: db,
    prepare: (sql) => stmt(sql),
    async batch(stmts) {
      db.exec("BEGIN");
      try {
        const out = stmts.map((s) =>
          /^\s*select|returning/i.test(s.sql) ? exec(s.sql, s.args, "all") : exec(s.sql, s.args, "run")
        );
        db.exec("COMMIT");
        return out;
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
  };
}
