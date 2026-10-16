"use client";
import { useEffect, useRef } from "react";

export const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

type Turnstile = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  reset: (id?: string) => void;
  remove: (id: string) => void;
};
declare global {
  interface Window { turnstile?: Turnstile }
}

let loader: Promise<void> | null = null;
function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  loader ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => { loader = null; reject(new Error("Couldn't load the human check")); };
    document.head.appendChild(s);
  });
  return loader;
}

// Cloudflare Turnstile "are you human" check. Calls onToken with a one-time token (or "" when it expires).
// Bump resetKey after a failed submit: each token can only be used once.
export default function TurnstileWidget({ onToken, resetKey, onError }: {
  onToken: (token: string) => void;
  resetKey: number;
  onError?: (message: string) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const id = useRef<string | undefined>(undefined);
  const cb = useRef(onToken);
  cb.current = onToken;

  useEffect(() => {
    let dead = false;
    loadScript().then(() => {
      if (dead || !box.current || !window.turnstile) return;
      id.current = window.turnstile.render(box.current, {
        sitekey: TURNSTILE_SITE_KEY,
        callback: (t: string) => cb.current(t),
        "expired-callback": () => cb.current(""),
        "error-callback": () => cb.current(""),
      });
    }).catch((e: Error) => onError?.(e.message));
    return () => {
      dead = true;
      if (id.current && window.turnstile) window.turnstile.remove(id.current);
      id.current = undefined;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (resetKey && id.current && window.turnstile) window.turnstile.reset(id.current);
  }, [resetKey]);

  return <div ref={box} className="cf-box" />;
}