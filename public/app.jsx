const { useState, useMemo, useEffect, useCallback } = React;

// ─── SUPABASE CONFIG ──────────────────────────────────────────────────────────
const SUPABASE_CONFIG = window.CI_CONFIG || {};
const SUPABASE_URL = SUPABASE_CONFIG.SUPABASE_URL || "";
const SUPABASE_KEY = SUPABASE_CONFIG.SUPABASE_ANON_KEY || "";
const HEADERS = {
  "Content-Type": "application/json",
  "apikey": SUPABASE_KEY,
  "Authorization": `Bearer ${SUPABASE_KEY}`,
};

const DB_TABLES = {
  lois: {
    name: "lois",
    columns: ["id", "developer", "state", "clusterLead", "loiSignedDate", "jda", "jdaSignedDate", "notes"],
  },
  issues: {
    name: "issues",
    columns: ["id", "loiId", "description", "owner", "raised", "due", "status"],
  },
};

const SETTINGS_TABLE = "settings";
const SLA_KEY = "jda_sla_working_days";
const DEFAULT_SLA_DAYS = 30;

const ALLOWED_TABLES = new Set(["lois", "issues", "settings"]);
function assertAllowedTable(name) {
  if (!ALLOWED_TABLES.has(name)) {
    throw new Error(`Refusing to access "${name}": this app only reads/writes lois, issues, settings.`);
  }
}

function pickColumns(row, columns) {
  return columns.reduce((out, key) => {
    const value = row[key];
    out[key] = value === "" ? null : value ?? null;
    return out;
  }, {});
}

function defaultRow(table, row) {
  if (table === "lois") {
    return { id: row.id, developer: "", state: "", clusterLead: "", loiSignedDate: "", jda: false, jdaSignedDate: "", notes: "" };
  }
  return { id: row.id, loiId: null, description: "", owner: "", raised: today(), due: "", status: "Open" };
}

function assertCreds() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error("Supabase credentials missing — config.js failed to load or env vars are not set.");
  }
}

async function dbGet(table) {
  assertCreds();
  const config = DB_TABLES[table];
  assertAllowedTable(config?.name);
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${config.name}?select=*&order=id.asc`, { headers: HEADERS });
  if (!res.ok) throw new Error(`GET ${config.name} failed: ${res.status} ${await res.text()}`);
  const rows = await res.json();
  return rows.map(row => ({ ...defaultRow(table, row), ...row }));
}

async function dbSet(table, payload) {
  assertCreds();
  const config = DB_TABLES[table];
  assertAllowedTable(config?.name);
  const rows = payload.map(row => pickColumns(row, config.columns));
  const ids = rows.map(row => row.id).filter(id => id != null);

  if (rows.length > 0) {
    const upsertRes = await fetch(`${SUPABASE_URL}/rest/v1/${config.name}?on_conflict=id`, {
      method: "POST",
      headers: { ...HEADERS, "Prefer": "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(rows),
    });
    if (!upsertRes.ok) throw new Error(`UPSERT ${config.name} failed: ${upsertRes.status} - ${await upsertRes.text()}`);
  }

  const deleteFilter = ids.length ? `not.in.(${ids.join(",")})` : "not.is.null";
  const deleteRes = await fetch(`${SUPABASE_URL}/rest/v1/${config.name}?id=${deleteFilter}`, {
    method: "DELETE",
    headers: { ...HEADERS, "Prefer": "return=minimal" },
  });
  if (!deleteRes.ok) throw new Error(`DELETE ${config.name} failed: ${deleteRes.status} - ${await deleteRes.text()}`);
}

async function settingGet(key) {
  assertCreds();
  assertAllowedTable(SETTINGS_TABLE);
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${SETTINGS_TABLE}?key=eq.${encodeURIComponent(key)}&select=value`, { headers: HEADERS });
  if (!res.ok) throw new Error(`GET setting ${key} failed: ${res.status}`);
  const rows = await res.json();
  return rows[0]?.value ?? null;
}

