"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import AuthForm from "@/components/AuthForm";
import ChatPanel from "@/components/ChatPanel";
import DocsPanel from "@/components/DocsPanel";
import Landing from "@/components/Landing";
import Logo from "@/components/Logo";
import { api, getToken, Me, setToken } from "@/lib/api";

export default function Home() {
  const [ready, setReady] = useState(false);
  const [me, setMe] = useState<Me | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [view, setView] = useState<"landing" | "login" | "register">("landing");
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) setMenu(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMenu(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [menu]);

  const loadMe = useCallback(async () => {
    if (!getToken()) { setMe(null); return; }
    try { setMe(await api<Me>("/me")); } catch { setToken(null); setMe(null); }
  }, []);

  useEffect(() => { loadMe().finally(() => setReady(true)); }, [loadMe]);

  const pct = me ? Math.min(100, (me.questions_today / me.questions_per_day) * 100) : 0;

  return (
    <>
      {me && <div className="dash-bg" aria-hidden="true"><i /><i /><b /></div>}
      <div className="app">
        {!ready ? null : me ? (
          <>
            <header className="topbar">
              <Logo height={28} />
              <div className="acct" ref={menuRef}>
                <button className="avatar" onClick={() => setMenu(!menu)} aria-haspopup="menu" aria-expanded={menu} aria-label="Account menu" title={me.email}>
                  {me.email.charAt(0).toUpperCase()}
                </button>
                {menu && (
                  <div className="acct-menu" role="menu">
                    <div className="am-top">
                      <span className="avatar sm" aria-hidden="true">{me.email.charAt(0).toUpperCase()}</span>
                      <div><b>{me.email.split("@")[0]}</b><small>{me.email}</small></div>
                    </div>
                    <div className="am-row"><span>Plan</span><span className="badge">{me.plan}</span></div>
                    <div className="am-use">
                      <div className="am-row"><span>Questions today</span><b>{me.questions_today}/{me.questions_per_day}</b></div>
                      <span className="meter" title={`${me.questions_today} of ${me.questions_per_day} questions used today`}><i style={{ width: `${pct}%` }} /></span>
                    </div>
                    <div className="am-row"><span>Document limit</span><b>{me.max_documents}</b></div>
                    <button className="btn am-out" role="menuitem" onClick={() => { setMenu(false); setToken(null); setMe(null); setView("landing"); }}>Sign out</button>
                  </div>
                )}
              </div>
            </header>
            <main className="shell">
              <DocsPanel selected={selected} onSelect={setSelected} />
              <ChatPanel selected={selected} onAsked={loadMe} />
            </main>
          </>
        ) : view === "landing" ? (
          <Landing onAuth={setView} />
        ) : (
          <AuthForm key={view} initialMode={view} onAuth={loadMe} onBack={() => setView("landing")} />
        )}
      </div>
    </>
  );
}