"use client";
import { useEffect, useRef, useState } from "react";
import { Msg, streamChat } from "@/lib/api";

const SUGGESTIONS = ["Summarize this document", "What are the key points?", "List the main skills or topics", "Find any dates or numbers"];

const STEPS = [
  "Searching your documents",
  "Reading the best pages",
  "Connecting the dots",
  "Rewinding to the exact page",
  "Writing your answer",
];

// Shown while waiting for the first token: a page being scanned, plus a status line that moves through the steps.
function Thinking() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((n) => Math.min(n + 1, STEPS.length - 1)), 2200);
    return () => clearInterval(t);
  }, []);
  return (
    <span className="think" role="status" aria-live="polite">
      <svg className="think-ico" viewBox="0 0 24 24" aria-hidden="true">
        <rect className="pg" x="4" y="2" width="16" height="20" rx="3" />
        <line className="ln ln1" x1="8" y1="8" x2="16" y2="8" />
        <line className="ln ln2" x1="8" y1="12" x2="16" y2="12" />
        <line className="ln ln3" x1="8" y1="16" x2="13" y2="16" />
        <line className="beam" x1="5.5" y1="5" x2="18.5" y2="5" />
      </svg>
      <span key={i} className="think-txt">{STEPS[i]}</span>
      <span className="think-dots" aria-hidden="true"><i /><i /><i /></span>
    </span>
  );
}

function Assistant({ m, pending }: { m: Msg; pending: boolean }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const refs = useRef<Record<number, HTMLDivElement | null>>({});

  const jump = (n: number) => {
    setOpen(true);
    setActive(n);
    setTimeout(() => refs.current[n]?.scrollIntoView({ block: "nearest", behavior: "smooth" }), 60);
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(m.content); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {}
  };

  return (
    <div className="msg assistant">
      {pending && !m.content ? (
        <Thinking />
      ) : (
        <div className="answer">
          {m.content.split(/(\[\d+\])/g).map((part, i) => {
            const hit = /^\[(\d+)\]$/.exec(part);
            return hit ? (
              <button key={i} className="cite" onClick={() => jump(Number(hit[1]))} aria-label={`Show source ${hit[1]}`}>{hit[1]}</button>
            ) : (
              <span key={i}>{part}</span>
            );
          })}
        </div>
      )}
      {!!m.sources?.length && !!m.content && (
        <div className="meta">
          <button className="link" onClick={() => setOpen(!open)} aria-expanded={open}>{open ? "Hide" : "Show"} {m.sources.length} sources</button>
          <button className="link" onClick={copy}>{copied ? "Copied" : "Copy"}</button>
        </div>
      )}
      {open && m.sources?.map((s) => (
        <div key={s.n} ref={(el) => { refs.current[s.n] = el; }} className={`src ${active === s.n ? "active" : ""}`}>
          <b>[{s.n}] {s.filename} · page {s.page}</b>
          <p>{s.content}</p>
        </div>
      ))}
    </div>
  );
}

export default function ChatPanel({ selected, onAsked }: { selected: string[]; onAsked: () => void }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const convId = useRef<string | undefined>(undefined);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" }); }, [msgs]);

  async function send(raw: string) {
    const question = raw.trim();
    if (!question || busy) return;
    setInput("");
    setError("");
    setBusy(true);
    setMsgs((m) => [...m, { role: "user", content: question }, { role: "assistant", content: "" }]);

    const patchLast = (fn: (m: Msg) => Msg) => setMsgs((m) => [...m.slice(0, -1), fn(m[m.length - 1])]);
    try {
      await streamChat(
        { question, conversation_id: convId.current, document_ids: selected.length ? selected : undefined },
        {
          onMeta: (meta) => { convId.current = meta.conversation_id; patchLast((m) => ({ ...m, sources: meta.sources })); },
          onToken: (t) => patchLast((m) => ({ ...m, content: m.content + t })),
        }
      );
    } catch (err) {
      setError((err as Error).message);
      setMsgs((m) => (m[m.length - 1].content ? m : m.slice(0, -1)));
    } finally {
      setBusy(false);
      onAsked();
    }
  }

  const newChat = () => { setMsgs([]); setError(""); convId.current = undefined; };

  return (
    <section className="chat glass" aria-label="Chat">
      <div className="chat-head">
        <span className="scope">
          Searching {selected.length ? `${selected.length} selected document${selected.length > 1 ? "s" : ""}` : "all documents"}
        </span>
        <button className="btn" onClick={newChat} disabled={busy || !msgs.length}>New chat</button>
      </div>

      <div className="log" aria-live="polite">
        {!msgs.length && (
          <div className="empty">
            <h3 className="grad">Ask anything about your documents</h3>
            <p className="muted">Upload a file on the left, then try one of these.</p>
            <div className="chips">
              {SUGGESTIONS.map((s) => (
                <button key={s} className="chip" onClick={() => send(s)} disabled={busy}>{s}</button>
              ))}
            </div>
          </div>
        )}
        {msgs.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="msg user">{m.content}</div>
          ) : (
            <Assistant key={i} m={m} pending={busy && i === msgs.length - 1} />
          )
        )}
        <div ref={endRef} />
      </div>

      {error && <div className="err-bar error" role="alert">{error}</div>}
      <form className="composer" onSubmit={(e) => { e.preventDefault(); send(input); }}>
        <input type="text" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask about your documents…" aria-label="Your question" />
        <button className="btn primary" disabled={busy || !input.trim()}>{busy ? "…" : "Ask"}</button>
      </form>
    </section>
  );
}