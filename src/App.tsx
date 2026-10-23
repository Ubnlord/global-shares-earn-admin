import { useEffect, useState, type FormEvent } from "react";
import { Activity, ArrowDownToLine, ArrowUpFromLine, ClipboardList, LayoutDashboard, LogOut, ShieldCheck, Users } from "lucide-react";
import { supabase, supabaseConfigured } from "./lib/supabase";

type Section = "overview" | "users" | "deposits" | "withdrawals" | "audit";

export default function App() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [section, setSection] = useState<Section>("overview");

  useEffect(() => {
    if (!supabase) return;
    void supabase.auth.getSession().then(({ data }) => setSessionEmail(data.session?.user.email ?? null));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setSessionEmail(session?.user.email ?? null));
    return () => data.subscription.unsubscribe();
  }, []);

  async function signIn(event: FormEvent) {
    event.preventDefault();
    if (!supabase) return;
    setBusy(true); setMessage("");
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) setMessage("Sign-in failed. Check your credentials or contact the system administrator.");
    else setMessage("Signed in. Administrative authorization must still be verified by the database before any privileged data or action is enabled.");
  }

  async function signOut() {
    if (supabase) await supabase.auth.signOut();
    setPassword(""); setMessage("");
  }

  if (!supabaseConfigured || !supabase) {
    return <main className="center"><section className="login-card"><Brand/><h1>Admin configuration required</h1><p>Set the public Supabase project URL and anon/publishable key in the deployment environment. Do not add a service-role key to the browser.</p><p className="muted">No financial data or admin actions are available in this unconfigured state.</p></section></main>;
  }

  if (!sessionEmail) {
    return <main className="center"><section className="login-card"><Brand/><h1>Administrator sign in</h1><p>Use an existing authorized account. Admin registration is not available here.</p><form onSubmit={signIn}><label>Email<input type="email" autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)} required/></label><label>Password<input type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} required/></label><button className="primary" disabled={busy}>{busy ? "Signing in…" : "Sign in securely"}</button></form>{message && <p role="status" className="notice">{message}</p>}<p className="footnote"><ShieldCheck size={15}/> Protected access · Server-side authorization required</p></section></main>;
  }

  const nav: { id: Section; label: string; icon: typeof LayoutDashboard }[] = [
    {id:"overview",label:"Overview",icon:LayoutDashboard},{id:"users",label:"Users",icon:Users},{id:"deposits",label:"Deposits",icon:ArrowDownToLine},{id:"withdrawals",label:"Withdrawals",icon:ArrowUpFromLine},{id:"audit",label:"Audit log",icon:ClipboardList}
  ];
  return <div className="layout"><aside className="sidebar"><Brand/>{nav.map(item=><button key={item.id} className={section===item.id?"nav active":"nav"} onClick={()=>setSection(item.id)}><item.icon size={18}/>{item.label}</button>)}<div className="sidebar-bottom"><span className="muted small">{sessionEmail}</span><button className="nav" onClick={signOut}><LogOut size={18}/> Sign out</button></div></aside><main className="workspace"><header><div><p className="eyebrow">GLOBAL SHARES EARN</p><h1>{nav.find(n=>n.id===section)?.label}</h1></div><span className="secure-pill"><ShieldCheck size={16}/> Authenticated session</span></header><section className="warning"><ShieldCheck size={20}/><div><strong>Safe initialization mode</strong><p>Authentication is connected, but this starter portal intentionally does not display customer records or permit financial actions until database-backed admin role checks and audited RPC integrations are implemented and verified.</p></div></section><section className="empty-state"><Activity size={30}/><h2>{section==="overview"?"Admin workspace initialized":nav.find(n=>n.id===section)?.label+" integration pending"}</h2><p>Live financial metrics and operations will appear here only after authorization and data-access policies are verified.</p></section><footer>USD accounting · Least privilege · No browser-side balance mutations</footer></main></div>;
}

function Brand() { return <div className="brand"><div className="brand-mark">G</div><div><strong>GSE <span>ADMIN</span></strong><small>Secure operations</small></div></div>; }
