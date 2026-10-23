import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Activity, ArrowDownToLine, ArrowUpFromLine, ClipboardCheck, LayoutDashboard, LogOut, RefreshCw, ShieldCheck, Users } from "lucide-react";
import { supabase, supabaseConfigured } from "./lib/supabase";

type Section = "overview" | "users" | "deposits" | "withdrawals" | "investments" | "plans" | "audit";
type AdminIdentity = { id: string; user_id: string; role: string; permissions: string[] };
type Metric = { label: string; value: string; detail: string };
const sections: { id: Section; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "users", label: "Users", icon: Users },
  { id: "deposits", label: "Deposits", icon: ArrowDownToLine },
  { id: "withdrawals", label: "Withdrawals", icon: ArrowUpFromLine },
  { id: "investments", label: "Investments", icon: Activity },
  { id: "plans", label: "Plans", icon: ClipboardCheck },
  { id: "audit", label: "Audit log", icon: ShieldCheck },
];

export default function App() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [admin, setAdmin] = useState<AdminIdentity | null>(null);
  const [section, setSection] = useState<Section>("overview");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [colorMode, setColorMode] = useState<"light" | "dark">("light");

  const verifyAdmin = useCallback(async () => {
    if (!supabase) return;
    const { data: userResult } = await supabase.auth.getUser();
    if (!userResult.user) {
      setUserEmail(null); setAdmin(null); setRows([]); setMetrics([]); return;
    }
    setUserEmail(userResult.user.email ?? "Authenticated administrator");
    const { data, error } = await supabase.from("admin_user").select("id,user_id,role,permissions").eq("user_id", userResult.user.id).maybeSingle();
    if (error || !data) {
      setAdmin(null);
      setMessage("Your login is valid, but this account is not registered as an administrator. No administrative data or actions are enabled.");
      setRows([]); setMetrics([]);
      return;
    }
    setAdmin({ id: data.id, user_id: data.user_id, role: data.role ?? "admin", permissions: Array.isArray(data.permissions) ? data.permissions : [] });
    setMessage("");
  }, []);

  useEffect(() => {
    if (!supabase) return;
    void verifyAdmin();
    const { data } = supabase.auth.onAuthStateChange(() => { void verifyAdmin(); });
    return () => data.subscription.unsubscribe();
  }, [verifyAdmin]);

  const hasPermission = (permission: string) => !!admin && (admin.permissions.includes("*") || admin.permissions.includes(permission));
  const canViewUsers = hasPermission("manage_users") || hasPermission("view_users") || admin?.role === "super_admin";
  const canViewTransactions = hasPermission("view_transactions") || hasPermission("manage_transactions") || hasPermission("approve_transactions");
  const canViewAudit = hasPermission("view_audit") || hasPermission("view_audit_log") || admin?.role === "super_admin";

  const refreshSection = useCallback(async () => {
    if (!supabase || !admin) return;
    setLoading(true); setMessage("");
    try {
      if (section === "overview") {
        const [users, tx, active] = await Promise.all([
          canViewUsers ? supabase.from("user_profile").select("user_id", { count: "exact", head: true }) : Promise.resolve({ count: null, error: null }),
          canViewTransactions ? supabase.from("transaction").select("id", { count: "exact", head: true }) : Promise.resolve({ count: null, error: null }),
          hasPermission("manage_investments") || hasPermission("manage_users") ? supabase.from("user_investment").select("id", { count: "exact", head: true }).eq("status", "active") : Promise.resolve({ count: null, error: null }),
        ]);
        const failure = users.error || tx.error || active.error;
        if (failure) throw failure;
        setMetrics([
          { label: "Registered users", value: users.count == null ? "Restricted" : String(users.count), detail: "Database count · permission-gated" },
          { label: "Transactions", value: tx.count == null ? "Restricted" : String(tx.count), detail: "All visible transaction records" },
          { label: "Active investments", value: active.count == null ? "Restricted" : String(active.count), detail: "Status: active" },
        ]);
        setRows([]);
      } else if (section === "users") {
        if (!canViewUsers) throw new Error("Your admin role does not permit user access.");
        const { data, error } = await supabase.rpc("admin_search_users_bdx", { p_query: query.trim(), p_limit: 100 });
        if (error) throw error;
        setRows((data ?? []) as Record<string, unknown>[]);
      } else if (section === "deposits" || section === "withdrawals") {
        if (!canViewTransactions) throw new Error("Your admin role does not permit transaction access.");
        const type = section === "deposits" ? "deposit" : "withdraw";
        const { data, error } = await supabase.from("transaction").select("id,user_id,type,amount,currency,status,approval_status,method,note,created_at").eq("type", type).order("created_at", { ascending: false }).limit(200);
        if (error) throw error;
        setRows((data ?? []) as Record<string, unknown>[]);
      } else if (section === "investments") {
        if (!hasPermission("manage_investments") && !hasPermission("manage_users")) throw new Error("Your admin role does not permit investment access.");
        const { data, error } = await supabase.from("user_investment").select("id,user_id,plan_id,principal,currency,daily_rate,duration_days,status,credited_profit,started_at").order("created_at", { ascending: false }).limit(200);
        if (error) throw error;
        setRows((data ?? []) as Record<string, unknown>[]);
      } else if (section === "plans") {
        if (!hasPermission("manage_investments") && !hasPermission("manage_users")) throw new Error("Your admin role does not permit plan access.");
        const { data, error } = await supabase.from("investment_plan_catalog").select("id,name,min_amount,max_amount,duration_days,daily_rate,active,updated_at").order("min_amount");
        if (error) throw error;
        setRows((data ?? []) as Record<string, unknown>[]);
      } else {
        if (!canViewAudit) throw new Error("Your admin role does not permit audit log access.");
        const { data, error } = await supabase.from("admin_action_audit").select("id,action,user_id,target_id,reason,old_values,new_values,created_at").order("created_at", { ascending: false }).limit(200);
        if (error) throw error;
        setRows((data ?? []) as Record<string, unknown>[]);
      }
    } catch (err) {
      setRows([]);
      setMetrics([]);
      setMessage(err instanceof Error ? err.message : "Unable to load this section safely.");
    } finally { setLoading(false); }
  }, [admin, section, query, canViewUsers, canViewTransactions, canViewAudit]);

  useEffect(() => { if (admin) void refreshSection(); }, [admin, refreshSection]);

  async function signIn(event: FormEvent) {
    event.preventDefault();
    if (!supabase) return;
    setBusy(true); setMessage("");
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) setMessage("Sign-in failed. Check your credentials or contact the system administrator.");
    else { setPassword(""); await verifyAdmin(); }
  }
  async function signOut() { if (supabase) await supabase.auth.signOut(); setAdmin(null); setUserEmail(null); setRows([]); setMetrics([]); }

  if (!supabaseConfigured || !supabase) return <main className="center"><section className="login-card"><Brand/><h1>Configuration required</h1><p>Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your existing Supabase project. These are public browser settings only; never use a service-role key.</p><p className="muted">Financial operations remain disabled in this state.</p></section></main>;

  if (!userEmail) return <main className="center"><section className="login-card"><Brand/><h1>Administrator sign in</h1><p>Use an existing authorized account. Public admin registration is not provided.</p><form onSubmit={signIn}><label>Email<input type="email" autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)} required/></label><label>Password<input type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} required/></label><button className="primary" disabled={busy}>{busy ? "Signing in…" : "Sign in securely"}</button></form>{message && <p role="status" className="notice">{message}</p>}<p className="footnote"><ShieldCheck size={15}/> Authenticated login is not the same as admin authorization.</p></section></main>;

  return <div className={colorMode === "dark" ? "layout dark" : "layout"}><aside className="sidebar"><Brand/>{sections.map(item=><button key={item.id} className={section===item.id?"nav active":"nav"} onClick={()=>{setSection(item.id);setRows([]);setMessage("");}}><item.icon size={18}/>{item.label}</button>)}<div className="sidebar-bottom"><span className="muted small">{userEmail}<br/>{admin ? admin.role : "Authorization pending"}</span><button className="nav" onClick={signOut}><LogOut size={18}/> Sign out</button></div></aside><main className="workspace"><header><div><p className="eyebrow">GLOBAL SHARES EARN</p><h1>{sections.find(n=>n.id===section)?.label}</h1><p className="subhead">USD accounting · verified session permissions</p></div><div className="header-actions"><button className="ghost" onClick={()=>setColorMode(v=>v==="light"?"dark":"light")}>{colorMode==="light"?"Dark mode":"Light mode"}</button><button className="ghost" onClick={()=>void refreshSection()} disabled={loading}><RefreshCw size={15}/> Refresh</button></div></header>
    {!admin && <section className="warning"><ShieldCheck size={20}/><div><strong>Admin access not verified</strong><p>{message || "No administrative data is being shown."}</p></div></section>}
    {admin && message && <div role="alert" className="error-banner">{message}</div>}
    {admin && section==="overview" && <section className="metric-grid">{metrics.map(m=><article className="metric" key={m.label}><span>{m.label}</span><strong>{m.value}</strong><small>{m.detail}</small></article>)}</section>}
    {admin && ["users","deposits","withdrawals","investments","plans","audit"].includes(section) && <section className="panel"><div className="panel-head"><div><h2>{sections.find(n=>n.id===section)?.label}</h2><p>Live database records · values are displayed only when database policies allow access.</p></div><div className="list-actions">{(section==="users") && <input aria-label="Search users" value={query} placeholder="Search users…" onChange={e=>setQuery(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")void refreshSection();}}/>}<button className="ghost" onClick={()=>void refreshSection()} disabled={loading}><RefreshCw size={14}/> Load</button></div></div>
    {loading?<div className="empty-state">Loading from Supabase…</div>:rows.length===0?<div className="empty-state">No records to display, or access was restricted. Check the message above and confirm the admin role and RLS policies.</div>:<div className="table-wrap"><table><thead><tr>{Object.keys(rows[0]).map(key=><th key={key}>{key.replaceAll("_"," ")}</th>)}</tr></thead><tbody>{rows.map((row,i)=><tr key={String(row.id??row.user_id??i)}>{Object.entries(row).map(([key,value])=><td key={key}>{value===null||value===undefined?"—":typeof value==="object"?JSON.stringify(value):String(value)}</td>)}</tr>)}</tbody></table></div>}</section>}
    {admin && section==="overview" && <section className="warning info"><ShieldCheck size={20}/><div><strong>Financial operations are read-only in this build</strong><p>No direct balance mutation, deposit approval, withdrawal settlement, profit credit, or plan-edit control is exposed until each operation is connected to a verified server-side RPC with authorization, idempotency and audit logging.</p></div></section>}
    <footer>Authenticated user: {userEmail} · {admin ? "Admin authorization checked" : "Admin authorization not granted"} · Customer balances are never changed by this portal build.</footer></main></div>;
}
function Brand() { return <div className="brand"><div className="brand-mark">G</div><div><strong>GSE <span>ADMIN</span></strong><small>Secure operations</small></div></div>; }
