"use client";
import { useEffect, useState } from "react";
import Logo from "./Logo";

type Mode = "login" | "register";

const DOC = [
  { n: 1, page: 4, t: "Full-time employees accrue 20 paid vacation days per calendar year, available from the first day of employment." },
  { n: 2, page: 7, t: "Up to 5 unused vacation days may be carried over to the following year. Carried-over days expire on March 31." },
];
const QA = [
  { q: "How many vacation days do I get?", a: "Full-time employees get 20 paid vacation days a year [1]. Up to 5 unused days carry over [2]." },
  { q: "When do carried-over days expire?", a: "Carried-over days expire on March 31 [2]." },
  { q: "Do I need approval for time off?", a: "I couldn't find that in your documents." },
];
const FEATURES = [
  ["Every answer shows its source", "Numbered citations point to the exact passage and page, so you can check an answer before you rely on it."],
  ["Honest when it doesn't know", "If your documents don't contain the answer, Rewind says so instead of guessing."],
  ["PDF, Word, text and Markdown", "Upload .pdf, .docx, .txt or .md files up to 15 MB each. Drag in several at once."],
  ["Search one file or all of them", "Tick specific documents to limit a question to them, or tick none to search everything."],
  ["Answers appear as they're written", "Start reading the first words straight away instead of waiting for the full reply."],
  ["Your documents stay yours", "Each account searches only its own files, and you can delete any document at any time."],
];
const STEPS = [
  ["Upload your files", "Drop in PDFs, Word files or notes. Rewind reads and indexes them in the background."],
  ["Ask in plain language", "Type a question the way you'd ask a colleague. Follow-up questions keep the context of the chat."],
  ["Check the source", "Click a citation number to see the passage and page behind each statement."],
];
const PLANS = [
  { name: "Free", q: "20 questions a day", d: "5 documents", note: "Everything you need to try Rewind on real files.", cta: "Sign up free", pro: false },
  { name: "Pro", q: "500 questions a day", d: "100 documents", note: "For heavy daily use across a large library.", cta: "Coming soon", pro: true },
];
const FAQ = [
  ["Which file types can I upload?", "PDF, DOCX, TXT and Markdown (.md). Each file can be up to 15 MB."],
  ["What if the answer isn't in my documents?", "Rewind tells you it couldn't find it. It only answers from the sources it shows you."],
  ["Can I ask about just one document?", "Yes. Tick one or more documents in the list and questions are limited to those. With none ticked, Rewind searches all of them."],
  ["Does it remember what I asked earlier?", "Within a chat, yes. Recent messages are used as context, so follow-ups work. Start a new chat to reset."],
  ["What happens when I reach the daily limit?", "Questions pause until the next day. Your documents and past answers stay where they are."],
  ["Can I delete my documents?", "Yes. Deleting a document removes it and its stored file from your account."],
];

function Demo() {
  const [qi, setQi] = useState(0);
  const [run, setRun] = useState(0);
  const [n, setN] = useState(0);
  const [active, setActive] = useState<number | null>(null);
  const a = QA[qi].a;

  useEffect(() => {
    setN(0);
    setActive(null);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setN(a.length); return; }
    const id = setInterval(() => setN((x) => (x >= a.length ? x : x + 2)), 28);
    return () => clearInterval(id);
  }, [run, a]);

  const ask = (i: number) => { setQi(i); setRun((r) => r + 1); };
  const parts = a.slice(0, n).split(/(\[\d\])/g).map((s, i) => {
    const m = /^\[(\d)\]$/.exec(s);
    return m ? <button key={i} className="cite" onClick={() => setActive(+m[1])} aria-label={`Rewind to source ${m[1]}`}>{m[1]}</button> : <span key={i}>{s}</span>;
  });
  const src = DOC.find((p) => p.n === active);

  return (
    <div className="demo glass" aria-label="Live demo">
      <div className="d-bar">
        <b>Employee-Handbook.pdf</b>
        <span className={`rw ${src ? "on" : ""}`}>
          <svg width="16" height="12" viewBox="0 0 16 12" aria-hidden="true"><path d="M7 1 2 6l5 5M14 1 9 6l5 5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          {src ? `Rewound to page ${src.page}` : "Click a number to rewind"}
        </span>
      </div>
      <div className="d-doc">
        {DOC.map((p) => (
          <p key={p.n} className={`pas ${active === p.n ? "on" : ""}`}><small>Page {p.page}</small>{p.t}</p>
        ))}
      </div>
      <div className="d-chat" aria-live="polite">
        <div className="msg user">{QA[qi].q}</div>
        <div className="msg assistant">{parts}</div>
      </div>
      <div className="chips">
        {QA.map((x, i) => (
          <button key={x.q} className="chip" onClick={() => ask(i)} aria-pressed={qi === i}>{x.q}</button>
        ))}
      </div>
    </div>
  );
}

