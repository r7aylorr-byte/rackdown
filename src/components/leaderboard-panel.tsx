import { useEffect, useState } from "react";
import { Flame, Timer, Trophy } from "lucide-react";
import { UserButton } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { CallsignForm } from "@/components/callsign-form";
import { getBoards, setUsername, type BoardsPayload, type ScoreBoard } from "@/game/scores.functions";

type TabId = "fastest" | "today" | "meltdowns";

const TABS: { id: TabId; label: string; blurb: string }[] = [
  { id: "fastest", label: "Fastest", blurb: "Best single ticket close. Lower is better." },
  { id: "today", label: "Today", blurb: "Tickets closed since 00:00 UTC." },
  { id: "meltdowns", label: "Meltdowns", blurb: "Shifts that ended in a hall fire. All time." },
];

function formatTime(seconds: number) {
  const safe = Math.max(0, seconds);
  const mins = Math.floor(safe / 60);
  const rem = safe - mins * 60;
  const tenths = rem.toFixed(1);
  if (mins <= 0) return `${tenths}s`;
  const [whole, frac] = tenths.split(".");
  return `${mins}:${whole.padStart(2, "0")}.${frac}`;
}

function formatValue(tab: TabId, value: number) {
  return tab === "fastest" ? formatTime(value) : String(Math.round(value));
}

export function LeaderboardPanel({ revision, onClose }: { revision: number; onClose: () => void }) {
  const { user, isPending } = useCurrentUserState();
  const userId = user?.id ?? null;

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center overflow-y-auto bg-bg/80 p-4">
      <div className="flex max-h-full w-full max-w-md flex-col gap-4 overflow-y-auto border border-line bg-surface p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-mono text-xs tracking-widest text-signal">HALL BOARD</p>
            <h2 className="text-2xl font-semibold">Callsigns</h2>
          </div>
          <button type="button" className="min-h-11 border border-line px-3 font-mono text-xs" onClick={onClose}>
            Close
          </button>
        </div>

        {isPending ? <p className="font-mono text-xs text-muted">Checking badge…</p> : null}
        {!isPending && !userId ? <SignInBlock /> : null}
        {!isPending && userId ? (
          <>
            <div className="max-w-full overflow-hidden">
              <UserButton />
            </div>
            <BoardBody userId={userId} revision={revision} />
          </>
        ) : null}
      </div>
    </div>
  );
}

function SignInBlock() {
  return <CallsignForm />;
}

function BoardBody({ userId, revision }: { userId: string; revision: number }) {
  const [boards, setBoards] = useState<BoardsPayload | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [tick, setTick] = useState(0);
  const [tab, setTab] = useState<TabId>("fastest");
  const [draft, setDraft] = useState("");
  const [dirty, setDirty] = useState(false);
  const [nameError, setNameError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancel = false;
    setStatus("loading");
    getBoards()
      .then((data) => {
        if (cancel) return;
        setBoards(data);
        setStatus("ready");
      })
      .catch(() => {
        if (!cancel) setStatus("error");
      });
    return () => {
      cancel = true;
    };
  }, [userId, revision, tick]);

  useEffect(() => {
    if (!dirty && boards) setDraft(boards.username);
  }, [boards, dirty]);

  const current = TABS.find((item) => item.id === tab) ?? TABS[0];
  const board: ScoreBoard | null = boards ? boards[tab] : null;

  return (
    <>
      <form
        className="flex flex-col gap-2 border border-line bg-bg p-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (saving) return;
          setSaving(true);
          setNameError("");
          void setUsername({ data: { username: draft } })
            .then((res) => {
              if (!res.ok) {
                setNameError(res.error);
                return;
              }
              setDirty(false);
              setTick((n) => n + 1);
            })
            .catch(() => setNameError("Could not save that callsign."))
            .finally(() => setSaving(false));
        }}
      >
        <label className="font-mono text-xs text-muted" htmlFor="callsign">
          Callsign
        </label>
        <div className="flex gap-2">
          <input
            id="callsign"
            value={draft}
            maxLength={16}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            onChange={(e) => {
              setDirty(true);
              setDraft(e.target.value);
            }}
            className="min-h-11 min-w-0 flex-1 border border-line bg-surface px-3 font-mono text-sm text-fg outline-none select-text"
          />
          <button
            type="submit"
            disabled={saving}
            className="min-h-11 shrink-0 bg-signal px-3 font-mono text-sm font-semibold text-bg disabled:opacity-40"
          >
            {saving ? "Saving" : "Save"}
          </button>
        </div>
        {nameError ? <p className="text-sm text-alarm">{nameError}</p> : null}
        <p className="text-xs leading-relaxed text-muted">Board name. The callsign you claimed stays the one you sign in with.</p>
      </form>

      <div className="grid grid-cols-3 gap-1">
        {TABS.map((item) => {
          const on = item.id === tab;
          const Icon = item.id === "fastest" ? Timer : item.id === "today" ? Trophy : Flame;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`flex min-h-11 items-center justify-center gap-1 border px-1 font-mono text-xs ${on ? "border-signal bg-surface-2 text-fg" : "border-line text-muted"}`}
            >
              <Icon className="size-3.5 shrink-0" />
              {item.label}
            </button>
          );
        })}
      </div>
      <p className="text-sm leading-relaxed text-muted">{current.blurb}</p>

      {status === "loading" && !boards ? (
        <div className="flex flex-col gap-2">
          <div className="h-8 animate-pulse bg-surface-2" />
          <div className="h-8 animate-pulse bg-surface-2" />
          <div className="h-8 animate-pulse bg-surface-2" />
        </div>
      ) : null}
      {status === "error" && !boards ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-alarm">The board did not answer.</p>
          <button type="button" className="min-h-11 border border-line font-mono text-xs" onClick={() => setTick((n) => n + 1)}>
            Retry
          </button>
        </div>
      ) : null}
      {board && board.rows.length === 0 ? <p className="text-sm text-muted">Nobody on this board yet.</p> : null}
      {board && board.rows.length > 0 ? (
        <ol className="flex flex-col">
          {board.rows.map((row) => (
            <li
              key={row.username}
              className={`flex items-baseline gap-3 border-b border-line py-2 ${row.you ? "text-signal" : "text-fg"}`}
            >
              <span className="w-6 font-mono text-xs text-muted">{String(row.rank).padStart(2, "0")}</span>
              <span className="min-w-0 flex-1 truncate text-sm">
                {row.username}
                {row.you ? " · you" : ""}
              </span>
              <span className="font-mono text-sm tabular-nums">{formatValue(tab, row.value)}</span>
            </li>
          ))}
        </ol>
      ) : null}
      {board?.you && !board.rows.some((row) => row.you) ? (
        <p className="font-mono text-xs text-signal">
          You · {board.you.rank} · {formatValue(tab, board.you.value)}
        </p>
      ) : null}
    </>
  );
}
