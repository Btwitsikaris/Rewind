"use client";
import { useEffect, useRef } from "react";

export const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";

type GoogleId = {
  initialize: (cfg: { client_id: string; callback: (r: { credential: string }) => void }) => void;
  renderButton: (el: HTMLElement, opts: Record<string, unknown>) => void;
};
declare global {
  interface Window { google?: { accounts: { id: GoogleId } } }
}

let loader: Promise<void> | null = null;
function loadGsi(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  loader ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => { loader = null; reject(new Error("Couldn't load Google sign-in")); };
    document.head.appendChild(s);
  });
  return loader;
}

// Renders Google's own "Sign in with Google" button. On success Google hands us an ID token (a signed JWT),
// which the parent sends to the backend; the backend verifies it before issuing our own session token.
export default function GoogleButton({ text, onCredential, onError }: {
  text: "signin_with" | "signup_with";
  onCredential: (credential: string) => void;
  onError: (message: string) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const cb = useRef(onCredential);
  const err = useRef(onError);
  cb.current = onCredential;
  err.current = onError;

  useEffect(() => {
    let dead = false;
    loadGsi().then(() => {
      if (dead || !box.current || !window.google) return;
      const g = window.google.accounts.id;
      g.initialize({ client_id: GOOGLE_CLIENT_ID, callback: (r) => cb.current(r.credential) });
      g.renderButton(box.current, {
        type: "standard", theme: "outline", size: "large", shape: "pill", text, logo_alignment: "left",
        width: Math.min(400, box.current.offsetWidth || 320),
      });
    }).catch((e: Error) => err.current(e.message));
    return () => { dead = true; };
  }, [text]);

  return <div ref={box} className="gbtn" />;
}