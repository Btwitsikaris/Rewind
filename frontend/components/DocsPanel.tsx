"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, Doc } from "@/lib/api";

export default function DocsPanel({ selected, onSelect }: { selected: string[]; onSelect: (ids: string[]) => void }) {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [over, setOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(() => api<Doc[]>("/documents").then(setDocs).catch((e) => setError(e.message)), []);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!docs.some((d) => d.status === "processing")) return;
    const t = setInterval(load, 2500);
    return () => clearInterval(t);
  }, [docs, load]);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    setError("");
    for (const f of Array.from(files)) {
      const fd = new FormData();
      fd.append("file", f);
      try { await api("/documents", { method: "POST", body: fd }); } catch (e) { setError((e as Error).message); }
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
    load();
  }

  async function remove(id: string) {
    await api(`/documents/${id}`, { method: "DELETE" });
    onSelect(selected.filter((s) => s !== id));
    load();
  }

  const toggle = (id: string) => onSelect(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]);

  return (
    <section className="docs glass" aria-label="Documents">
      <h2>Documents</h2>
      <label
        className={`drop ${over ? "over" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); upload(e.dataTransfer.files); }}
      >
        <input ref={fileRef} className="sr-only" type="file" multiple accept=".pdf,.docx,.txt,.md" onChange={(e) => upload(e.target.files)} />
        <strong>{uploading ? "Uploading…" : "Drop files here"}</strong>
        <span className="muted">or click to browse · PDF, DOCX, TXT, MD</span>
      </label>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="doclist">
        {docs.map((d) => (
          <div className="doc" key={d.id}>
            <input type="checkbox" checked={selected.includes(d.id)} disabled={d.status !== "ready"} onChange={() => toggle(d.id)} aria-label={`Search only ${d.filename}`} />
            <span className="name" title={d.error ?? d.filename}>{d.filename}</span>
            <span className={`pill ${d.status}`}>
              {d.status === "processing" && <i className="spin" />}
              {d.status === "ready" ? `${d.n_chunks} chunks` : d.status}
            </span>
            <button className="x" onClick={() => remove(d.id)} aria-label={`Delete ${d.filename}`}>✕</button>
          </div>
        ))}
      </div>
      {!docs.length && <p className="muted">No documents yet. Add one to get started.</p>}
      {!!docs.length && <p className="muted">Tick documents to limit questions to them. None ticked searches all.</p>}
    </section>
  );
}