export default function Landing({ onAuth }: { onAuth: (m: Mode) => void }) {
  const [solid, setSolid] = useState(false);
  const [open, setOpen] = useState(false);
  const [faq, setFaq] = useState<number | null>(0);

  useEffect(() => {
    const f = () => setSolid(window.scrollY > 8);
    f();
    window.addEventListener("scroll", f, { passive: true });
    return () => window.removeEventListener("scroll", f);
  }, []);

  const close = () => setOpen(false);

  return (
    <div className="landing">
      <header className={`l-nav ${solid || open ? "solid" : ""} ${open ? "open" : ""}`}>
        <div className="l-wrap">
          <a href="#top" aria-label="Rewind home"><Logo /></a>
          <nav className="l-links" aria-label="Main">
            <a href="#how" onClick={close}>How it works</a>
            <a href="#features" onClick={close}>Features</a>
            <a href="#pricing" onClick={close}>Pricing</a>
            <a href="#faq" onClick={close}>FAQ</a>
          </nav>
          <div className="l-cta">
            <button className="btn" onClick={() => onAuth("login")}>Sign in</button>
            <button className="btn primary" onClick={() => onAuth("register")}>Sign up</button>
          </div>
          <button className="btn l-burger" onClick={() => setOpen(!open)} aria-expanded={open} aria-label="Menu">{open ? "✕" : "☰"}</button>
        </div>
      </header>

      <main id="top">
        <section className="gh">
          <div className="gh-sky" aria-hidden="true"><i /><i /><i /><i /></div>
          <div className="gh-grain" aria-hidden="true" />
          <div className="gh-copy">
            <h1>Rewind</h1>
            <p className="gh-line">Ask your documents. Get the exact page.</p>
            <div className="gh-actions">
              <button className="gh-btn" onClick={() => onAuth("register")}>Sign up free</button>
              <button className="gh-btn ghost" onClick={() => onAuth("login")}>Sign in</button>
            </div>
          </div>
          <div className="gh-ruler" aria-hidden="true">
            <div className="tk"><div className="mk" style={{ left: "64%" }}><span>◂◂ p. 7</span></div></div>
            <div className="lb"><span>p. 1</span><span>Answers with receipts</span><span>p. 24</span></div>
          </div>
        </section>

        <section className="l-wrap l-sec demo-sec" id="demo">
          <h2>Ask a question. Rewind to the source.</h2>
          <Demo />
        </section>

        <section className="l-wrap l-sec" id="how">
          <h2>From a pile of files to a checked answer in three steps</h2>
          <ol className="steps">
            {STEPS.map(([t, d], i) => (
              <li key={t}><span className="big-n">{i + 1}</span><h3>{t}</h3><p>{d}</p></li>
            ))}
          </ol>
        </section>

        <section className="l-wrap l-sec" id="features">
          <h2>Built so you never have to take an answer on trust</h2>
          <div className="feats">
            {FEATURES.map(([t, d]) => (
              <div className="feat" key={t}><h3>{t}</h3><p>{d}</p></div>
            ))}
          </div>
        </section>

        <section className="l-wrap l-sec" id="pricing">
          <h2>Start free, move up when you need more</h2>
          <div className="plans">
            {PLANS.map((p) => (
              <div key={p.name} className={`plan glass ${p.pro ? "pro" : ""}`}>
                <h3>{p.name}{p.pro && <span className="soon">Coming soon</span>}</h3>
                <p className="plan-big">{p.q}</p>
                <p className="plan-big">{p.d}</p>
                <p className="muted">{p.note}</p>
                <button className={`btn ${p.pro ? "" : "primary"}`} disabled={p.pro} onClick={() => onAuth("register")}>{p.cta}</button>
              </div>
            ))}
          </div>
        </section>

        <section className="l-wrap l-sec faq-sec" id="faq">
          <h2>Questions people ask first</h2>
          <div className="faq">
            {FAQ.map(([q, a], i) => (
              <div key={q} className={`faq-i ${faq === i ? "open" : ""}`}>
                <button onClick={() => setFaq(faq === i ? null : i)} aria-expanded={faq === i}>{q}<i aria-hidden="true">{faq === i ? "–" : "+"}</i></button>
                {faq === i && <p>{a}</p>}
              </div>
            ))}
          </div>
        </section>

        <section className="l-wrap l-sec">
          <div className="final glass">
            <h2>Upload your first document and ask it something</h2>
            <div className="hero-actions">
              <button className="btn primary big" onClick={() => onAuth("register")}>Sign up free</button>
              <button className="btn big" onClick={() => onAuth("login")}>Sign in</button>
            </div>
          </div>
        </section>
      </main>

      <footer className="l-wrap l-foot">
        <Logo height={24} />
        <span className="muted">Chat with your documents. Every answer cites its source.</span>
      </footer>
    </div>
  );
}