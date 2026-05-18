import { SUPABASE_URL, HEADERS } from "../config.js";

function assertCiTable(table) {
  if (typeof table !== "string" || !table.endsWith("_ci")) {
    throw new Error(`Refusing to access "${table}": this app only reads/writes tables with the _ci suffix.`);
  }
}

export async function dbGet(table) {
  assertCiTable(table);
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*&id=eq.1`, { headers: HEADERS });
  if (!res.ok) throw new Error(`GET ${table} failed: ${res.status}`);
  const rows = await res.json();
  return rows.length > 0 ? rows[0].data : null;
}

export async function dbSet(table, payload) {
  assertCiTable(table);
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: { ...HEADERS, Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ id: 1, data: payload }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`SET ${table} failed: ${res.status} — ${err}`);
  }
}
