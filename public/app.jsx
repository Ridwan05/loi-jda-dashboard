const { useState, useMemo, useEffect, useCallback } = React;

// ─── SUPABASE CONFIG ──────────────────────────────────────────────────────────
const SUPABASE_CONFIG = window.MESHGRID_CONFIG || {};
const SUPABASE_URL = SUPABASE_CONFIG.SUPABASE_URL || "";
const SUPABASE_KEY = SUPABASE_CONFIG.SUPABASE_ANON_KEY || "";
const HEADERS = {
  "Content-Type": "application/json",
  "apikey": SUPABASE_KEY,
  "Authorization": `Bearer ${SUPABASE_KEY}`,
};

const DB_TABLES = {
  projects: {
    name: "projects",
    columns: ["id", "name", "developer", "state", "stage", "clusterLead", "rag", "size", "connections", "connectionsInstalled", "dailyRate", "loi", "jda", "credit", "fc", "stageStart", "targetCompletion", "actualCompletion", "subsidyExpected", "subsidyReceived", "capexPerConn", "arpu", "opex", "issue", "owner", "lastUpdate", "targetClose", "timeToFirstPower", "updateCompliance", "evidenceCompliance"],
  },
  team: {
    name: "team_members",
    columns: ["id", "name", "role", "assigned", "tasksDue"],
  },
  issues: {
    name: "issues",
    columns: ["id", "project", "owner", "status", "due"],
  },
  deployment: {
    name: "deployment_sites",
    columns: ["id", "site", "project", "householdsInstalled"],
  },
};

function pickColumns(row, columns) {
  return columns.reduce((out, key) => {
    const value = row[key];
    out[key] = value === "" ? null : value ?? null;
    return out;
  }, {});
}

function defaultRow(table, row) {
  if (table === "projects") {
    return {
      id: row.id,
      name: "",
      developer: "",
      state: "",
      stage: "Preliminary Assessment",
      clusterLead: "",
      rag: "Green",
      loi: false,
      jda: false,
      credit: false,
      fc: false,
      size: 0,
      connections: 0,
      connectionsInstalled: 0,
      dailyRate: 0,
      stageStart: "",
      targetCompletion: "",
      actualCompletion: "",
      subsidyExpected: 0,
      subsidyReceived: 0,
      capexPerConn: 0,
      arpu: 0,
      opex: 0,
      issue: "",
      owner: "",
      lastUpdate: today(),
      targetClose: "",
      timeToFirstPower: null,
      updateCompliance: 100,
      evidenceCompliance: 100,
    };
  }

  if (table === "team") {
    return { id: row.id, name: "", role: "Cluster Lead", assigned: 0, tasksDue: 0, overdue: 0, compliance: 100, rag: "Green" };
  }

  if (table === "issues") {
    return { id: row.id, project: "", category: "Other", description: "", owner: "", raised: today(), due: "", status: "Open", rag: "Amber" };
  }

  return {
    id: row.id,
    site: "",
    project: "",
    state: "",
    village: "",
    householdsPlanned: 0,
    householdsInstalled: 0,
    teams: 1,
    dailyRate: 0,
    startDate: today(),
    daysActive: 0,
  };
}

async function dbGet(table, seed) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  const config = DB_TABLES[table];
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${config.name}?select=*&order=id.asc`, { headers: HEADERS });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GET ${config.name} failed: ${res.status} ${err}`);
  }
  const rows = await res.json();
  if (rows.length === 0) return null;

  const defaults = new Map(seed.map(row => [row.id, row]));
  return rows.map(row => ({ ...defaultRow(table, row), ...(defaults.get(row.id) || {}), ...row }));
}

async function dbSet(table, payload) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return;
  const config = DB_TABLES[table];
  const rows = payload.map(row => pickColumns(row, config.columns));
  console.log(`[db] ${table} upsert payload:`, JSON.stringify(rows[0]));
  const ids = rows.map(row => row.id).filter(id => id != null);
  const deleteFilter = ids.length ? `not.in.(${ids.join(",")})` : "not.is.null";

  const deleteRes = await fetch(`${SUPABASE_URL}/rest/v1/${config.name}?id=${deleteFilter}`, {
    method: "DELETE",
    headers: { ...HEADERS, "Prefer": "return=minimal" },
  });
  if (!deleteRes.ok) {
    const err = await deleteRes.text();
    throw new Error(`DELETE ${config.name} failed: ${deleteRes.status} - ${err}`);
  }

  if (rows.length === 0) return;

  const upsertRes = await fetch(`${SUPABASE_URL}/rest/v1/${config.name}?on_conflict=id`, {
    method: "POST",
    headers: { ...HEADERS, "Prefer": "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(rows),
  });
  if (!upsertRes.ok) {
    const err = await upsertRes.text();
    throw new Error(`UPSERT ${config.name} failed: ${upsertRes.status} - ${err}`);
  }
}

