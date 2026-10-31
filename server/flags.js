// Feature flags, switched from the admin panel (GET/PUT /api/admin/flags) and read by the routes they control.
// Only the names below exist; each is on or off. Without the database every flag is at its default.

export const DEFAULT_FLAGS = { castAdvisor: true, identify: true, smartBite: true, community: true };
export const FLAG_NAMES = Object.keys(DEFAULT_FLAGS);

export async function getFlags(db) {
  const out = { ...DEFAULT_FLAGS };
  if (!db) return out;
  try {
    const rows = (await db.prepare(`SELECT name, value FROM flags`).all()).results || [];
    for (const r of rows) {
      if (!FLAG_NAMES.includes(r.name)) continue;
      try {
        const v = JSON.parse(r.value);
        if (typeof v === "boolean") out[r.name] = v;
      } catch {}
    }
  } catch {}
  return out;
}

/** Sets the known flags in `patch` that are booleans; anything else is ignored. Returns every flag. */
export async function setFlags(db, patch, byUid, now) {
  const stmts = [];
  for (const name of FLAG_NAMES) {
    if (typeof patch?.[name] !== "boolean") continue;
    stmts.push(db.prepare(`INSERT INTO flags (name, value, updated_at, updated_by) VALUES (?1, ?2, ?3, ?4)
      ON CONFLICT(name) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by`)
      .bind(name, JSON.stringify(patch[name]), now, byUid ?? null));
  }
  if (stmts.length) await db.batch(stmts);
  return getFlags(db);
}
