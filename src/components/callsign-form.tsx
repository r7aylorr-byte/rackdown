import { useState, type FormEvent } from "react";
import { authClient } from "@/lib/auth/client";
import { setUsername } from "@/game/scores.functions";

const NAME_RE = /^[A-Za-z0-9_-]{3,16}$/;
const BEARER_KEY = "grok-auth.bearer-token";
const BADGE_KEY = "rackdown-badge-v1";

function callsignEmail(username: string) {
  return `${username.toLowerCase()}@rackdown.example`;
}

function rememberToken(response: Response) {
  const token = response.headers.get("set-auth-token");
  if (!token || typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(BEARER_KEY, token);
  } catch {
    /* storage unavailable */
  }
}

function readBadges(): Record<string, string> {
  try {
    const raw = localStorage.getItem(BADGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : {};
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as Record<string, string>;
  } catch {
    return {};
  }
}

function saveBadge(key: string, secret: string) {
  const all = readBadges();
  all[key] = secret;
  localStorage.setItem(BADGE_KEY, JSON.stringify(all));
}

function taken(error: { message?: string; code?: string } | null) {
  const code = error?.code ?? "";
  const message = error?.message ?? "";
  return code === "USER_ALREADY_EXISTS" || /already exists/i.test(message);
}

export function CallsignForm({ onDone }: { onDone?: () => void }) {
  const [username, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const name = username.trim();
    if (!NAME_RE.test(name)) {
      setError("Use 3–16 letters, numbers, _ or -.");
      return;
    }
    setBusy(true);
    setError("");
    const key = name.toLowerCase();
    const known = readBadges()[key];
    const secret = known ?? crypto.randomUUID();
    const email = callsignEmail(name);
    const fetchOptions = {
      onSuccess(ctx: { response: Response }) {
        rememberToken(ctx.response);
      },
    };
    try {
      if (!known) {
        const created = await authClient.signUp.email({ email, password: secret, name, fetchOptions });
        if (created.error) {
          setError(taken(created.error) ? "That callsign is already taken." : "Could not claim that callsign.");
          return;
        }
        saveBadge(key, secret);
      } else {
        const signed = await authClient.signIn.email({ email, password: secret, fetchOptions });
        if (signed.error) {
          setError("That callsign is already taken.");
          return;
        }
      }
      await authClient.getSession();
      const named = await setUsername({ data: { username: name } });
      if (!named.ok) {
        setError(named.error);
        return;
      }
      onDone?.();
    } catch {
      setError("Sign-in did not finish.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-3">
      <p className="text-sm leading-relaxed text-muted">
        Pick a callsign. Each name can be claimed once. This browser remembers yours.
      </p>
      <label className="flex flex-col gap-1">
        <span className="font-mono text-xs text-muted">Callsign</span>
        <input
          value={username}
          onChange={(e) => setName(e.target.value)}
          maxLength={16}
          autoComplete="username"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          className="min-h-11 border border-line bg-bg px-3 font-mono text-sm text-fg outline-none select-text"
        />
      </label>
      {error ? <p className="text-sm text-alarm">{error}</p> : null}
      <button
        type="submit"
        disabled={busy}
        className="min-h-12 bg-signal font-mono text-sm font-semibold text-bg disabled:opacity-40"
      >
        {busy ? "Checking badge…" : "Use this callsign"}
      </button>
    </form>
  );
}