async function settingSet(key, value) {
  assertCreds();
  assertAllowedTable(SETTINGS_TABLE);
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${SETTINGS_TABLE}?on_conflict=key`, {
    method: "POST",
    headers: { ...HEADERS, "Prefer": "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify([{ key, value: String(value) }]),
  });
  if (!res.ok) throw new Error(`SET setting ${key} failed: ${res.status} - ${await res.text()}`);
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────
const today = () => new Date().toISOString().split("T")[0];
const countWorkingDays = (start, end) => {
  if (!start || !end) return 0;
  const s = new Date(start), e = new Date(end);
  if (e <= s) return 0;
  let count = 0;
  const cur = new Date(s);
  cur.setDate(cur.getDate() + 1);
  while (cur <= e) {
    const day = cur.getDay();
    if (day !== 0 && day !== 6) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
};

function loiStatus(loi, slaDays) {
  if (!loi.loiSignedDate) return { label: "No LOI date", rag: "Amber", elapsed: 0, remaining: slaDays, overdue: false, signed: false };
  if (loi.jda) {
    const elapsed = countWorkingDays(loi.loiSignedDate, loi.jdaSignedDate || today());
    const within = elapsed <= slaDays;
    return { label: "JDA signed", rag: within ? "Green" : "Amber", elapsed, remaining: slaDays - elapsed, overdue: !within, signed: true };
  }
  const elapsed = countWorkingDays(loi.loiSignedDate, today());
  const remaining = slaDays - elapsed;
  const overdue = remaining < 0;
  const rag = overdue ? "Red" : remaining <= Math.max(5, Math.round(slaDays * 0.2)) ? "Amber" : "Green";
  return { label: overdue ? "Overdue" : "In progress", rag, elapsed, remaining, overdue, signed: false };
}

const RAG_C = { Green: "#3a9e5f", Amber: "#d97706", Red: "#dc2626" };
const ISSUE_STATUSES = ["Open", "In Progress", "Escalated", "Resolved"];

const INPUT = { padding: "7px 10px", borderRadius: 6, border: "1.5px solid #dde", fontSize: 13, fontFamily: "inherit", width: "100%", boxSizing: "border-box", background: "#f7f8fa" };
const LBL = { fontSize: 11, color: "#888", fontWeight: 700, display: "block", marginBottom: 3 };
const EDIT_BTN = { background: "#f0f4ff", border: "none", borderRadius: 6, padding: "4px 8px", cursor: "pointer", fontSize: 12, marginRight: 4 };
const DEL_BTN = { background: "#fff0f0", border: "none", borderRadius: 6, padding: "4px 8px", cursor: "pointer", fontSize: 12 };

// ─── DB HOOK ──────────────────────────────────────────────────────────────────
function useSupabaseTable(table) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const remote = await dbGet(table);
        if (!cancelled) setData(remote || []);
      } catch (e) {
        if (!cancelled) { setError(e.message); setData([]); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [table]);

  const persist = useCallback((updater) => {
    setData(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      dbSet(table, next).catch(e => {
        console.error(`[db] ${table}:`, e);
        setError(e.message);
        alert(`Save to "${table}" failed — your change did not reach the database.\n\n${e.message}`);
      });
      return next;
    });
  }, [table]);

  return [data, persist, loading, error];
}

function useSlaSetting() {
  const [days, setDays] = useState(DEFAULT_SLA_DAYS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const v = await settingGet(SLA_KEY);
        if (!cancelled && v != null) setDays(Number(v) || DEFAULT_SLA_DAYS);
      } catch (e) {
        console.error("[db] settings:", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const update = useCallback((n) => {
    const next = Math.max(1, Math.round(Number(n) || DEFAULT_SLA_DAYS));
    setDays(next);
    settingSet(SLA_KEY, next).catch(e => {
      console.error("[db] settings:", e);
      alert(`Save to "${SETTINGS_TABLE}" failed.\n\n${e.message}`);
    });
  }, []);

  return [days, update, loading];
}

// ─── UI COMPONENTS ────────────────────────────────────────────────────────────
function SectionHeader({ label, right }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 11, fontWeight: 900, color: "#1a2a4a", letterSpacing: 1.8, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 14, color: "#3b6cb7" }}>⠿</span> {label}
        </div>
        {right}
      </div>
      <div style={{ height: 2, background: "linear-gradient(90deg, #3b6cb7 0%, #e8eaf0 60%)", borderRadius: 2, marginTop: 8 }} />
    </div>
  );
}

function RagBadge({ status, children }) {
  return <span style={{ background: RAG_C[status] || "#888", color: "#fff", padding: "2px 10px", borderRadius: 20, fontSize: 10, fontWeight: 700, letterSpacing: 0.5, whiteSpace: "nowrap" }}>{children || status}</span>;
}

function DbStatus({ saving, error, lastSaved }) {
  if (error) return <span title={error} style={{ fontSize: 10, color: "#dc2626", fontWeight: 700 }}>⚠ DB Error — {error}</span>;
  if (saving) return <span style={{ fontSize: 10, color: "#3b6cb7", fontWeight: 700, display: "flex", alignItems: "center", gap: 4 }}><span style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: "#3b6cb7", animation: "pulse 1s infinite" }} />Saving…</span>;
  return <span style={{ fontSize: 10, color: "#3a9e5f", fontWeight: 700 }}>✓ Synced{lastSaved ? ` · ${lastSaved}` : ""}</span>;
}

function Modal({ title, children, onClose, onSave, saveLabel = "Save", wide }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999, padding: 16 }}>
      <div style={{ background: "#fff", borderRadius: 14, padding: 28, width: `min(${wide ? 820 : 560}px, 100%)`, maxHeight: "88vh", overflowY: "auto", boxShadow: "0 10px 40px rgba(0,0,0,0.2)" }}>
        <div style={{ fontWeight: 900, fontSize: 16, color: "#1a2a4a", marginBottom: 18 }}>{title}</div>
        {children}
        <div style={{ display: "flex", gap: 10, marginTop: 22, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ background: "#f0f0f0", color: "#666", border: "none", borderRadius: 8, padding: "9px 22px", cursor: "pointer", fontWeight: 700 }}>Close</button>
          {onSave && <button onClick={onSave} style={{ background: "#1a2a4a", color: "#fff", border: "none", borderRadius: 8, padding: "9px 22px", cursor: "pointer", fontWeight: 800 }}>{saveLabel}</button>}
        </div>
      </div>
    </div>
  );
}

function Confirm({ message, onConfirm, onCancel }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 }}>
      <div style={{ background: "#fff", borderRadius: 14, padding: 26, width: "min(380px, 100%)", boxShadow: "0 10px 40px rgba(0,0,0,0.2)" }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: "#1a2a4a", marginBottom: 18 }}>{message}</div>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onCancel} style={{ background: "#f0f0f0", color: "#666", border: "none", borderRadius: 8, padding: "8px 20px", cursor: "pointer", fontWeight: 700 }}>Cancel</button>
          <button onClick={onConfirm} style={{ background: "#dc2626", color: "#fff", border: "none", borderRadius: 8, padding: "8px 20px", cursor: "pointer", fontWeight: 800 }}>Delete</button>
        </div>
      </div>
    </div>
  );
}

function KpiCard({ label, value, sub, color }) {
  return (
    <div style={{ background: "#fff", borderRadius: 10, padding: "16px 18px", borderLeft: `4px solid ${color}`, boxShadow: "0 2px 8px rgba(0,0,0,0.07)" }}>
      <div style={{ fontSize: 10, color: "#888", fontWeight: 700, letterSpacing: 1, marginBottom: 6 }}>{label.toUpperCase()}</div>
      <div style={{ fontSize: 28, fontWeight: 900, color: "#1a2a4a", lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: "#888", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
function App() {
  const [lois, setLois, loisLoading, loisErr] = useSupabaseTable("lois");
  const [issues, setIssues, issuesLoading, issuesErr] = useSupabaseTable("issues");
  const [slaDays, setSlaDays, slaLoading] = useSlaSetting();

  const loading = loisLoading || issuesLoading || slaLoading;
  const dbError = loisErr || issuesErr;

  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState("");
  const [filter, setFilter] = useState("All");
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [loiModal, setLoiModal] = useState(null);
  const [issuesModal, setIssuesModal] = useState(null); // loiId of LOI whose issues we're viewing
  const [issueForm, setIssueForm] = useState(null);     // active issue being edited
  const [slaEditing, setSlaEditing] = useState(false);
  const [slaDraft, setSlaDraft] = useState(slaDays);

  useEffect(() => { setSlaDraft(slaDays); }, [slaDays]);

  const blankLoi = () => ({ id: Date.now(), developer: "", state: "", clusterLead: "", loiSignedDate: today(), jda: false, jdaSignedDate: "", notes: "" });
  const blankIssue = (loiId) => ({ id: Date.now(), loiId, description: "", owner: "", raised: today(), due: "", status: "Open" });

  const [loiForm, setLoiForm] = useState(blankLoi());

  const flash = () => { setSaving(true); setTimeout(() => { setSaving(false); setLastSaved(new Date().toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit" })); }, 900); };

  const enriched = useMemo(() => (lois || []).map(l => ({ ...l, status: loiStatus(l, slaDays) })), [lois, slaDays]);

  const kpis = useMemo(() => {
    const total = enriched.length;
    const signed = enriched.filter(l => l.jda).length;
    const overdue = enriched.filter(l => !l.jda && l.status.overdue).length;
    const conversion = total > 0 ? Math.round((signed / total) * 100) : 0;
    const openIssueLois = new Set((issues || []).filter(i => i.status !== "Resolved").map(i => i.loiId)).size;
    return { total, signed, overdue, conversion, openIssueLois };
  }, [enriched, issues]);

  const filtered = useMemo(() => {
    if (filter === "All") return enriched;
    if (filter === "JDA Signed") return enriched.filter(l => l.jda);
    if (filter === "Pending JDA") return enriched.filter(l => !l.jda && !l.status.overdue);
    if (filter === "Overdue") return enriched.filter(l => !l.jda && l.status.overdue);
    return enriched;
  }, [enriched, filter]);

  const issuesByLoi = useMemo(() => {
    const map = new Map();
    (issues || []).forEach(i => {
      if (!map.has(i.loiId)) map.set(i.loiId, []);
      map.get(i.loiId).push(i);
    });
    return map;
  }, [issues]);

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: "#f2f4f7", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Barlow','Segoe UI',sans-serif" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ width: 48, height: 48, border: "4px solid #3b6cb7", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 16px" }} />
          <div style={{ fontSize: 14, fontWeight: 700, color: "#1a2a4a" }}>Connecting to Supabase…</div>
        </div>
      </div>
    );
  }

  const saveLoi = () => {
    if (loiForm.jda && !loiForm.jdaSignedDate) return alert("Set the JDA signed date, or untick \"JDA Signed\".");
    const persisted = { ...loiForm, jdaSignedDate: loiForm.jda ? loiForm.jdaSignedDate : "" };
    setLois(ls => loiModal === "add" ? [...ls, { ...persisted, id: Date.now() }] : ls.map(l => l.id === loiModal ? persisted : l));
    flash();
    setLoiModal(null);
  };

  const saveIssue = () => {
    if (!issueForm.description.trim()) return alert("Issue description is required");
    setIssues(is => {
      const exists = is.some(i => i.id === issueForm.id);
      return exists ? is.map(i => i.id === issueForm.id ? issueForm : i) : [...is, issueForm];
    });
    flash();
    setIssueForm(null);
  };

  const updateIssueStatus = (id, status) => {
    setIssues(is => is.map(i => i.id === id ? { ...i, status } : i));
    flash();
  };

  const executeDelete = () => {
    const { type, id } = confirmDelete;
    if (type === "loi") {
      setLois(ls => ls.filter(l => l.id !== id));
      setIssues(is => is.filter(i => i.loiId !== id));
    } else if (type === "issue") {
      setIssues(is => is.filter(i => i.id !== id));
    }
    flash();
    setConfirmDelete(null);
  };

  const saveSla = () => {
    setSlaDays(slaDraft);
    setSlaEditing(false);
    flash();
  };

  const activeIssuesLoi = issuesModal != null ? lois.find(l => l.id === issuesModal) : null;
  const activeIssues = activeIssuesLoi ? (issuesByLoi.get(activeIssuesLoi.id) || []) : [];

  return (
    <div style={{ minHeight: "100vh", background: "#f2f4f7", fontFamily: "'Barlow','Segoe UI',sans-serif", color: "#1a1a2e" }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}tbody tr:hover td{background:#f0f4ff!important}@media(max-width:900px){.rsp-kpis{grid-template-columns:1fr 1fr!important}.rsp-form-2col{grid-template-columns:1fr!important}}@media(max-width:600px){.rsp-kpis{grid-template-columns:1fr!important}.rsp-header-inner{flex-direction:column;align-items:flex-start;gap:10px}.rsp-header-right{width:100%;justify-content:flex-end}}`}</style>

      {/* HEADER */}
      <div style={{ background: "#1a2a4a", padding: "0 28px", boxShadow: "0 2px 12px rgba(0,0,0,0.2)" }}>
        <div className="rsp-header-inner" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 16, paddingBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 38, height: 38, background: "#3b6cb7", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, color: "#fff", fontSize: 18 }}>D</div>
            <div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", letterSpacing: 1.5, fontWeight: 700 }}>DREEF · INFRAIQ.AFRICA</div>
              <div style={{ fontSize: 18, fontWeight: 900, color: "#fff", letterSpacing: 0.3 }}>LOI → JDA CONVERSION TRACKER</div>
            </div>
          </div>
          <div className="rsp-header-right" style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <div style={{ background: "rgba(255,255,255,0.08)", padding: "5px 12px", borderRadius: 8 }}><DbStatus saving={saving} error={dbError} lastSaved={lastSaved} /></div>
            <button onClick={() => { setLoiForm(blankLoi()); setLoiModal("add"); }} style={{ background: "#3a9e5f", color: "#fff", border: "none", borderRadius: 8, padding: "9px 20px", cursor: "pointer", fontWeight: 800, fontSize: 12 }}>+ Add LOI</button>
          </div>
        </div>
      </div>

      <div style={{ padding: "24px 28px", maxWidth: 1200, margin: "0 auto" }}>

        {/* KPI ROW */}
        <div className="rsp-kpis" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 24 }}>
          <KpiCard label="LOIs Tracked" value={kpis.total} color="#3b6cb7" />
          <KpiCard label="JDAs Signed" value={kpis.signed} sub={`${kpis.conversion}% conversion`} color="#3a9e5f" />
          <KpiCard label="Pending JDA" value={kpis.total - kpis.signed} sub={`${kpis.openIssueLois} with open issues`} color="#d97706" />
          <KpiCard label="Overdue" value={kpis.overdue} sub={`Past SLA of ${slaDays} working days`} color="#dc2626" />
        </div>

        {/* SLA SETTING */}
        <div style={{ background: "#fff", borderRadius: 10, padding: "16px 20px", marginBottom: 22, boxShadow: "0 2px 8px rgba(0,0,0,0.07)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ fontSize: 10, color: "#888", fontWeight: 700, letterSpacing: 1, marginBottom: 4 }}>MAX TIME FOR JDA SIGNING (WORKING DAYS)</div>
            <div style={{ fontSize: 12, color: "#555" }}>Applies to every LOI. Status turns red once elapsed working days from LOI signing exceed this value.</div>
          </div>
          {slaEditing ? (
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="number" min={1} value={slaDraft} onChange={e => setSlaDraft(Number(e.target.value))} style={{ ...INPUT, width: 90, fontSize: 16, fontWeight: 800, textAlign: "center" }} />
              <span style={{ fontSize: 12, color: "#888" }}>working days</span>
              <button onClick={saveSla} style={{ background: "#1a2a4a", color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontWeight: 700, fontSize: 12 }}>Save</button>
              <button onClick={() => { setSlaDraft(slaDays); setSlaEditing(false); }} style={{ background: "#f0f0f0", color: "#666", border: "none", borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontWeight: 700, fontSize: 12 }}>Cancel</button>
            </div>
          ) : (
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <div style={{ fontSize: 30, fontWeight: 900, color: "#1a2a4a" }}>{slaDays}<span style={{ fontSize: 12, color: "#888", fontWeight: 600, marginLeft: 6 }}>days</span></div>
              <button onClick={() => setSlaEditing(true)} style={{ background: "#f0f4ff", color: "#1a2a4a", border: "none", borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontWeight: 700, fontSize: 12 }}>Edit SLA</button>
            </div>
          )}
        </div>

        {/* LOI TABLE */}
        <SectionHeader label="LOI REGISTER" right={
          <div style={{ display: "flex", gap: 6 }}>
            {["All", "JDA Signed", "Pending JDA", "Overdue"].map(f => (
              <button key={f} onClick={() => setFilter(f)} style={{ background: filter === f ? "#1a2a4a" : "#fff", color: filter === f ? "#fff" : "#555", border: "1.5px solid #dde", borderRadius: 6, padding: "6px 12px", cursor: "pointer", fontSize: 11, fontWeight: 700 }}>{f}</button>
            ))}
          </div>
        } />

        <div style={{ background: "#fff", borderRadius: 10, overflowX: "auto", boxShadow: "0 2px 8px rgba(0,0,0,0.07)" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "#1a2a4a", color: "#fff" }}>
                {["DEVELOPER", "STATE", "LEAD", "LOI SIGNED", "ELAPSED", "REMAINING", "JDA", "STATUS", "ISSUES", ""].map(h => (
                  <th key={h} style={{ padding: "10px 10px", textAlign: "left", fontSize: 9, fontWeight: 800, letterSpacing: 0.8, whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((l, i) => {
                const st = l.status;
                const openCount = (issuesByLoi.get(l.id) || []).filter(x => x.status !== "Resolved").length;
                const totalCount = (issuesByLoi.get(l.id) || []).length;
                return (
                  <tr key={l.id} style={{ background: i % 2 === 0 ? "#f7f9fc" : "#fff", borderBottom: "1px solid #eef" }}>
                    <td style={{ padding: "9px 10px", fontWeight: 700, color: "#1a2a4a" }}>{l.developer || "—"}</td>
                    <td style={{ padding: "9px 10px", color: "#666" }}>{l.state || "—"}</td>
                    <td style={{ padding: "9px 10px", color: "#555" }}>{l.clusterLead || "—"}</td>
                    <td style={{ padding: "9px 10px", color: "#444", whiteSpace: "nowrap" }}>{l.loiSignedDate || "—"}</td>
                    <td style={{ padding: "9px 10px", fontWeight: 700, color: "#1a2a4a" }}>{l.loiSignedDate ? `${st.elapsed}d` : "—"}</td>
                    <td style={{ padding: "9px 10px", fontWeight: 700, color: st.overdue ? "#dc2626" : "#1a2a4a" }}>
                      {l.jda ? "—" : (st.overdue ? `${Math.abs(st.remaining)}d over` : `${st.remaining}d`)}
                    </td>
                    <td style={{ padding: "9px 10px", color: "#444", whiteSpace: "nowrap" }}>{l.jda ? (l.jdaSignedDate || "✓") : "—"}</td>
                    <td style={{ padding: "9px 10px" }}><RagBadge status={st.rag}>{st.label}</RagBadge></td>
                    <td style={{ padding: "9px 10px" }}>
                      <button onClick={() => setIssuesModal(l.id)} style={{ background: openCount > 0 ? "#fff0f0" : "#f0f4ff", color: openCount > 0 ? "#dc2626" : "#1a2a4a", border: "none", borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontSize: 11, fontWeight: 700 }}>
                        {openCount > 0 ? `${openCount} open` : totalCount > 0 ? `${totalCount}` : "+ Add"}
                      </button>
                    </td>
                    <td style={{ padding: "9px 10px", whiteSpace: "nowrap" }}>
                      <button onClick={() => { setLoiForm({ ...l }); setLoiModal(l.id); }} style={EDIT_BTN}>✏️</button>
                      <button onClick={() => setConfirmDelete({ type: "loi", id: l.id, label: l.developer || `LOI #${l.id}` })} style={DEL_BTN}>🗑️</button>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={10} style={{ padding: 36, textAlign: "center", color: "#aaa" }}>No LOIs match "{filter}".</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* LOI MODAL */}
      {loiModal !== null && (
        <Modal title={loiModal === "add" ? "Add LOI" : "Edit LOI"} onClose={() => setLoiModal(null)} onSave={saveLoi}>
          <div className="rsp-form-2col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div><label style={LBL}>Developer</label><input value={loiForm.developer} onChange={e => setLoiForm(f => ({ ...f, developer: e.target.value }))} style={INPUT} /></div>
            <div><label style={LBL}>State</label><input value={loiForm.state} onChange={e => setLoiForm(f => ({ ...f, state: e.target.value }))} style={INPUT} /></div>
            <div><label style={LBL}>Cluster Lead</label><input value={loiForm.clusterLead} onChange={e => setLoiForm(f => ({ ...f, clusterLead: e.target.value }))} style={INPUT} /></div>
            <div><label style={LBL}>LOI Signed Date</label><input type="date" value={loiForm.loiSignedDate || ""} onChange={e => setLoiForm(f => ({ ...f, loiSignedDate: e.target.value }))} style={INPUT} /></div>
            <div style={{ gridColumn: "span 2", background: "#f7f9fa", borderRadius: 8, padding: "12px 14px" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer", fontWeight: 700, color: "#1a2a4a", marginBottom: 8 }}>
                <input type="checkbox" checked={!!loiForm.jda} onChange={e => setLoiForm(f => ({ ...f, jda: e.target.checked, jdaSignedDate: e.target.checked ? (f.jdaSignedDate || today()) : "" }))} /> JDA Signed
              </label>
              {loiForm.jda && (
                <div><label style={LBL}>JDA Signed Date</label><input type="date" value={loiForm.jdaSignedDate || ""} onChange={e => setLoiForm(f => ({ ...f, jdaSignedDate: e.target.value }))} style={INPUT} /></div>
              )}
            </div>
            <div style={{ gridColumn: "span 2" }}><label style={LBL}>Notes</label><textarea value={loiForm.notes || ""} onChange={e => setLoiForm(f => ({ ...f, notes: e.target.value }))} style={{ ...INPUT, height: 60, resize: "vertical" }} /></div>
          </div>
        </Modal>
      )}

      {/* ISSUES MODAL — list of issues for one LOI */}
      {issuesModal !== null && activeIssuesLoi && (
        <Modal
          title={`Issues blocking JDA — ${activeIssuesLoi.developer || `LOI #${activeIssuesLoi.id}`}`}
          onClose={() => setIssuesModal(null)}
          wide
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div style={{ fontSize: 12, color: "#555" }}>
              {activeIssues.filter(i => i.status !== "Resolved").length} open · {activeIssues.length} total
            </div>
            <button onClick={() => setIssueForm(blankIssue(activeIssuesLoi.id))} style={{ background: "#e07b39", color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontWeight: 700, fontSize: 12 }}>+ Add Issue</button>
          </div>

          {activeIssues.length === 0 ? (
            <div style={{ padding: 30, textAlign: "center", color: "#aaa", border: "1px dashed #dde", borderRadius: 8 }}>No issues logged for this LOI yet.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {activeIssues.map(issue => {
                const overdue = issue.due && new Date(issue.due) < new Date() && issue.status !== "Resolved";
                const rag = issue.status === "Resolved" ? "Green" : issue.status === "Escalated" || overdue ? "Red" : "Amber";
                return (
                  <div key={issue.id} style={{ background: "#fff", borderRadius: 8, padding: 14, border: `1px solid #eee`, borderLeft: `4px solid ${RAG_C[rag]}`, opacity: issue.status === "Resolved" ? 0.6 : 1 }}>
                    <div style={{ display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
                      <div style={{ flex: 3, minWidth: 200 }}>
                        <div style={{ fontSize: 13, color: "#222", marginBottom: 4 }}>{issue.description}</div>
                        <div style={{ fontSize: 10, color: "#888" }}>
                          {issue.owner ? `Owner: ${issue.owner} · ` : ""}Raised: {issue.raised || "—"}
                          {issue.due && <> · Due: <span style={{ color: overdue ? "#dc2626" : "#666", fontWeight: overdue ? 700 : 400 }}>{issue.due}</span></>}
                        </div>
                      </div>
                      <div style={{ minWidth: 120 }}>
                        <select value={issue.status} onChange={e => updateIssueStatus(issue.id, e.target.value)} style={{ ...INPUT, fontSize: 11 }}>
                          {ISSUE_STATUSES.map(s => <option key={s}>{s}</option>)}
                        </select>
                      </div>
                      <div style={{ display: "flex", gap: 4, alignSelf: "center" }}>
                        <button onClick={() => setIssueForm({ ...issue })} style={EDIT_BTN}>✏️</button>
                        <button onClick={() => setConfirmDelete({ type: "issue", id: issue.id, label: issue.description.substring(0, 50) })} style={DEL_BTN}>🗑️</button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Modal>
      )}

      {/* SINGLE ISSUE FORM */}
      {issueForm && (
        <Modal title={issues.some(i => i.id === issueForm.id) ? "Edit Issue" : "Add Issue"} onClose={() => setIssueForm(null)} onSave={saveIssue}>
          <div className="rsp-form-2col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div style={{ gridColumn: "span 2" }}><label style={LBL}>Description</label><textarea value={issueForm.description} onChange={e => setIssueForm(f => ({ ...f, description: e.target.value }))} style={{ ...INPUT, height: 80, resize: "vertical" }} placeholder="What is blocking JDA signing?" /></div>
            <div><label style={LBL}>Owner</label><input value={issueForm.owner} onChange={e => setIssueForm(f => ({ ...f, owner: e.target.value }))} style={INPUT} /></div>
            <div><label style={LBL}>Status</label><select value={issueForm.status} onChange={e => setIssueForm(f => ({ ...f, status: e.target.value }))} style={INPUT}>{ISSUE_STATUSES.map(s => <option key={s}>{s}</option>)}</select></div>
            <div><label style={LBL}>Date Raised</label><input type="date" value={issueForm.raised || ""} onChange={e => setIssueForm(f => ({ ...f, raised: e.target.value }))} style={INPUT} /></div>
            <div><label style={LBL}>Due Date</label><input type="date" value={issueForm.due || ""} onChange={e => setIssueForm(f => ({ ...f, due: e.target.value }))} style={INPUT} /></div>
          </div>
        </Modal>
      )}

      {confirmDelete && <Confirm message={`Delete "${confirmDelete.label}"? This cannot be undone.`} onConfirm={executeDelete} onCancel={() => setConfirmDelete(null)} />}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
