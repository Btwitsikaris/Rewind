export const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export type Doc = { id: string; filename: string; status: "processing" | "ready" | "failed"; error: string | null; n_chunks: number };
export type Source = { n: number; document_id: string; filename: string; page: number; content: string };
export type Msg = { role: "user" | "assistant"; content: string; sources?: Source[] };
export type Me = { email: string; plan: string; questions_today: number; questions_per_day: number; max_documents: number };

export const getToken = () => (typeof window === "undefined" ? null : localStorage.getItem("token"));
export const setToken = (t: string | null) => (t ? localStorage.setItem("token", t) : localStorage.removeItem("token"));

async function fail(res: Response): Promise<never> {
  const e = await res.json().catch(() => ({ detail: res.statusText }));
  throw new Error(typeof e.detail === "string" ? e.detail : "Request failed");
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const t = getToken();
  if (t) headers.set("Authorization", `Bearer ${t}`);
  if (init.body && !(init.body instanceof FormData)) headers.set("Content-Type", "application/json");
  const res = await fetch(`${API}${path}`, { ...init, headers });
  if (!res.ok) await fail(res);
  return res.json();
}

type Handlers = {
  onMeta: (m: { conversation_id: string; sources: Source[] }) => void;
  onToken: (text: string) => void;
};

// Reads the server-sent events from POST /chat (EventSource can't send a body or auth header).
export async function streamChat(
  body: { question: string; conversation_id?: string; document_ids?: string[] },
  h: Handlers
) {
  const res = await fetch(`${API}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.body) await fail(res);
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const block = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const ev = /^event: (.*)$/m.exec(block)?.[1];
      const data = /^data: (.*)$/m.exec(block)?.[1];
      if (!ev || !data) continue;
      const json = JSON.parse(data);
      if (ev === "meta") h.onMeta(json);
      else if (ev === "token") h.onToken(json.text);
      else if (ev === "error") throw new Error(json.message);
    }
  }
}
