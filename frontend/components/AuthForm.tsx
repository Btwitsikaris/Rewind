"use client";
import { useState } from "react";
import { api, setToken } from "@/lib/api";
import GoogleButton, { GOOGLE_CLIENT_ID } from "./GoogleButton";
import Logo from "./Logo";
import TurnstileWidget, { TURNSTILE_SITE_KEY } from "./TurnstileWidget";

type Mode = "login" | "register";
const LABELS = ["", "Too short", "Okay", "Good", "Strong"];

function strength(p: string) {
  if (!p) return 0;
  if (p.length < 8) return 1;
  const s = [p.length >= 12, /[a-z]/.test(p) && /[A-Z]/.test(p), /\d/.test(p), /[^A-Za-z0-9]/.test(p)].filter(Boolean).length;
  return Math.min(4, 1 + Math.max(1, s));
}

function Pane({ mode, on, onAuth, onSwitch }: { mode: Mode; on: boolean; onAuth: () => void; onSwitch: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [shake, setShake] = useState(0);
  const [busy, setBusy] = useState(false);
  const [captcha, setCaptcha] = useState("");
  const [capReset, setCapReset] = useState(0);

  const reg = mode === "register";
  const okEmail = /\S+@\S+\.\S+/.test(email);
  const level = strength(password);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const payload = reg ? { email, password, captcha_token: captcha } : { email, password };
      const r = await api<{ token: string }>(`/auth/${mode}`, { method: "POST", body: JSON.stringify(payload) });
      setToken(r.token);
      onAuth();
    } catch (err) {
      const m = (err as Error).message;
      setError(m === "Failed to fetch" ? "Can't reach the server. Check that the backend is running." : m);
      setShake((s) => s + 1);
      if (reg) { setCaptcha(""); setCapReset((n) => n + 1); }
    } finally {
      setBusy(false);
    }
  }

  async function google(credential: string) {
    setBusy(true);
    setError("");
    try {
      const r = await api<{ token: string }>("/auth/google", { method: "POST", body: JSON.stringify({ credential }) });
      setToken(r.token);
      onAuth();
    } catch (err) {
      const m = (err as Error).message;
      setError(m === "Failed to fetch" ? "Can't reach the server. Check that the backend is running." : m);
      setShake((s) => s + 1);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className={`sl-form ${reg ? "sl-up" : "sl-in"} ${on ? "on" : ""}`} onSubmit={submit} aria-hidden={!on}>
      <div key={shake} className={`sl-box ${shake ? "shake" : ""}`}>
        <h1>{reg ? "Create account" : "Sign in"}</h1>
        <p className="sub">{reg ? "Free plan: 20 questions a day and 5 documents." : "Use your email and password"}</p>

        {GOOGLE_CLIENT_ID && (
          <>
            {on && <GoogleButton text={reg ? "signup_with" : "signin_with"} onCredential={google} onError={setError} />}
            <div className="or"><span>or</span></div>
          </>
        )}

        <label className="field">
          <span>Email</span>
          <div className="inp">
            <input type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
            {okEmail && <b className="tick" aria-hidden="true">✓</b>}
          </div>
        </label>

        <label className="field">
          <span>Password</span>
          <div className="inp">
            <input type={show ? "text" : "password"} placeholder={reg ? "8+ characters" : "Your password"} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} maxLength={72} autoComplete={reg ? "new-password" : "current-password"} />
            <button type="button" className="link eye" onClick={() => setShow(!show)} aria-pressed={show}>{show ? "Hide" : "Show"}</button>
          </div>
        </label>

        {reg && (
          <div className="str" data-level={level} aria-live="polite">
            <div><i /><i /><i /><i /></div>
            <small>{password ? LABELS[level] : "Use 8 or more characters. Mix letters, numbers and symbols."}</small>
          </div>
        )}

        {reg && on && TURNSTILE_SITE_KEY && <TurnstileWidget onToken={setCaptcha} resetKey={capReset} onError={setError} />}

        {error && <div className="error" role="alert">{error}</div>}
        <button className="btn primary" disabled={busy || (reg && !!TURNSTILE_SITE_KEY && !captcha)}>
          {busy ? <><i className="spin" /> Please wait</> : reg ? "Create account" : "Sign in"}
        </button>
        <p className="au-sw sl-sw-m">
          {reg ? "Already have an account? " : "New to Rewind? "}
          <button type="button" className="link" onClick={onSwitch}>{reg ? "Sign in" : "Create an account"}</button>
        </p>
      </div>
    </form>
  );
}

export default function AuthForm({ onAuth, initialMode = "login", onBack }: { onAuth: () => void; initialMode?: Mode; onBack?: () => void }) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const reg = mode === "register";
  const flip = () => setMode(reg ? "login" : "register");

  return (
    <div className="au">
      {onBack && <button type="button" className="link au-back" onClick={onBack}>← Back to home</button>}
      <div className="au-m-logo"><Logo height={30} /></div>
      <div className={`sl ${reg ? "reg" : ""}`}>
        <Pane mode="login" on={!reg} onAuth={onAuth} onSwitch={flip} />
        <Pane mode="register" on={reg} onAuth={onAuth} onSwitch={flip} />
        <div className="sl-ovc">
          <div className="sl-ov">
            <div className="sl-op sl-ol">
              <Logo height={30} white />
              <h2>Welcome back</h2>
              <p>Sign in to pick up your documents and ask new questions.</p>
              <button type="button" className="ghost" onClick={flip} tabIndex={reg ? 0 : -1}>Sign in</button>
            </div>
            <div className="sl-op sl-or">
              <Logo height={30} white />
              <h2>Ask your documents anything</h2>
              <p>Create a free account and see the page behind every answer.</p>
              <button type="button" className="ghost" onClick={flip} tabIndex={reg ? -1 : 0}>Sign up</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}