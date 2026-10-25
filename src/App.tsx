import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Activity, ArrowDownToLine, ArrowUpFromLine, ClipboardCheck, LayoutDashboard, LogOut, Menu, Moon, ShieldCheck, Sun, Users, X } from "lucide-react";
import { supabase, supabaseConfigured } from "./lib/supabase";

type Section = "overview" | "users" | "deposits" | "withdrawals" | "investments" | "plans" | "profit" | "audit";
type AdminIdentity = { id: string; user_id: string; role: string; permissions: string[] };
type Metric = { label: string; value: string; detail: string };
const sections: { id: Section; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "users", label: "Users", icon: Users },
  { id: "deposits", label: "Deposits", icon: ArrowDownToLine },
  { id: "withdrawals", label: "Withdrawals", icon: ArrowUpFromLine },
  { id: "investments", label: "Investments", icon: Activity },
  { id: "plans", label: "Plans", icon: ClipboardCheck },
  { id: "profit", label: "Manual profit", icon: Activity },
  { id: "audit", label: "Audit log", icon: ShieldCheck },
];

export default function App() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [admin, setAdmin] = useState<AdminIdentity | null>(null);
  const [section, setSection] = useState<Section>("overview");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [colorMode, setColorMode] = useState<"light" | "dark">("light");
  const [profitUserId, setProfitUserId] = useState("");
  const [profitReason, setProfitReason] = useState("");

  const verifyAdminForUser = useCallback(async (user: { id: string; email?: string } | null) => {
    if (!supabase) return;
    if (!user) {
      setUserEmail(null); setAdmin(null); setRows([]); setMetrics([]); setMessage("");
      return;
    }
    setUserEmail(user.email ?? "Authenticated administrator");
    const { data, error } = await supabase.from("admin_user").select("id,user_id,role,permissions").eq("user_id", user.id).maybeSingle();
    if (error || !data) {
      setAdmin(null);
      setMessage(error
        ? "Unable to verify administrator access: " + error.message
        : "Your login is valid, but this account is not registered as an administrator. No administrative data or actions are enabled.");
      setRows([]); setMetrics([]);
      return;
    }
    setAdmin({ id: data.id, user_id: data.user_id, role: data.role ?? "admin", permissions: Array.isArray(data.permissions) ? data.permissions : [] });
    setMessage("");
  }, []);

  const verifyAdmin = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      setMessage("Could not restore the saved session. Please sign in again.");
      return;
    }
    await verifyAdminForUser(data.session?.user ? { id: data.session.user.id, email: data.session.user.email } : null);
  }, [verifyAdminForUser]);

  useEffect(() => {
    if (!supabase) return;
    void verifyAdmin();
    // Do not call Supabase auth methods from inside onAuthStateChange: doing so can
    // deadlock the auth lock during INITIAL_SESSION and make a page refresh appear to sign out.
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      window.setTimeout(() => {
        void verifyAdminForUser(session?.user ? { id: session.user.id, email: session.user.email } : null);
      }, 0);
    });
    return () => data.subscription.unsubscribe();
  }, [verifyAdmin, verifyAdminForUser]);

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
      // Supabase/PostgREST errors are plain objects in some runtime paths, not always Error instances.
      // Surface their safe message/code so the actual schema or policy failure can be diagnosed.
      const detail = err && typeof err === "object"
        ? ("message" in err && typeof err.message === "string" ? err.message
          : "details" in err && typeof err.details === "string" ? err.details
          : "hint" in err && typeof err.hint === "string" ? err.hint
          : "code" in err && typeof err.code === "string" ? "Database error (" + err.code + ")"
          : "")
        : typeof err === "string" ? err : "";
      setMessage(detail || "Unable to load this section. Tap Load again; if it persists, check the Supabase schema and row-level security policies.");
      console.error("Admin section load failed", { section, error: err });
    } finally { setLoading(false); }
  }, [admin, section, query, canViewUsers, canViewTransactions, canViewAudit]);

  useEffect(() => { if (admin) void refreshSection(); }, [admin, refreshSection]);

  // Automatically refresh the currently visible section every 60 seconds.
  // Skip a tick while a request/action is in progress to avoid overlapping writes or reads.
  useEffect(() => {
    if (!admin) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible" && !loading) void refreshSection();
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [admin, loading, refreshSection]);

  async function creditDailyProfit(event: FormEvent) {
    event.preventDefault();
    if (!supabase || !admin || (!hasPermission("manage_users") && admin.role !== "super_admin" && !hasPermission("*"))) {
      setMessage("Your administrator role does not permit manual profit credits."); return;
    }
    if (!profitUserId.trim() || profitReason.trim().length < 5) { setMessage("Enter a user UUID and a reason of at least 5 characters."); return; }
    const confirmed = window.confirm("This existing RPC credits one calculated daily profit for every eligible active USD investment belonging to this user for the current UTC date. It does not accept a per-investment amount/date. Continue?");
    if (!confirmed) return;
    setLoading(true); setMessage("");
    const { data, error } = await supabase.rpc("admin_add_daily_investment_profit", { p_user_id: profitUserId.trim(), p_reason: profitReason.trim() });
    setLoading(false);
    if (error) setMessage("Profit credit failed: " + error.message);
    else setMessage("RPC result: " + JSON.stringify(data) + ". Review the audit log and user ledger before any further action.");
  }

  async function setUserBlocked(row: Record<string, unknown>, blocked: boolean) {
    if (!supabase || !admin || (!hasPermission("manage_users") && admin.role !== "super_admin" && !hasPermission("*"))) {
      setMessage("Your administrator role does not permit account status changes."); return;
    }
    const userId = String(row.user_id ?? "");
    if (!userId) { setMessage("User ID is missing from this search result."); return; }
    const reason = window.prompt("Enter the required audit reason for " + (blocked ? "blocking" : "unblocking") + " this account:");
    if (!reason || reason.trim().length < 5) { setMessage("Action cancelled. Enter a reason of at least 5 characters."); return; }
    if (!window.confirm("Confirm " + (blocked ? "block" : "unblock") + " for user " + userId + "?")) return;
    setLoading(true); setMessage("");
    const { error } = await supabase.rpc("admin_set_user_block", { p_user_id: userId, p_blocked: blocked, p_reason: reason.trim() });
    setLoading(false);
    if (error) setMessage("Account status change failed: " + error.message);
    else { setMessage("Account status updated by the protected database function."); await refreshSection(); }
  }

  async function runTransactionAction(row: Record<string, unknown>, action: "approve" | "reject" | "settle") {
    if (!supabase || !admin || !hasPermission("manage_transactions") && !hasPermission("approve_transactions") && !hasPermission("*")) {
      setMessage("Your administrator role does not permit transaction actions."); return;
    }
    const transactionId = String(row.id ?? "");
    if (!transactionId) { setMessage("Transaction ID is missing."); return; }
    const reason = window.prompt("Enter the required audit reason for this action:");
    if (!reason || reason.trim().length < 5) { setMessage("Action cancelled. Enter a reason of at least 5 characters."); return; }
    const isDeposit = section === "deposits";
    const rpcName = action === "settle" ? "admin_settle_transaction"
      : action === "approve" ? (isDeposit ? "admin_approve_deposit" : "admin_approve_withdrawal")
      : (isDeposit ? "admin_reject_deposit" : "admin_reject_withdrawal");
    if (!window.confirm("Confirm " + action + " for transaction " + transactionId + "? This will call the protected database operation.")) return;
    setLoading(true); setMessage("");
    const { error } = await supabase.rpc(rpcName, { p_transaction_id: transactionId, p_reason: reason.trim() });
    setLoading(false);
    if (error) setMessage("Transaction action failed: " + error.message);
    else { setMessage("Action completed by the database. Refreshing records."); await refreshSection(); }
  }

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

  return <div className={colorMode === "dark" ? "layout dark" : "layout"}><div className="mobile-topbar"><Brand/><div className="mobile-header-actions"><button className="ghost header-theme-button" onClick={()=>setColorMode(v=>v==="light"?"dark":"light")} aria-label={colorMode==="light"?"Enable dark mode":"Enable light mode"}>{colorMode==="light"?<Moon size={18}/>:<Sun size={18}/>}<span>{colorMode==="light"?"Dark mode":"Light mode"}</span></button><button className="mobile-menu-button" aria-label={mobileMenuOpen ? "Close navigation menu" : "Open navigation menu"} aria-expanded={mobileMenuOpen} onClick={()=>setMobileMenuOpen(v=>!v)}>{mobileMenuOpen ? <X size={22}/> : <Menu size={22}/>}<span>{mobileMenuOpen ? "Close" : "Menu"}</span></button></div></div><aside className={mobileMenuOpen ? "sidebar mobile-open" : "sidebar"}><div className="desktop-brand"><Brand/></div>{sections.map(item=><button key={item.id} className={section===item.id?"nav active":"nav"} onClick={()=>{setSection(item.id);setRows([]);setMessage("");setMobileMenuOpen(false);}}><item.icon size={18}/>{item.label}</button>)}<div className="sidebar-bottom"><span className="muted small">{userEmail}<br/>{admin ? admin.role : "Authorization pending"}</span><button className="nav" onClick={()=>{setMobileMenuOpen(false);void signOut();}}><LogOut size={18}/> Sign out</button></div></aside><main className="workspace"><header><div><p className="eyebrow">SECURE OPERATIONS</p><h1>{sections.find(n=>n.id===section)?.label}</h1><p className="subhead">USD accounting · verified session permissions</p></div><div className="header-actions"><button className="ghost desktop-theme-button" onClick={()=>setColorMode(v=>v==="light"?"dark":"light")} aria-label={colorMode==="light"?"Enable dark mode":"Enable light mode"}>{colorMode==="light"?<Moon size={17}/>:<Sun size={17}/>} {colorMode==="light"?"Dark mode":"Light mode"}</button><span className="refresh-status"><span className="live-dot"/> Auto-updating</span></div></header>
    {!admin && <section className="warning"><ShieldCheck size={20}/><div><strong>Admin access not verified</strong><p>{message || "No administrative data is being shown."}</p></div></section>}
    {admin && message && <div role="alert" className="error-banner">{message}</div>}
    {admin && section==="profit" && <section className="panel"><div className="panel-head"><div><h2>Manual daily investment profit</h2><p>Uses the existing server-side RPC; this is not a per-investment amount/date workflow.</p></div></div><form className="operation-form" onSubmit={creditDailyProfit}><label>User ID (UUID)<input value={profitUserId} onChange={e=>setProfitUserId(e.target.value)} placeholder="Target user's UUID" required /></label><label>Reason for audit trail<textarea value={profitReason} onChange={e=>setProfitReason(e.target.value)} minLength={5} placeholder="Explain why this daily credit is being applied" required /></label><div className="warning"><ShieldCheck size={18}/><div><strong>Important behavior</strong><p>The existing RPC calculates credits for all eligible active USD investments for this user on the current UTC date, with duplicate protection. It cannot select one investment, choose a custom amount, or backdate a profit date. Do not use it if those are required.</p></div></div><button className="primary" disabled={loading || (!hasPermission("manage_users") && admin.role!=="super_admin" && !hasPermission("*"))}>{loading?"Processing…":"Preview policy and credit via protected RPC"}</button></form></section>}
    {admin && section==="overview" && <section className="metric-grid">{metrics.map(m=><article className="metric" key={m.label}><span>{m.label}</span><strong>{m.value}</strong><small>{m.detail}</small></article>)}</section>}
    {admin && ["users","deposits","withdrawals","investments","plans","audit"].includes(section) && <section className="panel"><div className="panel-head"><div><h2>{sections.find(n=>n.id===section)?.label}</h2><p>Live database records · values are displayed only when database policies allow access.</p></div><div className="list-actions">{(section==="users") && <input aria-label="Search users" value={query} placeholder="Search users…" onChange={e=>setQuery(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")void refreshSection();}}/>}<span className="muted small" aria-live="polite">{loading ? "Updating…" : "Updates automatically"}</span></div></div>
    {loading?<div className="empty-state">Loading from Supabase…</div>:rows.length===0?<div className="empty-state">No records to display, or access was restricted. Check the message above and confirm the admin role and RLS policies.</div>:<div className="table-wrap"><table><thead><tr>{Object.keys(rows[0]).map(key=><th key={key}>{key.replaceAll("_"," ")}</th>)}{(section==="deposits"||section==="withdrawals"||section==="users")&&<th>Actions</th>}</tr></thead><tbody>{rows.map((row,i)=><tr key={String(row.id??row.user_id??i)}>{Object.entries(row).map(([key,value])=><td key={key}>{value===null||value===undefined?"—":typeof value==="object"?JSON.stringify(value):String(value)}</td>)}{(section==="deposits"||section==="withdrawals")&&<td><div className="row-actions"><button className="action approve" disabled={loading} onClick={()=>void runTransactionAction(row,"approve")}>Approve</button><button className="action reject" disabled={loading} onClick={()=>void runTransactionAction(row,"reject")}>Reject</button>{section==="withdrawals"&&<button className="action settle" disabled={loading} onClick={()=>void runTransactionAction(row,"settle")}>Settle</button>}</div></td>}{section==="users"&&<td><div className="row-actions"><button className="action reject" disabled={loading} onClick={()=>void setUserBlocked(row,true)}>Block</button><button className="action approve" disabled={loading} onClick={()=>void setUserBlocked(row,false)}>Unblock</button></div></td>}</tr>)}</tbody></table></div>}</section>}
    {admin && section==="overview" && <section className="warning info"><ShieldCheck size={20}/><div><strong>Financial operations are protected by server-side RPCs</strong><p>Deposit and withdrawal approval, rejection, and settlement call existing database RPCs with a mandatory reason. Other financial controls remain disabled until their dedicated RPCs and end-to-end safeguards are verified.</p></div></section>}
    <footer>Authenticated user: {userEmail} · {admin ? "Admin authorization checked" : "Admin authorization not granted"} · Any financial action is performed only by the protected database RPC invoked by an authorized administrator.</footer></main></div>;
}
function Brand() { return <div className="brand"><div className="brand-mark">G</div><div><strong>GSE <span>ADMIN</span></strong><small>Secure operations</small></div></div>; }