// ─── SEED DATA ────────────────────────────────────────────────────────────────
const SEED_PROJECTS = [
  { id: 1, name: "Kwali Cluster MeshGrid", developer: "SolarNG Ltd", state: "FCT", stage: "Project Development", clusterLead: "Amaka O.", rag: "Green", loi: true, jda: true, credit: false, fc: false, size: 12.8, connections: 800, connectionsInstalled: 320, dailyRate: 18, stageStart: "2025-11-01", targetCompletion: "2026-06-30", actualCompletion: "", subsidyExpected: 48000000, subsidyReceived: 12000000, capexPerConn: 95000, arpu: 8500, opex: 2200000, issue: "", owner: "Amaka O.", lastUpdate: "2026-05-01", targetClose: "Q4 2026", timeToFirstPower: 3, updateCompliance: 95, evidenceCompliance: 90 },
  { id: 2, name: "Bwari Rural MeshGrid", developer: "GreenPower NG", state: "FCT", stage: "Project Preparation", clusterLead: "Emeka T.", rag: "Amber", loi: true, jda: true, credit: false, fc: false, size: 8.4, connections: 600, connectionsInstalled: 80, dailyRate: 9, stageStart: "2026-01-15", targetCompletion: "2026-09-30", actualCompletion: "", subsidyExpected: 36000000, subsidyReceived: 0, capexPerConn: 102000, arpu: 7800, opex: 1800000, issue: "LOI counterparty signature delayed", owner: "Emeka T.", lastUpdate: "2026-04-28", targetClose: "Q1 2027", timeToFirstPower: null, updateCompliance: 70, evidenceCompliance: 65 },
  { id: 3, name: "Kuje East MeshGrid", developer: "Volts Africa", state: "FCT", stage: "Project Preparation", clusterLead: "Fatima K.", rag: "Red", loi: true, jda: false, credit: false, fc: false, size: 9.6, connections: 450, connectionsInstalled: 0, dailyRate: 0, stageStart: "2025-12-01", targetCompletion: "2026-05-31", actualCompletion: "", subsidyExpected: 27000000, subsidyReceived: 0, capexPerConn: 110000, arpu: 8000, opex: 1600000, issue: "Financial model incomplete — Promise yet to update", owner: "Fatima K.", lastUpdate: "2026-04-25", targetClose: "Q2 2027", timeToFirstPower: null, updateCompliance: 60, evidenceCompliance: 55 },
  { id: 4, name: "Nasarawa South MeshGrid", developer: "EnergyCo NG", state: "Nasarawa", stage: "Preliminary Assessment", clusterLead: "Amaka O.", rag: "Green", loi: true, jda: false, credit: false, fc: false, size: 7.7, connections: 520, connectionsInstalled: 0, dailyRate: 0, stageStart: "2025-08-01", targetCompletion: "2026-04-30", actualCompletion: "", subsidyExpected: 0, subsidyReceived: 0, capexPerConn: 88000, arpu: 9200, opex: 3100000, issue: "", owner: "Amaka O.", lastUpdate: "2026-04-30", targetClose: "Q3 2027", timeToFirstPower: null, updateCompliance: 100, evidenceCompliance: 100 },
  { id: 5, name: "Ogun West MeshGrid", developer: "BrightGrid Ltd", state: "Ogun", stage: "Preliminary Assessment", clusterLead: "Uche B.", rag: "Green", loi: false, jda: false, credit: false, fc: false, size: 24.8, connections: 950, connectionsInstalled: 0, dailyRate: 0, stageStart: "2026-03-01", targetCompletion: "2027-01-31", actualCompletion: "", subsidyExpected: 0, subsidyReceived: 0, capexPerConn: 91000, arpu: 8800, opex: 2800000, issue: "", owner: "Uche B.", lastUpdate: "2026-05-01", targetClose: "Q4 2027", timeToFirstPower: null, updateCompliance: 100, evidenceCompliance: 100 },
];
const SEED_TEAM = [
  { id: 1, name: "Amaka O.", role: "Cluster Lead", assigned: 2, tasksDue: 5, overdue: 1, compliance: 90, rag: "Amber" },
  { id: 2, name: "Emeka T.", role: "Cluster Lead", assigned: 1, tasksDue: 3, overdue: 2, compliance: 70, rag: "Red" },
  { id: 3, name: "Fatima K.", role: "Cluster Lead", assigned: 1, tasksDue: 4, overdue: 1, compliance: 80, rag: "Amber" },
  { id: 4, name: "Uche B.", role: "Technical Analyst", assigned: 1, tasksDue: 6, overdue: 0, compliance: 100, rag: "Green" },
  { id: 5, name: "Ngozi P.", role: "Commercial Analyst", assigned: 2, tasksDue: 4, overdue: 0, compliance: 100, rag: "Green" },
];
const SEED_ISSUES = [
  { id: 1, project: "Bwari Rural MeshGrid", category: "Commercial", description: "LOI counterparty delayed — AgAssetCo chasing", owner: "Emeka T.", raised: "2026-04-10", due: "2026-05-10", status: "Open", rag: "Amber" },
  { id: 2, project: "Kuje East MeshGrid", category: "Financial Model", description: "Promise financial model v3 not yet received — blocks bankability submission", owner: "Fatima K.", raised: "2026-04-20", due: "2026-05-05", status: "Escalated", rag: "Red" },
  { id: 3, project: "Kwali Cluster MeshGrid", category: "Deployment", description: "Daily deployment rate below 90/day — contractor capacity constraint", owner: "Amaka O.", raised: "2026-04-28", due: "2026-05-12", status: "Open", rag: "Amber" },
];
const SEED_DEPLOYMENT = [
  { id: 1, site: "Kwali North", project: "Kwali Cluster MeshGrid", state: "FCT", village: "Pai", householdsPlanned: 300, householdsInstalled: 140, teams: 2, dailyRate: 8, startDate: "2026-03-01", daysActive: 63 },
  { id: 2, site: "Kwali South", project: "Kwali Cluster MeshGrid", state: "FCT", village: "Gwagwalada", householdsPlanned: 500, householdsInstalled: 180, teams: 2, dailyRate: 10, startDate: "2026-03-15", daysActive: 49 },
  { id: 3, site: "Bwari East", project: "Bwari Rural MeshGrid", state: "FCT", village: "Bwari", householdsPlanned: 600, householdsInstalled: 80, teams: 1, dailyRate: 9, startDate: "2026-04-01", daysActive: 32 },
];

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const STAGES_META = [
  { label: "Preliminary Assessment", color: "#3a9e5f", bullets: ["Site Identification & Selection", "Execution of Exclusivity Agreement"] },
  { label: "Project Preparation", color: "#3b6cb7", bullets: ["Detailed Site Assessment", "Demand Modelling & System Sizing"] },
  { label: "Project Development", color: "#e07b39", bullets: ["Preparation of O & M Plan", "Obtain All Regulatory Permits/Approvals"] },
  { label: "Project Finance", color: "#1a2a4a", bullets: ["Submission of Project Finance Documents", "Guarantee Request Letter Signed"] },
];
const STAGES_LIST = ["Preliminary Assessment", "Project Preparation", "Project Development", "Project Finance", "Financial Close"];
const ISSUE_CATS = ["Commercial", "Financial Model", "Technical", "Legal", "Deployment", "Governance", "Other"];
const ISSUE_STATUSES = ["Open", "In Progress", "Escalated", "Resolved"];
const ROLES = ["Cluster Lead", "Technical Analyst", "Technical Associate", "ESG Associate", "Legal Associate", "Legal Manager", "PUE Associate", "Project Finance Analyst", "Project Finance Associate"];
const RAG_C = { Green: "#3a9e5f", Amber: "#d97706", Red: "#dc2626" };
const RAG_LIGHT = { Green: "#d4edda", Amber: "#fef3cd", Red: "#f8d7da" };

const fmt = (n) => n?.toLocaleString("en-NG") ?? "—";
const pct = (a, b) => b ? Math.round((a / b) * 100) : 0;
const ragFor = (val, target, higher = true) => { const r = val / target; if (higher) return r >= 0.9 ? "Green" : r >= 0.6 ? "Amber" : "Red"; return r <= 1.1 ? "Green" : r <= 1.4 ? "Amber" : "Red"; };
const today = () => new Date().toISOString().split("T")[0];
const INPUT = { padding: "7px 10px", borderRadius: 6, border: "1.5px solid #dde", fontSize: 13, fontFamily: "inherit", width: "100%", boxSizing: "border-box", background: "#f7f8fa" };
const LBL = { fontSize: 11, color: "#888", fontWeight: 700, display: "block", marginBottom: 3 };
const EDIT_BTN = { background: "#f0f4ff", border: "none", borderRadius: 6, padding: "4px 8px", cursor: "pointer", fontSize: 12, marginRight: 4 };
const DEL_BTN = { background: "#fff0f0", border: "none", borderRadius: 6, padding: "4px 8px", cursor: "pointer", fontSize: 12 };
const TABS = [{ id: "pipeline", label: "Pipeline Manager" }, { id: "kpi", label: "KPI Dashboard" }, { id: "deployment", label: "Deployment Tracker" }, { id: "team", label: "Team Performance" }, { id: "issues", label: "Management Support" }];

// ─── DB HOOK ──────────────────────────────────────────────────────────────────
function useSupabaseTable(table, seed) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const remote = await dbGet(table, seed);
        if (!cancelled) setData(remote ?? seed);
      } catch (e) {
        if (!cancelled) { setError(e.message); setData(seed); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [table]);

  const persist = useCallback((updater) => {
    setData(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      dbSet(table, next).catch(e => { console.error(`[db] ${table}:`, e); setError(e.message); });
      return next;
    });
  }, [table]);

  return [data, persist, loading, error];
}

// ─── COMPONENTS ───────────────────────────────────────────────────────────────
function SectionHeader({ label }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 900, color: "#1a2a4a", letterSpacing: 1.8, display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 14, color: "#3b6cb7" }}>⠿</span> {label}
      </div>
      <div style={{ height: 2, background: "linear-gradient(90deg, #3b6cb7 0%, #e8eaf0 60%)", borderRadius: 2 }} />
    </div>
  );
}
function RagBadge({ status }) { return <span style={{ background: RAG_C[status] || "#888", color: "#fff", padding: "2px 10px", borderRadius: 20, fontSize: 10, fontWeight: 700, letterSpacing: 0.5 }}>{status}</span>; }
function ProgressBar({ value, max }) { const p = Math.min(pct(value, max), 100); const c = p >= 90 ? "#3a9e5f" : p >= 60 ? "#d97706" : "#dc2626"; return <div style={{ background: "#eee", borderRadius: 6, height: 7, overflow: "hidden" }}><div style={{ width: `${p}%`, height: "100%", background: c, borderRadius: 6, transition: "width 0.5s" }} /></div>; }
function Tick({ val }) { return val ? <span style={{ color: "#3a9e5f", fontWeight: 900, fontSize: 15 }}>✓</span> : <span style={{ color: "#ddd", fontSize: 15 }}>○</span>; }
function MilestoneDot({ label, done }) { return <div style={{ textAlign: "center" }}><div style={{ width: 22, height: 22, borderRadius: "50%", background: done ? "#3a9e5f" : "#e8eaf0", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: done ? "#fff" : "#bbb", margin: "0 auto 3px" }}>{done ? "✓" : ""}</div><div style={{ fontSize: 8, color: "#aaa", fontWeight: 700 }}>{label}</div></div>; }
function StagePill({ stage }) { const c = { "Preliminary Assessment": "#3a9e5f", "Project Preparation": "#3b6cb7", "Project Development": "#e07b39", "Project Finance": "#1a2a4a", "Financial Close": "#6d28d9" }; return <span style={{ background: c[stage] || "#888", color: "#fff", padding: "2px 9px", borderRadius: 20, fontSize: 9, fontWeight: 700 }}>{stage}</span>; }

function Donut({ segments, size = 140, stroke = 28 }) {
  const r = (size - stroke) / 2, circ = 2 * Math.PI * r;
  let acc = 0;
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  return <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: "rotate(-90deg)" }}>{segments.map((seg, i) => { const frac = (seg.value || 0.001) / total, dash = frac * circ, offset = -acc * circ; acc += frac; return <circle key={i} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={seg.color} strokeWidth={stroke} strokeDasharray={`${dash} ${circ - dash}`} strokeDashoffset={offset} />; })}</svg>;
}

function KpiCard({ label, actual, target, unit, rag, detail }) {
  const c = RAG_C[rag] || "#888";
  return <div style={{ background: "#fff", borderRadius: 10, padding: "16px 18px", borderLeft: `4px solid ${c}`, boxShadow: "0 2px 8px rgba(0,0,0,0.07)" }}><div style={{ fontSize: 10, color: "#888", fontWeight: 700, letterSpacing: 1, marginBottom: 6 }}>{label.toUpperCase()}</div><div style={{ fontSize: 26, fontWeight: 900, color: "#1a2a4a", lineHeight: 1 }}>{actual}{unit}</div><div style={{ fontSize: 10, color: "#aaa", marginTop: 4 }}>Target: {target}{unit}</div>{detail && <div style={{ fontSize: 10, color: "#888", marginTop: 3 }}>{detail}</div>}<div style={{ marginTop: 8 }}><ProgressBar value={actual} max={target} /></div></div>;
}

function DbStatus({ saving, error, lastSaved }) {
  if (error) return <span title={error} style={{ fontSize: 10, color: "#dc2626", fontWeight: 700 }}>⚠ DB Error - {error}</span>;
  if (saving) return <span style={{ fontSize: 10, color: "#3b6cb7", fontWeight: 700, display: "flex", alignItems: "center", gap: 4 }}><span style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: "#3b6cb7", animation: "pulse 1s infinite" }} />Saving to Supabase…</span>;
  return <span style={{ fontSize: 10, color: "#3a9e5f", fontWeight: 700 }}>✓ Synced{lastSaved ? ` · ${lastSaved}` : ""}</span>;
}

function Modal({ title, children, onClose, onSave, saveLabel = "Save" }) {
  return <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999 }}><div style={{ background: "#fff", borderRadius: 14, padding: 30, width: 660, maxHeight: "88vh", overflowY: "auto", boxShadow: "0 10px 40px rgba(0,0,0,0.2)" }}><div style={{ fontWeight: 900, fontSize: 16, color: "#1a2a4a", marginBottom: 20 }}>{title}</div>{children}<div style={{ display: "flex", gap: 10, marginTop: 22, justifyContent: "flex-end" }}><button onClick={onClose} style={{ background: "#f0f0f0", color: "#666", border: "none", borderRadius: 8, padding: "9px 22px", cursor: "pointer", fontWeight: 700 }}>Cancel</button><button onClick={onSave} style={{ background: "#1a2a4a", color: "#fff", border: "none", borderRadius: 8, padding: "9px 22px", cursor: "pointer", fontWeight: 800 }}>{saveLabel}</button></div></div></div>;
}

function Confirm({ message, onConfirm, onCancel }) {
  return <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}><div style={{ background: "#fff", borderRadius: 14, padding: 28, width: 380, boxShadow: "0 10px 40px rgba(0,0,0,0.2)" }}><div style={{ fontSize: 15, fontWeight: 700, color: "#1a2a4a", marginBottom: 18 }}>{message}</div><div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}><button onClick={onCancel} style={{ background: "#f0f0f0", color: "#666", border: "none", borderRadius: 8, padding: "8px 20px", cursor: "pointer", fontWeight: 700 }}>Cancel</button><button onClick={onConfirm} style={{ background: "#dc2626", color: "#fff", border: "none", borderRadius: 8, padding: "8px 20px", cursor: "pointer", fontWeight: 800 }}>Delete</button></div></div></div>;
}

function ProjectForm({ form, setForm }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
      {[["Project Name","name","text"],["Developer","developer","text"],["State","state","text"],["Cluster Lead","clusterLead","text"],["Owner","owner","text"],["Target FC","targetClose","text"]].map(([l,k]) => <div key={k}><label style={LBL}>{l}</label><input value={form[k]||""} onChange={e=>setForm(f=>({...f,[k]:e.target.value}))} style={INPUT}/></div>)}
      {[["Size (₦Bn)","size"],["Connections Planned","connections"],["Connections Installed","connectionsInstalled"],["Daily Rate","dailyRate"],["CAPEX/conn (₦)","capexPerConn"],["ARPU (₦)","arpu"],["Subsidy Expected (₦)","subsidyExpected"],["Subsidy Received (₦)","subsidyReceived"]].map(([l,k]) => <div key={k}><label style={LBL}>{l}</label><input type="number" value={form[k]??0} onChange={e=>setForm(f=>({...f,[k]:Number(e.target.value)}))} style={INPUT}/></div>)}
      {[["Stage Start","stageStart"],["Target Completion","targetCompletion"]].map(([l,k]) => <div key={k}><label style={LBL}>{l}</label><input type="date" value={form[k]||""} onChange={e=>setForm(f=>({...f,[k]:e.target.value}))} style={INPUT}/></div>)}
      <div><label style={LBL}>Stage</label><select value={form.stage} onChange={e=>setForm(f=>({...f,stage:e.target.value}))} style={INPUT}>{STAGES_LIST.map(s=><option key={s}>{s}</option>)}</select></div>
      <div><label style={LBL}>RAG</label><select value={form.rag} onChange={e=>setForm(f=>({...f,rag:e.target.value}))} style={INPUT}>{["Green","Amber","Red"].map(r=><option key={r}>{r}</option>)}</select></div>
      <div style={{gridColumn:"span 2"}}><label style={LBL}>Milestones</label><div style={{display:"flex",gap:20,marginTop:4}}>{[["LOI","loi"],["JDA","jda"],["Credit Approval","credit"],["Financial Close","fc"]].map(([l,k])=><label key={k} style={{display:"flex",alignItems:"center",gap:6,fontSize:13,cursor:"pointer"}}><input type="checkbox" checked={!!form[k]} onChange={e=>setForm(f=>({...f,[k]:e.target.checked}))}/> {l}</label>)}</div></div>
      <div style={{gridColumn:"span 2"}}><label style={LBL}>Issue / Blocker</label><input value={form.issue||""} onChange={e=>setForm(f=>({...f,issue:e.target.value}))} style={INPUT} placeholder="Leave blank if none"/></div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
function App() {
  const [projects, setProjects, projLoading, projErr] = useSupabaseTable("projects", SEED_PROJECTS);
  const [team, setTeam, teamLoading, teamErr] = useSupabaseTable("team", SEED_TEAM);
  const [issues, setIssues, issuesLoading, issuesErr] = useSupabaseTable("issues", SEED_ISSUES);
  const [deployment, setDeployment, deployLoading, deployErr] = useSupabaseTable("deployment", SEED_DEPLOYMENT);

  const loading = projLoading || teamLoading || issuesLoading || deployLoading;
  const dbError = projErr || teamErr || issuesErr || deployErr;

  const [tab, setTab] = useState("pipeline");
  const [viewMode, setViewMode] = useState("list");
  const [filterStage, setFilterStage] = useState("All");
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [projectModal, setProjectModal] = useState(null);
  const [issueModal, setIssueModal] = useState(null);
  const [siteModal, setSiteModal] = useState(null);
  const [teamModal, setTeamModal] = useState(null);

  const blankProject = () => ({ id: Date.now(), name: "", developer: "", state: "", stage: STAGES_LIST[0], clusterLead: "", rag: "Green", loi: false, jda: false, credit: false, fc: false, size: 0, connections: 0, connectionsInstalled: 0, dailyRate: 0, stageStart: "", targetCompletion: "", actualCompletion: "", subsidyExpected: 0, subsidyReceived: 0, capexPerConn: 0, arpu: 0, opex: 0, issue: "", owner: "", lastUpdate: today(), targetClose: "", timeToFirstPower: null, updateCompliance: 100, evidenceCompliance: 100 });
  const blankIssue = () => ({ id: Date.now(), project: "", category: ISSUE_CATS[0], description: "", owner: "", raised: today(), due: "", status: "Open", rag: "Amber" });
  const blankSite = () => ({ id: Date.now(), site: "", project: "", state: "", village: "", householdsPlanned: 0, householdsInstalled: 0, teams: 1, dailyRate: 0, startDate: today(), daysActive: 0 });
  const blankMember = () => ({ id: Date.now(), name: "", role: ROLES[0], assigned: 0, tasksDue: 0, overdue: 0, compliance: 100, rag: "Green" });

  const [pForm, setPForm] = useState(blankProject());
  const [iForm, setIForm] = useState(blankIssue());
  const [sForm, setSForm] = useState(blankSite());
  const [mForm, setMForm] = useState(blankMember());

  const flash = () => { setSaving(true); setTimeout(() => { setSaving(false); setLastSaved(new Date().toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit" })); }, 900); };

  const kpis = useMemo(() => {
    if (!projects) return {};
    const jdasSigned = projects.filter(p => p.jda).length;
    const loiCount = projects.filter(p => p.loi).length;
    const loiToJda = loiCount > 0 ? Math.round((jdasSigned / loiCount) * 100) : 0;
    const toSubmission = projects.length > 0 ? Math.round((projects.filter(p => ["Project Development", "Project Finance", "Financial Close"].includes(p.stage)).length / projects.length) * 100) : 0;
    const connectionsDelivered = projects.reduce((s, p) => s + (p.connectionsInstalled || 0), 0);
    const active = projects.filter(p => p.dailyRate > 0);
    const avgDailyRate = active.length ? Math.round(active.reduce((s, p) => s + p.dailyRate, 0) / active.length) : 0;
    const ttfp = projects.filter(p => p.timeToFirstPower != null);
    const avgTTFP = ttfp.length ? ttfp.reduce((s, p) => s + p.timeToFirstPower, 0) / ttfp.length : null;
    const avgUpdateCompliance = projects.length ? Math.round(projects.reduce((s, p) => s + p.updateCompliance, 0) / projects.length) : 0;
    const avgEvidenceCompliance = projects.length ? Math.round(projects.reduce((s, p) => s + p.evidenceCompliance, 0) / projects.length) : 0;
    return { jdasSigned, loiToJda, toSubmission, connectionsDelivered, avgDailyRate, avgTTFP, avgUpdateCompliance, avgEvidenceCompliance };
  }, [projects]);

  const stageGroups = useMemo(() => projects ? STAGES_META.map(s => ({ ...s, count: projects.filter(p => p.stage === s.label).length, val: projects.filter(p => p.stage === s.label).reduce((a, p) => a + p.size, 0) })) : [], [projects]);

  if (loading) return (
    <div style={{ minHeight: "100vh", background: "#f2f4f7", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Barlow','Segoe UI',sans-serif" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ width: 48, height: 48, border: "4px solid #3b6cb7", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 16px" }} />
        <div style={{ fontSize: 14, fontWeight: 700, color: "#1a2a4a" }}>Connecting to Supabase…</div>
        <div style={{ fontSize: 12, color: "#888", marginTop: 4 }}>Loading shared database</div>
      </div>
    </div>
  );

  const totalSize = projects.reduce((s, p) => s + p.size, 0);
  const loiCount = projects.filter(p => p.loi).length;
  const jdaCount = projects.filter(p => p.jda).length;
  const creditCount = projects.filter(p => p.credit).length;
  const filteredProjects = filterStage === "All" ? projects : projects.filter(p => p.stage === filterStage);
  const openIssues = issues.filter(i => i.status !== "Resolved").length;

  const saveProject = () => { if (!pForm.name.trim()) return alert("Project name is required"); projectModal === "add" ? setProjects(ps => [...ps, { ...pForm, id: Date.now() }]) : setProjects(ps => ps.map(p => p.id === projectModal ? { ...pForm } : p)); flash(); setProjectModal(null); };
  const saveIssue = () => { if (!iForm.project.trim() || !iForm.description.trim()) return alert("Project and description required"); issueModal === "add" ? setIssues(is => [...is, { ...iForm, id: Date.now() }]) : setIssues(is => is.map(i => i.id === issueModal ? { ...iForm } : i)); flash(); setIssueModal(null); };
  const updateIssueStatus = (id, status) => { setIssues(is => is.map(i => i.id === id ? { ...i, status, rag: status === "Resolved" ? "Green" : status === "Escalated" ? "Red" : "Amber" } : i)); flash(); };
  const saveSite = () => { if (!sForm.site.trim()) return alert("Site name is required"); siteModal === "add" ? setDeployment(ds => [...ds, { ...sForm, id: Date.now() }]) : setDeployment(ds => ds.map(d => d.id === siteModal ? { ...sForm } : d)); flash(); setSiteModal(null); };
  const saveMember = () => { if (!mForm.name.trim()) return alert("Name is required"); teamModal === "add" ? setTeam(ts => [...ts, { ...mForm, id: Date.now() }]) : setTeam(ts => ts.map(t => t.id === teamModal ? { ...mForm } : t)); flash(); setTeamModal(null); };
  const executeDelete = () => { const { type, id } = confirmDelete; if (type === "project") setProjects(ps => ps.filter(p => p.id !== id)); if (type === "issue") setIssues(is => is.filter(i => i.id !== id)); if (type === "site") setDeployment(ds => ds.filter(d => d.id !== id)); if (type === "member") setTeam(ts => ts.filter(t => t.id !== id)); flash(); setConfirmDelete(null); };

  return (
    <div style={{ minHeight: "100vh", background: "#f2f4f7", fontFamily: "'Barlow','Segoe UI',sans-serif", color: "#1a1a2e" }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}tbody tr:hover td{background:#f0f4ff!important}`}</style>

      {/* HEADER */}
      <div style={{ background: "#1a2a4a", padding: "0 28px", boxShadow: "0 2px 12px rgba(0,0,0,0.2)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 16, paddingBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 38, height: 38, background: "#3b6cb7", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, color: "#fff", fontSize: 18 }}>D</div>
            <div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", letterSpacing: 1.5, fontWeight: 700 }}>DREEF · INFRAIQ.AFRICA</div>
              <div style={{ fontSize: 18, fontWeight: 900, color: "#fff", letterSpacing: 0.3 }}>PROJECT PIPELINE MANAGER <span style={{ marginLeft: 10, fontSize: 10, background: "#3a9e5f", color: "#fff", padding: "3px 10px", borderRadius: 20, fontWeight: 700, verticalAlign: "middle", letterSpacing: 1 }}>MESH GRID</span></div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <div style={{ background: "rgba(255,255,255,0.08)", padding: "5px 12px", borderRadius: 8 }}><DbStatus saving={saving} error={dbError} lastSaved={lastSaved} /></div>
            {openIssues > 0 && <div style={{ background: "#dc2626", color: "#fff", padding: "4px 12px", borderRadius: 20, fontSize: 11, fontWeight: 700 }}>{openIssues} Open Issue{openIssues > 1 ? "s" : ""}</div>}
            <button onClick={() => { setPForm(blankProject()); setProjectModal("add"); }} style={{ background: "#3a9e5f", color: "#fff", border: "none", borderRadius: 8, padding: "9px 20px", cursor: "pointer", fontWeight: 800, fontSize: 12 }}>+ Add Project</button>
          </div>
        </div>
        <div style={{ display: "flex", gap: 2 }}>
          {TABS.map(t => <button key={t.id} onClick={() => setTab(t.id)} style={{ background: tab === t.id ? "#fff" : "transparent", color: tab === t.id ? "#1a2a4a" : "rgba(255,255,255,0.65)", border: "none", cursor: "pointer", padding: "8px 18px", borderRadius: "8px 8px 0 0", fontSize: 12, fontWeight: 800, letterSpacing: 0.5, transition: "all 0.15s" }}>{t.label}{t.id === "issues" && openIssues > 0 && <span style={{ marginLeft: 5, background: "#dc2626", color: "#fff", borderRadius: 10, padding: "0 5px", fontSize: 9 }}>{openIssues}</span>}</button>)}
        </div>
      </div>

      <div style={{ padding: "24px 28px", maxWidth: 1300, margin: "0 auto" }}>

        {/* ══ PIPELINE MANAGER ══ */}
        {tab === "pipeline" && (<>
          <div style={{ marginBottom: 26 }}>
            <SectionHeader label="PROJECT DEVELOPMENT STAGES" />
            <div style={{ display: "flex", gap: 0, alignItems: "stretch" }}>
              {stageGroups.map((s, i) => (
                <div key={s.label} style={{ display: "flex", alignItems: "center", flex: 1 }}>
                  <div onClick={() => setFilterStage(s.label === filterStage ? "All" : s.label)} style={{ background: s.color, borderRadius: 10, padding: "18px 18px", flex: 1, cursor: "pointer", boxShadow: filterStage === s.label ? "0 4px 18px rgba(0,0,0,0.22)" : "0 2px 8px rgba(0,0,0,0.10)", transform: filterStage === s.label ? "translateY(-3px)" : "none", transition: "all 0.15s", border: filterStage === s.label ? "2px solid #fff" : "2px solid transparent" }}>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.7)", fontWeight: 700, letterSpacing: 1, marginBottom: 2 }}>{s.count} PROJECT{s.count !== 1 ? "S" : ""}</div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: "#fff", marginBottom: 4 }}>{s.label}</div>
                    <div style={{ fontSize: 24, fontWeight: 900, color: "#fff", marginBottom: 10 }}>₦{s.val.toFixed(1)}Bn</div>
                    <div style={{ borderTop: "1px solid rgba(255,255,255,0.2)", paddingTop: 8 }}>{s.bullets.map((b, j) => <div key={j} style={{ display: "flex", gap: 5, alignItems: "flex-start", marginBottom: 3 }}><span style={{ color: "rgba(255,255,255,0.5)", fontSize: 8, marginTop: 2 }}>●</span><span style={{ fontSize: 11, color: "rgba(255,255,255,0.8)", lineHeight: 1.4 }}>{b}</span></div>)}</div>
                  </div>
                  {i < stageGroups.length - 1 && <div style={{ color: "#b0b8c8", fontSize: 22, padding: "0 5px", flexShrink: 0 }}>›</div>}
                </div>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: 26 }}>
            <SectionHeader label="PERFORMANCE MILESTONES" />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14 }}>
              {[{ label: "Letter of Intent Signed", value: loiCount, icon: "📋", color: "#3a9e5f" }, { label: "Joint Development Agreement Signed", value: jdaCount, icon: "📊", color: "#5aaa6b" }, { label: "Credit Committee Approval", value: creditCount, icon: "🛡️", color: "#2d5a3d" }, { label: "Financial Close", value: `₦${projects.filter(p => p.fc).reduce((s, p) => s + p.size, 0).toFixed(1)}Bn`, icon: "⚡", color: "#1a2a4a" }].map((m, i) => (
                <div key={i} style={{ background: m.color, borderRadius: 10, padding: "20px 20px", display: "flex", alignItems: "center", gap: 14, boxShadow: "0 2px 8px rgba(0,0,0,0.10)" }}>
                  <div style={{ width: 44, height: 44, borderRadius: "50%", background: "rgba(255,255,255,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>{m.icon}</div>
                  <div><div style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", fontWeight: 600, lineHeight: 1.3, marginBottom: 4 }}>{m.label}</div><div style={{ fontSize: 30, fontWeight: 900, color: "#fff", lineHeight: 1 }}>{m.value}</div></div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: 26 }}>
            <SectionHeader label="MESH GRID BUSINESS MODEL" />
            <div style={{ display: "grid", gridTemplateColumns: "180px 1fr 1fr", gap: 14 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {[{ label: "TOTAL PROJECT SIZE", value: `₦${totalSize.toFixed(1)}Bn`, bg: "#3b6cb7", icon: "⚡" }, { label: "TOTAL PROJECTS", value: projects.length, bg: "#1a2a4a", icon: "🔋" }].map(c => <div key={c.label} style={{ background: c.bg, borderRadius: 10, padding: "20px 18px", flex: 1 }}><div style={{ fontSize: 28, marginBottom: 8 }}>{c.icon}</div><div style={{ fontSize: 10, color: "rgba(255,255,255,0.65)", fontWeight: 700, letterSpacing: 1 }}>{c.label}</div><div style={{ fontSize: 24, fontWeight: 900, color: "#fff" }}>{c.value}</div></div>)}
              </div>
              <div style={{ background: "#fff", borderRadius: 10, padding: "20px 22px", boxShadow: "0 2px 8px rgba(0,0,0,0.07)" }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: "#1a2a4a", letterSpacing: 1, marginBottom: 14 }}>PIPELINE BY STAGE</div>
                <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}><Donut segments={stageGroups.map(s => ({ color: s.color, value: s.val || 0.01 }))} size={150} stroke={30} /></div>
                {stageGroups.map(s => <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}><div style={{ width: 10, height: 10, borderRadius: 2, background: s.color, flexShrink: 0 }} /><span style={{ fontSize: 11, color: "#555", flex: 1 }}>{s.label}</span><span style={{ fontSize: 11, fontWeight: 700 }}>₦{s.val.toFixed(1)}Bn</span></div>)}
              </div>
              <div style={{ background: "#fff", borderRadius: 10, overflow: "hidden", boxShadow: "0 2px 8px rgba(0,0,0,0.07)" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead><tr style={{ background: "#1a2a4a", color: "#fff" }}>{["PROJECT","LOI","JDA","CONN.","SIZE","SHARE"].map(h=><th key={h} style={{padding:"9px 10px",textAlign:"left",fontSize:9,fontWeight:800,letterSpacing:0.8}}>{h}</th>)}</tr></thead>
                  <tbody>
                    {projects.map((p,i)=><tr key={p.id} style={{background:i%2===0?"#f7f9fc":"#fff",borderBottom:"1px solid #eef"}}><td style={{padding:"7px 10px",fontWeight:600,color:"#1a2a4a",fontSize:11}}>{p.name.replace(" MeshGrid","")}</td><td style={{padding:"7px 10px",textAlign:"center"}}><Tick val={p.loi}/></td><td style={{padding:"7px 10px",textAlign:"center"}}><Tick val={p.jda}/></td><td style={{padding:"7px 10px",fontSize:11}}>{fmt(p.connections)}</td><td style={{padding:"7px 10px",fontWeight:700,fontSize:11}}>₦{p.size.toFixed(1)}Bn</td><td style={{padding:"7px 10px",color:"#3b6cb7",fontWeight:700,fontSize:11}}>{totalSize>0?((p.size/totalSize)*100).toFixed(1):0}%</td></tr>)}
                    <tr style={{background:"#1a2a4a",color:"#fff",fontWeight:800}}><td style={{padding:"8px 10px",fontSize:11}}>Total</td><td style={{padding:"8px 10px",textAlign:"center"}}>{loiCount}</td><td style={{padding:"8px 10px",textAlign:"center"}}>{jdaCount}</td><td style={{padding:"8px 10px",fontSize:11}}>{fmt(projects.reduce((s,p)=>s+p.connections,0))}</td><td style={{padding:"8px 10px",fontSize:11}}>₦{totalSize.toFixed(1)}Bn</td><td style={{padding:"8px 10px",fontSize:11}}>100%</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <SectionHeader label="PROJECTS REGISTER" />
              <div style={{ display: "flex", gap: 8 }}>
                <select value={filterStage} onChange={e=>setFilterStage(e.target.value)} style={{...INPUT,width:190,fontSize:12}}><option value="All">All Stages</option>{STAGES_LIST.map(s=><option key={s}>{s}</option>)}</select>
                <div style={{display:"flex",background:"#fff",borderRadius:8,overflow:"hidden",border:"1.5px solid #dde"}}>{[["list","☰"],["grid","⊞"]].map(([m,icon])=><button key={m} onClick={()=>setViewMode(m)} style={{background:viewMode===m?"#1a2a4a":"transparent",color:viewMode===m?"#fff":"#888",border:"none",padding:"7px 13px",cursor:"pointer",fontSize:16}}>{icon}</button>)}</div>
              </div>
            </div>
            {viewMode === "list" ? (
              <div style={{background:"#fff",borderRadius:10,overflow:"hidden",boxShadow:"0 2px 8px rgba(0,0,0,0.07)"}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                  <thead><tr style={{background:"#1a2a4a",color:"#fff"}}>{["PROJECT","DEVELOPER","STATE","STAGE","LEAD","CONN.","INSTALLED","RATE","SIZE","LOI","JDA","RAG","ISSUE",""].map(h=><th key={h} style={{padding:"10px 10px",textAlign:"left",fontSize:9,fontWeight:800,letterSpacing:0.8,whiteSpace:"nowrap"}}>{h}</th>)}</tr></thead>
                  <tbody>
                    {filteredProjects.map((p,i)=>(
                      <tr key={p.id} style={{background:i%2===0?"#f7f9fc":"#fff",borderBottom:"1px solid #eef"}}>
                        <td style={{padding:"9px 10px",fontWeight:700,color:"#1a2a4a"}}>{p.name}</td>
                        <td style={{padding:"9px 10px",color:"#666"}}>{p.developer}</td>
                        <td style={{padding:"9px 10px",color:"#666"}}>{p.state}</td>
                        <td style={{padding:"9px 10px"}}><StagePill stage={p.stage}/></td>
                        <td style={{padding:"9px 10px",color:"#555"}}>{p.clusterLead}</td>
                        <td style={{padding:"9px 10px"}}>{fmt(p.connections)}</td>
                        <td style={{padding:"9px 10px"}}><div style={{fontSize:11}}>{fmt(p.connectionsInstalled)}</div><ProgressBar value={p.connectionsInstalled} max={p.connections}/></td>
                        <td style={{padding:"9px 10px",color:p.dailyRate>=90?"#3a9e5f":p.dailyRate>=60?"#d97706":p.dailyRate>0?"#dc2626":"#aaa"}}>{p.dailyRate>0?`${p.dailyRate}/day`:"—"}</td>
                        <td style={{padding:"9px 10px",fontWeight:700}}>₦{p.size.toFixed(1)}Bn</td>
                        <td style={{padding:"9px 10px",textAlign:"center"}}><Tick val={p.loi}/></td>
                        <td style={{padding:"9px 10px",textAlign:"center"}}><Tick val={p.jda}/></td>
                        <td style={{padding:"9px 10px"}}><RagBadge status={p.rag}/></td>
                        <td style={{padding:"9px 10px",fontSize:10,color:p.issue?"#d97706":"#ccc",maxWidth:130}}>{p.issue||"—"}</td>
                        <td style={{padding:"9px 10px",whiteSpace:"nowrap"}}><button onClick={()=>{setPForm({...p});setProjectModal(p.id);}} style={EDIT_BTN}>✏️</button><button onClick={()=>setConfirmDelete({type:"project",id:p.id,label:p.name})} style={DEL_BTN}>🗑️</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",gap:14}}>
                {filteredProjects.map(p=>(
                  <div key={p.id} style={{background:"#fff",borderRadius:10,padding:18,boxShadow:"0 2px 8px rgba(0,0,0,0.07)",borderTop:`3px solid ${RAG_C[p.rag]}`}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:2}}>
                      <div style={{fontWeight:800,fontSize:13,color:"#1a2a4a"}}>{p.name}</div>
                      <div><button onClick={()=>{setPForm({...p});setProjectModal(p.id);}} style={EDIT_BTN}>✏️</button><button onClick={()=>setConfirmDelete({type:"project",id:p.id,label:p.name})} style={DEL_BTN}>🗑️</button></div>
                    </div>
                    <div style={{fontSize:11,color:"#888",marginBottom:8}}>{p.developer} · {p.state}</div>
                    <StagePill stage={p.stage}/>
                    <div style={{marginTop:10,marginBottom:6}}><div style={{fontSize:10,color:"#aaa",marginBottom:3}}>Connections: {fmt(p.connectionsInstalled)} / {fmt(p.connections)}</div><ProgressBar value={p.connectionsInstalled} max={p.connections}/></div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>{[["Size",`₦${p.size.toFixed(1)}Bn`],["Daily Rate",p.dailyRate?`${p.dailyRate}/day`:"—"],["ARPU",`₦${fmt(p.arpu)}`],["Target FC",p.targetClose||"—"]].map(([k,v])=><div key={k} style={{background:"#f5f7fa",borderRadius:6,padding:"5px 8px"}}><div style={{fontSize:9,color:"#aaa",fontWeight:700}}>{k}</div><div style={{fontSize:12,fontWeight:700,color:"#1a2a4a"}}>{v}</div></div>)}</div>
                    <div style={{display:"flex",gap:8,marginTop:10,justifyContent:"center"}}>{[["LOI",p.loi],["JDA",p.jda],["Credit",p.credit],["FC",p.fc]].map(([l,d])=><MilestoneDot key={l} label={l} done={d}/>)}</div>
                    {p.issue&&<div style={{marginTop:8,background:"#fef3cd",padding:"5px 10px",borderRadius:6,fontSize:11,color:"#856404"}}>⚠ {p.issue}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>)}

        {/* ══ KPI DASHBOARD ══ */}
        {tab === "kpi" && (<>
          <SectionHeader label="KPI DASHBOARD — MESH GRID" />
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:14,marginBottom:14}}>
            <KpiCard label="JDAs Signed" actual={kpis.jdasSigned} target={3} unit="" rag={ragFor(kpis.jdasSigned,3)} detail={`${loiCount} LOIs in pipeline`}/>
            <KpiCard label="LOI → JDA Conversion" actual={kpis.loiToJda} target={80} unit="%" rag={ragFor(kpis.loiToJda,80)} detail={`${jdaCount} of ${loiCount} converted`}/>
            <KpiCard label="Projects to Submission" actual={kpis.toSubmission} target={70} unit="%" rag={ragFor(kpis.toSubmission,70)} detail="At Dev or Finance stage"/>
            <KpiCard label="Connections Delivered" actual={kpis.connectionsDelivered} target={6000} unit="" rag={ragFor(kpis.connectionsDelivered,6000)} detail="Households installed"/>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:14,marginBottom:24}}>
            <KpiCard label="Daily Deployment Rate" actual={kpis.avgDailyRate} target={90} unit="/day" rag={ragFor(kpis.avgDailyRate,90)} detail="Avg across active sites"/>
            <KpiCard label="Time to First Power" actual={kpis.avgTTFP??"—"} target={3} unit=" days" rag={kpis.avgTTFP!=null?ragFor(kpis.avgTTFP,3,false):"Amber"} detail={kpis.avgTTFP?"Avg across projects":"No data yet"}/>
            <KpiCard label="Update Compliance" actual={kpis.avgUpdateCompliance} target={100} unit="%" rag={ragFor(kpis.avgUpdateCompliance,100)} detail="Avg across team"/>
            <KpiCard label="Evidence Compliance" actual={kpis.avgEvidenceCompliance} target={100} unit="%" rag={ragFor(kpis.avgEvidenceCompliance,100)} detail="Avg across team"/>
          </div>
          <div style={{background:"#fff",borderRadius:10,overflow:"hidden",boxShadow:"0 2px 8px rgba(0,0,0,0.07)"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
              <thead><tr style={{background:"#1a2a4a",color:"#fff"}}>{["METRIC","TARGET","ACTUAL","VARIANCE","RAG","PROGRESS"].map(h=><th key={h} style={{padding:"10px 16px",textAlign:"left",fontSize:10,fontWeight:800,letterSpacing:0.8}}>{h}</th>)}</tr></thead>
              <tbody>
                {[{metric:"JDAs Signed",target:"3",actual:kpis.jdasSigned,tNum:3,higher:true,unit:""},{metric:"LOI to JDA Conversion",target:"80%",actual:kpis.loiToJda,tNum:80,higher:true,unit:"%"},{metric:"Projects to Submission",target:"70%",actual:kpis.toSubmission,tNum:70,higher:true,unit:"%"},{metric:"Connections Delivered",target:"6,000",actual:kpis.connectionsDelivered,tNum:6000,higher:true,unit:""},{metric:"Daily Deployment Rate",target:"90/day",actual:kpis.avgDailyRate,tNum:90,higher:true,unit:"/day"},{metric:"Time to First Power",target:"3 days",actual:kpis.avgTTFP??"—",tNum:3,higher:false,unit:" days"},{metric:"Update Compliance",target:"100%",actual:kpis.avgUpdateCompliance,tNum:100,higher:true,unit:"%"},{metric:"Evidence Upload Compliance",target:"100%",actual:kpis.avgEvidenceCompliance,tNum:100,higher:true,unit:"%"}].map((row,i)=>{
                  const has=row.actual!=="—"&&row.actual!=null;
                  const rag=has?ragFor(row.actual,row.tNum,row.higher):"Amber";
                  const variance=has?(row.higher?row.actual-row.tNum:row.tNum-row.actual):null;
                  return <tr key={i} style={{background:i%2===0?"#f7f9fc":"#fff",borderBottom:"1px solid #eef"}}><td style={{padding:"11px 16px",fontWeight:700}}>{row.metric}</td><td style={{padding:"11px 16px",color:"#666"}}>{row.target}</td><td style={{padding:"11px 16px",fontWeight:700,color:"#1a2a4a"}}>{has?`${fmt(row.actual)}${row.unit}`:"—"}</td><td style={{padding:"11px 16px",color:variance>=0?"#3a9e5f":"#dc2626",fontWeight:700}}>{variance!==null?`${variance>=0?"+":""}${fmt(variance)}${row.unit}`:"—"}</td><td style={{padding:"11px 16px"}}><RagBadge status={rag}/></td><td style={{padding:"11px 16px",width:160}}>{has&&<ProgressBar value={row.actual} max={row.tNum}/>}</td></tr>;
                })}
              </tbody>
            </table>
          </div>
        </>)}

        {/* ══ DEPLOYMENT TRACKER ══ */}
        {tab === "deployment" && (<>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
            <SectionHeader label="DEPLOYMENT TRACKER"/>
            <button onClick={()=>{setSForm(blankSite());setSiteModal("add");}} style={{background:"#3b6cb7",color:"#fff",border:"none",borderRadius:8,padding:"8px 18px",cursor:"pointer",fontWeight:700,fontSize:12,marginBottom:14}}>+ Add Site</button>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:14,marginBottom:22}}>
            {deployment.map(site=>{
              const pctV=pct(site.householdsInstalled,site.householdsPlanned);
              const remaining=site.householdsPlanned-site.householdsInstalled;
              const projDays=site.dailyRate>0?Math.ceil(remaining/site.dailyRate):null;
              return <div key={site.id} style={{background:"#fff",borderRadius:10,padding:18,boxShadow:"0 2px 8px rgba(0,0,0,0.07)",borderTop:`3px solid ${pctV>=80?"#3a9e5f":pctV>=50?"#d97706":"#dc2626"}`}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:2}}><div style={{fontWeight:800,fontSize:13,color:"#1a2a4a"}}>{site.site}</div><div><button onClick={()=>{setSForm({...site});setSiteModal(site.id);}} style={EDIT_BTN}>✏️</button><button onClick={()=>setConfirmDelete({type:"site",id:site.id,label:site.site})} style={DEL_BTN}>🗑️</button></div></div>
                <div style={{fontSize:11,color:"#888",marginBottom:10}}>{site.project} · {site.village}, {site.state}</div>
                <ProgressBar value={site.householdsInstalled} max={site.householdsPlanned}/>
                <div style={{display:"flex",justifyContent:"space-between",marginTop:5,marginBottom:12}}><span style={{fontSize:11,color:"#666"}}>{fmt(site.householdsInstalled)} installed</span><span style={{fontSize:12,fontWeight:800,color:pctV>=80?"#3a9e5f":pctV>=50?"#d97706":"#dc2626"}}>{pctV}%</span><span style={{fontSize:11,color:"#666"}}>{fmt(site.householdsPlanned)} planned</span></div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6}}>{[["Daily Rate",`${site.dailyRate}/day`,site.dailyRate>=90?"Green":site.dailyRate>=60?"Amber":"Red"],["Teams",site.teams,"Green"],["Proj. Days",projDays?`${projDays}d`:"—","Amber"]].map(([k,v,r])=><div key={k} style={{background:RAG_LIGHT[r]||"#f5f5f5",borderRadius:6,padding:"5px 8px",textAlign:"center"}}><div style={{fontSize:9,color:"#888",fontWeight:700}}>{k}</div><div style={{fontSize:13,fontWeight:800,color:RAG_C[r]||"#555"}}>{v}</div></div>)}</div>
              </div>;
            })}
          </div>
          <div style={{background:"#fff",borderRadius:10,overflow:"hidden",boxShadow:"0 2px 8px rgba(0,0,0,0.07)"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
              <thead><tr style={{background:"#1a2a4a",color:"#fff"}}>{["SITE","PROJECT","STATE","VILLAGE","PLANNED","INSTALLED","TEAMS","DAILY RATE","DAYS ACTIVE","PROJ. COMPLETION",""].map(h=><th key={h} style={{padding:"10px 10px",textAlign:"left",fontSize:9,fontWeight:800,letterSpacing:0.7}}>{h}</th>)}</tr></thead>
              <tbody>
                {deployment.map((site,i)=>{
                  const remaining=site.householdsPlanned-site.householdsInstalled;
                  const projDays=site.dailyRate>0?Math.ceil(remaining/site.dailyRate):null;
                  const projDate=projDays?new Date(Date.now()+projDays*86400000).toLocaleDateString("en-NG",{day:"2-digit",month:"short",year:"numeric"}):"—";
                  return <tr key={site.id} style={{background:i%2===0?"#f7f9fc":"#fff",borderBottom:"1px solid #eef"}}>
                    <td style={{padding:"9px 10px",fontWeight:700}}>{site.site}</td>
                    <td style={{padding:"9px 10px",color:"#555",fontSize:11}}>{site.project.replace(" MeshGrid","")}</td>
                    <td style={{padding:"9px 10px",color:"#666"}}>{site.state}</td>
                    <td style={{padding:"9px 10px",color:"#666"}}>{site.village}</td>
                    <td style={{padding:"9px 10px"}}>{fmt(site.householdsPlanned)}</td>
                    <td style={{padding:"9px 10px",fontWeight:700}}>{fmt(site.householdsInstalled)}</td>
                    <td style={{padding:"9px 10px",textAlign:"center"}}>{site.teams}</td>
                    <td style={{padding:"9px 10px",color:site.dailyRate>=90?"#3a9e5f":site.dailyRate>=60?"#d97706":"#dc2626",fontWeight:700}}>{site.dailyRate}/day</td>
                    <td style={{padding:"9px 10px"}}>{site.daysActive}d</td>
                    <td style={{padding:"9px 10px",fontSize:11,color:"#555"}}>{projDate}</td>
                    <td style={{padding:"9px 10px",whiteSpace:"nowrap"}}><button onClick={()=>{setSForm({...site});setSiteModal(site.id);}} style={EDIT_BTN}>✏️</button><button onClick={()=>setConfirmDelete({type:"site",id:site.id,label:site.site})} style={DEL_BTN}>🗑️</button></td>
                  </tr>;
                })}
                <tr style={{background:"#1a2a4a",color:"#fff",fontWeight:800,fontSize:12}}><td colSpan={4} style={{padding:"9px 10px"}}>TOTAL</td><td style={{padding:"9px 10px"}}>{fmt(deployment.reduce((s,d)=>s+d.householdsPlanned,0))}</td><td style={{padding:"9px 10px"}}>{fmt(deployment.reduce((s,d)=>s+d.householdsInstalled,0))}</td><td colSpan={5}/></tr>
              </tbody>
            </table>
          </div>
        </>)}

        {/* ══ TEAM PERFORMANCE ══ */}
        {tab === "team" && (<>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
            <SectionHeader label="TEAM PERFORMANCE"/>
            <button onClick={()=>{setMForm(blankMember());setTeamModal("add");}} style={{background:"#1a2a4a",color:"#fff",border:"none",borderRadius:8,padding:"8px 18px",cursor:"pointer",fontWeight:700,fontSize:12,marginBottom:14}}>+ Add Member</button>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:14,marginBottom:22}}>
            {team.map(m=>(
              <div key={m.id} style={{background:"#fff",borderRadius:10,padding:18,boxShadow:"0 2px 8px rgba(0,0,0,0.07)",borderTop:`3px solid ${RAG_C[m.rag]}`}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                  <div><div style={{fontWeight:800,fontSize:14,color:"#1a2a4a"}}>{m.name}</div><div style={{fontSize:11,color:"#888"}}>{m.role}</div></div>
                  <div style={{display:"flex",flexDirection:"column",gap:4,alignItems:"flex-end"}}><RagBadge status={m.rag}/><div><button onClick={()=>{setMForm({...m});setTeamModal(m.id);}} style={EDIT_BTN}>✏️</button><button onClick={()=>setConfirmDelete({type:"member",id:m.id,label:m.name})} style={DEL_BTN}>🗑️</button></div></div>
                </div>
                {[["Projects Assigned",m.assigned,false],["Tasks Due",m.tasksDue,false],["Overdue Tasks",m.overdue,true]].map(([k,v,warn])=><div key={k} style={{display:"flex",justifyContent:"space-between",padding:"4px 0",borderBottom:"1px solid #f0f0f0"}}><span style={{fontSize:12,color:"#666"}}>{k}</span><span style={{fontSize:12,fontWeight:700,color:warn&&v>0?"#dc2626":"#1a2a4a"}}>{v}</span></div>)}
                <div style={{marginTop:10}}><div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><span style={{fontSize:10,color:"#888"}}>Update Compliance</span><span style={{fontSize:11,fontWeight:700,color:m.compliance>=90?"#3a9e5f":m.compliance>=70?"#d97706":"#dc2626"}}>{m.compliance}%</span></div><ProgressBar value={m.compliance} max={100}/></div>
              </div>
            ))}
          </div>
          <div style={{background:"#fff",borderRadius:10,overflow:"hidden",boxShadow:"0 2px 8px rgba(0,0,0,0.07)"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
              <thead><tr style={{background:"#1a2a4a",color:"#fff"}}>{["NAME","ROLE","PROJECTS","TASKS DUE","OVERDUE","UPDATE COMPLIANCE","RAG",""].map(h=><th key={h} style={{padding:"10px 14px",textAlign:"left",fontSize:10,fontWeight:800,letterSpacing:0.8}}>{h}</th>)}</tr></thead>
              <tbody>
                {team.map((m,i)=><tr key={m.id} style={{background:i%2===0?"#f7f9fc":"#fff",borderBottom:"1px solid #eef"}}>
                  <td style={{padding:"10px 14px",fontWeight:700}}>{m.name}</td>
                  <td style={{padding:"10px 14px",color:"#666"}}>{m.role}</td>
                  <td style={{padding:"10px 14px",textAlign:"center"}}>{m.assigned}</td>
                  <td style={{padding:"10px 14px",textAlign:"center"}}>{m.tasksDue}</td>
                  <td style={{padding:"10px 14px",textAlign:"center",color:m.overdue>0?"#dc2626":"#3a9e5f",fontWeight:700}}>{m.overdue}</td>
                  <td style={{padding:"10px 14px"}}><span style={{color:m.compliance>=90?"#3a9e5f":m.compliance>=70?"#d97706":"#dc2626",fontWeight:700}}>{m.compliance}%</span></td>
                  <td style={{padding:"10px 14px"}}><RagBadge status={m.rag}/></td>
                  <td style={{padding:"10px 14px",whiteSpace:"nowrap"}}><button onClick={()=>{setMForm({...m});setTeamModal(m.id);}} style={EDIT_BTN}>✏️</button><button onClick={()=>setConfirmDelete({type:"member",id:m.id,label:m.name})} style={DEL_BTN}>🗑️</button></td>
                </tr>)}
              </tbody>
            </table>
          </div>
        </>)}

        {/* ══ MANAGEMENT SUPPORT ══ */}
        {tab === "issues" && (<>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
            <SectionHeader label="MANAGEMENT SUPPORT LOG"/>
            <button onClick={()=>{setIForm(blankIssue());setIssueModal("add");}} style={{background:"#e07b39",color:"#fff",border:"none",borderRadius:8,padding:"8px 18px",cursor:"pointer",fontWeight:700,fontSize:12,marginBottom:14}}>+ Log Issue</button>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:14,marginBottom:20}}>
            {[["Open",issues.filter(i=>i.status==="Open").length,"Amber"],["In Progress",issues.filter(i=>i.status==="In Progress").length,"Amber"],["Escalated",issues.filter(i=>i.status==="Escalated").length,"Red"],["Resolved",issues.filter(i=>i.status==="Resolved").length,"Green"]].map(([s,c,r])=>(
              <div key={s} style={{background:"#fff",borderRadius:10,padding:"14px 18px",borderLeft:`4px solid ${RAG_C[r]}`,boxShadow:"0 2px 8px rgba(0,0,0,0.07)"}}>
                <div style={{fontSize:10,color:"#888",fontWeight:700,letterSpacing:1}}>{s.toUpperCase()}</div>
                <div style={{fontSize:28,fontWeight:900,color:RAG_C[r]}}>{c}</div>
              </div>
            ))}
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            {issues.map(issue=>(
              <div key={issue.id} style={{background:"#fff",borderRadius:10,padding:18,boxShadow:"0 2px 8px rgba(0,0,0,0.07)",borderLeft:`4px solid ${RAG_C[issue.rag]||"#ccc"}`,opacity:issue.status==="Resolved"?0.6:1}}>
                <div style={{display:"flex",gap:14,alignItems:"flex-start",flexWrap:"wrap"}}>
                  <div style={{flex:3,minWidth:220}}>
                    <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:4}}><RagBadge status={issue.rag}/><span style={{fontWeight:700,fontSize:13,color:"#1a2a4a"}}>{issue.project}</span><span style={{background:"#eef",padding:"2px 8px",borderRadius:10,fontSize:10,color:"#555"}}>{issue.category}</span></div>
                    <div style={{fontSize:13,color:"#444"}}>{issue.description}</div>
                  </div>
                  <div style={{flex:1,minWidth:100}}><div style={{fontSize:10,color:"#aaa"}}>Owner</div><div style={{fontWeight:700,fontSize:13}}>{issue.owner}</div></div>
                  <div style={{flex:1,minWidth:90}}><div style={{fontSize:10,color:"#aaa"}}>Due</div><div style={{fontSize:12,color:issue.due&&new Date(issue.due)<new Date()&&issue.status!=="Resolved"?"#dc2626":"#333"}}>{issue.due||"—"}</div></div>
                  <div style={{flex:1,minWidth:110}}><div style={{fontSize:10,color:"#aaa",marginBottom:4}}>Status</div><select value={issue.status} onChange={e=>updateIssueStatus(issue.id,e.target.value)} style={{...INPUT,width:120,fontSize:11}}>{ISSUE_STATUSES.map(s=><option key={s}>{s}</option>)}</select></div>
                  <div style={{display:"flex",gap:6,alignSelf:"center"}}>
                    <button onClick={()=>{setIForm({...issue});setIssueModal(issue.id);}} style={EDIT_BTN}>✏️</button>
                    {issue.status!=="Resolved"&&<button onClick={()=>updateIssueStatus(issue.id,"Resolved")} style={{background:"#d4edda",color:"#1a5632",border:"none",borderRadius:6,padding:"6px 12px",cursor:"pointer",fontSize:11,fontWeight:700}}>✓ Resolve</button>}
                    <button onClick={()=>setConfirmDelete({type:"issue",id:issue.id,label:issue.description.substring(0,50)})} style={DEL_BTN}>🗑️</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>)}
      </div>

      {/* MODALS */}
      {projectModal!==null&&<Modal title={projectModal==="add"?"Add Mesh Grid Project":"Edit Project"} onClose={()=>setProjectModal(null)} onSave={saveProject}><ProjectForm form={pForm} setForm={setPForm}/></Modal>}

      {issueModal!==null&&<Modal title={issueModal==="add"?"Log Issue":"Edit Issue"} onClose={()=>setIssueModal(null)} onSave={saveIssue}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          <div><label style={LBL}>Project</label><input value={iForm.project} onChange={e=>setIForm(f=>({...f,project:e.target.value}))} style={INPUT}/></div>
          <div><label style={LBL}>Owner</label><input value={iForm.owner} onChange={e=>setIForm(f=>({...f,owner:e.target.value}))} style={INPUT}/></div>
          <div><label style={LBL}>Date Raised</label><input type="date" value={iForm.raised} onChange={e=>setIForm(f=>({...f,raised:e.target.value}))} style={INPUT}/></div>
          <div><label style={LBL}>Due Date</label><input type="date" value={iForm.due} onChange={e=>setIForm(f=>({...f,due:e.target.value}))} style={INPUT}/></div>
          <div><label style={LBL}>Category</label><select value={iForm.category} onChange={e=>setIForm(f=>({...f,category:e.target.value}))} style={INPUT}>{ISSUE_CATS.map(c=><option key={c}>{c}</option>)}</select></div>
          <div><label style={LBL}>RAG</label><select value={iForm.rag} onChange={e=>setIForm(f=>({...f,rag:e.target.value}))} style={INPUT}>{["Green","Amber","Red"].map(r=><option key={r}>{r}</option>)}</select></div>
          <div><label style={LBL}>Status</label><select value={iForm.status} onChange={e=>setIForm(f=>({...f,status:e.target.value}))} style={INPUT}>{ISSUE_STATUSES.map(s=><option key={s}>{s}</option>)}</select></div>
          <div style={{gridColumn:"span 2"}}><label style={LBL}>Description</label><textarea value={iForm.description} onChange={e=>setIForm(f=>({...f,description:e.target.value}))} style={{...INPUT,height:80,resize:"vertical"}}/></div>
        </div>
      </Modal>}

      {siteModal!==null&&<Modal title={siteModal==="add"?"Add Deployment Site":"Edit Site"} onClose={()=>setSiteModal(null)} onSave={saveSite}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          {[["Site Name","site","text"],["Project","project","text"],["State","state","text"],["Village","village","text"],["Households Planned","householdsPlanned","number"],["Households Installed","householdsInstalled","number"],["Teams Assigned","teams","number"],["Daily Rate","dailyRate","number"],["Days Active","daysActive","number"],["Start Date","startDate","date"]].map(([l,k,t])=><div key={k}><label style={LBL}>{l}</label><input type={t} value={sForm[k]??""} onChange={e=>setSForm(f=>({...f,[k]:t==="number"?Number(e.target.value):e.target.value}))} style={INPUT}/></div>)}
        </div>
      </Modal>}

      {teamModal!==null&&<Modal title={teamModal==="add"?"Add Team Member":"Edit Team Member"} onClose={()=>setTeamModal(null)} onSave={saveMember}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          <div><label style={LBL}>Name</label><input value={mForm.name} onChange={e=>setMForm(f=>({...f,name:e.target.value}))} style={INPUT}/></div>
          <div><label style={LBL}>Role</label><select value={mForm.role} onChange={e=>setMForm(f=>({...f,role:e.target.value}))} style={INPUT}>{ROLES.map(r=><option key={r}>{r}</option>)}</select></div>
          {[["Projects Assigned","assigned"],["Tasks Due","tasksDue"],["Overdue Tasks","overdue"],["Update Compliance (%)","compliance"]].map(([l,k])=><div key={k}><label style={LBL}>{l}</label><input type="number" value={mForm[k]} onChange={e=>setMForm(f=>({...f,[k]:Number(e.target.value)}))} style={INPUT}/></div>)}
          <div><label style={LBL}>RAG</label><select value={mForm.rag} onChange={e=>setMForm(f=>({...f,rag:e.target.value}))} style={INPUT}>{["Green","Amber","Red"].map(r=><option key={r}>{r}</option>)}</select></div>
        </div>
      </Modal>}

      {confirmDelete&&<Confirm message={`Delete "${confirmDelete.label}"? This cannot be undone.`} onConfirm={executeDelete} onCancel={()=>setConfirmDelete(null)}/>}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
