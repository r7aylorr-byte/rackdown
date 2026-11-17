import { useEffect, useRef, useState, type RefObject } from "react";
import { Cable, Flame, Hammer } from "lucide-react";
import { createGame, type GameApi, type Hud, type SettledRun } from "@/game/engine";
import { recordRun } from "@/game/scores.functions";
import type { SpecialId } from "@/game/content";
import type { UpgradeId } from "@/game/save";
import { LeaderboardPanel } from "@/components/leaderboard-panel";
import { UserButton } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

function clock(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function GamePage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const apiRef = useRef<GameApi | null>(null);
  const pendingRun = useRef<SettledRun | null>(null);
  const posted = useRef(new Set<string>());
  const submitRef = useRef<(run: SettledRun) => void>(() => {});
  const [hud, setHud] = useState<Hud | null>(null);
  const [boardOpen, setBoardOpen] = useState(false);
  const [boardRev, setBoardRev] = useState(0);
  const [postNote, setPostNote] = useState("");
  const { user, isPending } = useCurrentUserState();

  submitRef.current = (run) => {
    if (posted.current.has(run.token)) return;
    posted.current.add(run.token);
    setPostNote("Posting this shift…");
    void recordRun({
      data: {
        kind: run.kind === "chaos" ? "chaos" : "fix",
        seconds: run.seconds,
        token: run.token,
      },
    })
      .then((res) => {
        if (res.ok) {
          setPostNote("Posted to the hall board.");
          setBoardRev((n) => n + 1);
          return;
        }
        setPostNote(res.error);
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : "";
        if (message === "Unauthorized" || message.includes("Unauthorized")) {
          posted.current.delete(run.token);
          setPostNote("Sign in on the leaderboard to post this shift.");
          return;
        }
        setPostNote("This shift did not post.");
      });
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const api = createGame(canvas, setHud, {
      onRun: (run) => {
        pendingRun.current = run;
        submitRef.current(run);
      },
    });
    apiRef.current = api;
    return () => {
      api.dispose();
      apiRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (isPending || !user || !pendingRun.current) return;
    submitRef.current(pendingRun.current);
  }, [user, isPending]);

  const phase = hud?.phase ?? "boot";

  useEffect(() => {
    if (phase !== "debrief") setPostNote("");
  }, [phase]);

  const playing = phase === "play" || phase === "chaos";
  const openBoard = () => setBoardOpen(true);

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-bg font-sans text-fg touch-none">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      {hud && hud.flash > 0.02 ? (
        <div className="pointer-events-none absolute inset-0 bg-alarm" style={{ opacity: hud.flash * 0.35 }} />
      ) : null}

      {playing && hud ? <Crosshair hot={hud.cross} /> : null}
      {playing && hud ? <PlayHud hud={hud} api={apiRef} /> : null}
      {phase === "boot" || !hud ? <Boot hud={hud} onStart={() => apiRef.current?.clockIn()} onBoard={openBoard} /> : null}
      {phase === "pause" && hud ? <Pause hud={hud} api={apiRef} onBoard={openBoard} /> : null}
      {phase === "debrief" && hud ? <Debrief hud={hud} api={apiRef} postNote={postNote} onBoard={openBoard} /> : null}
      {phase === "shop" && hud ? <Shop hud={hud} api={apiRef} onBoard={openBoard} /> : null}
      {boardOpen ? <LeaderboardPanel revision={boardRev} onClose={() => setBoardOpen(false)} /> : null}
    </div>
  );
}

function Crosshair({ hot }: { hot: Hud["cross"] }) {
  const color = hot === "bad" ? "bg-alarm" : hot === "hot" ? "bg-signal" : "bg-fg";
  return (
    <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 h-8 w-8 -translate-x-1/2 -translate-y-1/2">
      <span className={`absolute left-1/2 top-0 h-2 w-px -translate-x-1/2 ${color}`} />
      <span className={`absolute bottom-0 left-1/2 h-2 w-px -translate-x-1/2 ${color}`} />
      <span className={`absolute left-0 top-1/2 h-px w-2 -translate-y-1/2 ${color}`} />
      <span className={`absolute right-0 top-1/2 h-px w-2 -translate-y-1/2 ${color}`} />
    </div>
  );
}

function Boot({ hud, onStart, onBoard }: { hud: Hud | null; onStart: () => void; onBoard: () => void }) {
  return (
    <div className="absolute inset-0 z-20 flex flex-col bg-bg md:flex-row md:bg-transparent">
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto border-line p-5 md:w-96 md:flex-none md:border-r md:bg-bg/95 md:p-6">
        <div>
          <div className="flex items-start justify-between gap-3">
            <p className="font-mono text-xs tracking-widest text-signal">COLO 3 · NIGHT SHIFT</p>
            <AccountChip />
          </div>
          <h1 className="mt-2 font-mono text-4xl font-semibold tracking-tight text-fg">RACKDOWN</h1>
          <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted">
            One ML rack. One ticket. Close it clean, or melt the hall in thirty seconds.
          </p>
        </div>

        <article className="border border-line bg-surface p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="font-mono text-xs text-signal">{hud?.ticketId ?? "INC-····"} · SEV-2</p>
            <p className="font-mono text-xs text-muted">{hud?.statsLine || "First shift"}</p>
          </div>
          <h2 className="mt-2 text-lg font-semibold leading-snug">{hud?.ticketTitle ?? "Pulling the queue"}</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">{hud?.ticketBody ?? "The rack is spinning up."}</p>
        </article>

        <ul className="flex flex-col gap-3 text-sm">
          <li className="flex gap-3">
            <Cable className="mt-0.5 size-5 shrink-0 text-signal" />
            <span>Eject a GPU or headnode on the amber latch and swap the fan, accelerator, drive, or NIC. Spares sit on the bench.</span>
          </li>
          <li className="flex gap-3">
            <Hammer className="mt-0.5 size-5 shrink-0 text-signal" />
            <span>Sledge, saw, torch, gas. Wrong power or a wet board will arc, then burn.</span>
          </li>
          <li className="flex gap-3">
            <Flame className="mt-0.5 size-5 shrink-0 text-alarm" />
            <span>Wreck the rack and the shift ends in a 30 second meltdown. Then a new ticket.</span>
          </li>
        </ul>

        <div className="mt-auto flex flex-col gap-3">
          {hud?.error ? <p className="text-sm text-alarm">{hud.error}</p> : null}
          <button
            type="button"
            onClick={onStart}
            className="min-h-12 bg-signal px-4 font-mono text-sm font-semibold tracking-wide text-bg uppercase"
          >
            Clock in
          </button>
          <button type="button" onClick={onBoard} className="min-h-12 border border-line font-mono text-sm">
            Leaderboard
          </button>
          <p className="font-mono text-xs leading-relaxed text-muted">
            Desktop: drag to look up, down, and around. WASD, E, keys 1–0, Esc. Phone: drag the view, stick, USE and HIT.
          </p>
        </div>
      </div>
      <button type="button" className="hidden flex-1 cursor-pointer md:block" aria-label="Clock in" onClick={onStart} />
    </div>
  );
}

function PlayHud({ hud, api }: { hud: Hud; api: RefObject<GameApi | null> }) {
  const meter =
    hud.tool === "extinguisher" ? hud.extinguisher / hud.extMax : hud.tool === "gas" ? hud.gas : hud.tool === "washer" ? hud.water : null;
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex flex-col justify-between p-3">
      <div className="flex items-start justify-between gap-3">
        <section className="pointer-events-auto max-h-56 w-full max-w-sm overflow-y-auto border border-line bg-bg/90 md:max-h-72">
          <button
            type="button"
            className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left"
            onClick={() => api.current?.toggleTicket()}
          >
            <span className="font-mono text-xs text-signal">{hud.ticketId}</span>
            <span className="font-mono text-xs text-muted">{hud.ticketOpen ? "Hide" : "Ticket"}</span>
          </button>
          {hud.ticketOpen ? (
            <div className="flex flex-col gap-2 px-3 pb-3">
              <h2 className="text-sm font-semibold leading-snug">{hud.ticketTitle}</h2>
              <p className="text-xs leading-relaxed text-muted">{hud.ticketBody}</p>
              <ul className="flex flex-col gap-1">
                {hud.objectives.map((item) => (
                  <li key={item} className="font-mono text-xs leading-snug text-fg">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
        <div className="pointer-events-auto flex flex-col items-end gap-2">
          <div className="border border-line bg-bg/90 px-3 py-2 text-right">
            <p className="font-mono text-xs text-muted">{hud.credits} cr</p>
            <p className={`font-mono text-lg tabular-nums ${phaseChaos(hud) ? "text-alarm" : "text-fg"}`}>
              {phaseChaos(hud) ? clock(hud.chaosLeft) : clock(hud.elapsed)}
            </p>
          </div>
          <button
            type="button"
            className="min-h-11 border border-line bg-surface px-3 font-mono text-xs text-fg"
            onClick={() => api.current?.pause()}
          >
            Pause
          </button>
        </div>
      </div>

      {phaseChaos(hud) ? (
        <p className="pointer-events-none self-center border border-alarm bg-bg/90 px-4 py-2 text-center font-mono text-sm text-alarm">
          MELTDOWN {clock(hud.chaosLeft)} — {hud.chaosReason}
        </p>
      ) : (
        <span />
      )}

      <div className="flex flex-col gap-2">
        {hud.lookTitle ? (
          <div className="max-w-sm self-center border border-line bg-bg/90 px-3 py-2 text-center">
            <p className="font-mono text-xs text-signal">{hud.lookTitle}</p>
            {hud.lookLines.map((line) => (
              <p key={line} className="text-xs leading-relaxed text-fg">
                {line}
              </p>
            ))}
          </div>
        ) : null}
        <div className="self-center border border-line bg-bg px-3 py-2 text-center">
          <p className="font-mono text-base text-fg">
            {hud.toolName}
            {hud.holding ? ` · ${hud.holding}` : ""}
          </p>
          <p className="mx-auto max-w-md text-sm leading-snug text-fg">{hud.lookPrompt || hud.toolHint}</p>
          {!hud.touch ? <p className="mt-1 font-mono text-xs tracking-wide text-muted">Drag to look up, down, and around</p> : null}
          {meter !== null ? (
            <div className="mx-auto mt-1 h-1.5 w-40 bg-line">
              <div className="h-1.5 bg-signal" style={{ width: `${Math.max(0, Math.min(1, meter)) * 100}%` }} />
            </div>
          ) : null}
        </div>
        <div className="pointer-events-auto flex flex-wrap gap-1.5 border border-line bg-bg p-1.5">
          {hud.tools.map((t) => {
            const on = t.id === hud.tool;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => api.current?.selectTool(t.id)}
                className={`flex min-h-11 items-center gap-2 border px-2.5 font-mono text-sm text-fg ${on ? "border-signal bg-surface-2" : "border-line bg-surface"}`}
              >
                <span className="text-base text-signal">{t.key}</span>
                <span>{t.name}</span>
              </button>
            );
          })}
        </div>
        {hud.touch ? (
          <div className="pointer-events-auto flex items-end justify-between gap-3">
            <Stick onChange={(x, z) => api.current?.setAnalog(x, z)} />
            <div className="flex gap-2">
              <HoldButton label="USE" onDown={() => api.current?.setInteract(true)} onUp={() => api.current?.setInteract(false)} />
              <HoldButton label="HIT" onDown={() => api.current?.setPrimary(true)} onUp={() => api.current?.setPrimary(false)} />
            </div>
          </div>
        ) : null}
        {hud.log[0] ? <p className="truncate font-mono text-xs text-muted">{hud.log[0]}</p> : null}
      </div>
    </div>
  );
}

function phaseChaos(hud: Hud) {
  return hud.phase === "chaos";
}

function HoldButton({ label, onDown, onUp }: { label: string; onDown: () => void; onUp: () => void }) {
  return (
    <button
      type="button"
      className="min-h-16 min-w-20 rounded-full border border-line bg-surface font-mono text-sm text-fg"
      onPointerDown={(e) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        onDown();
      }}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      {label}
    </button>
  );
}

function Stick({ onChange }: { onChange: (x: number, z: number) => void }) {
  const origin = useRef<{ x: number; y: number } | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const radius = 46;

  function apply(clientX: number, clientY: number) {
    if (!origin.current) return;
    let dx = clientX - origin.current.x;
    let dy = clientY - origin.current.y;
    const mag = Math.hypot(dx, dy);
    if (mag > radius) {
      dx = (dx / mag) * radius;
      dy = (dy / mag) * radius;
    }
    setKnob({ x: dx, y: dy });
    onChange(dx / radius, -dy / radius);
  }

  return (
    <div
      className="relative h-32 w-32 rounded-full border border-line bg-surface/90"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        e.preventDefault();
        const rect = e.currentTarget.getBoundingClientRect();
        origin.current = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        apply(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => {
        if (origin.current) apply(e.clientX, e.clientY);
      }}
      onPointerUp={(e) => {
        origin.current = null;
        setKnob({ x: 0, y: 0 });
        onChange(0, 0);
        if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
      }}
    >
      <div
        className="absolute left-1/2 top-1/2 h-14 w-14 rounded-full bg-signal"
        style={{ transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))` }}
      />
    </div>
  );
}

function Pause({ hud, api, onBoard }: { hud: Hud; api: RefObject<GameApi | null>; onBoard: () => void }) {
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-bg/80 p-4">
      <div className="flex w-full max-w-sm flex-col gap-3 border border-line bg-surface p-5">
        <div className="flex items-start justify-between gap-3">
          <p className="font-mono text-xs tracking-widest text-signal">SHIFT PAUSED</p>
          <AccountChip />
        </div>
        <h2 className="text-2xl font-semibold">Hands off the rack</h2>
        <p className="text-sm text-muted">{hud.ticketTitle}</p>
        <button type="button" className="min-h-12 bg-signal font-mono text-sm font-semibold text-bg" onClick={() => api.current?.resume()}>
          Resume
        </button>
        <button type="button" className="min-h-12 border border-line font-mono text-sm" onClick={() => api.current?.openShop()}>
          Commissary · {hud.credits} cr
        </button>
        <button type="button" className="min-h-12 border border-line font-mono text-sm" onClick={onBoard}>
          Leaderboard
        </button>
        <button type="button" className="min-h-12 border border-alarm font-mono text-sm text-alarm" onClick={() => api.current?.abandon()}>
          Abandon — start meltdown
        </button>
      </div>
    </div>
  );
}

function Debrief({
  hud,
  api,
  postNote,
  onBoard,
}: {
  hud: Hud;
  api: RefObject<GameApi | null>;
  postNote: string;
  onBoard: () => void;
}) {
  const fixed = hud.outcome === "fixed";
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-bg/80 p-4">
      <div className="flex max-h-full w-full max-w-sm flex-col gap-3 overflow-y-auto border border-line bg-surface p-5">
        <p className={`font-mono text-xs tracking-widest ${fixed ? "text-signal" : "text-alarm"}`}>
          {fixed ? "TICKET CLOSED" : "SITE INCIDENT"}
        </p>
        <h2 className="text-2xl font-semibold">{fixed ? "Job is posting" : "Hall is a write-off"}</h2>
        <p className="font-mono text-3xl tabular-nums text-fg">+{hud.payout} cr</p>
        <p className="text-sm leading-relaxed text-muted">{hud.payoutNote}</p>
        <p className="font-mono text-xs text-muted">
          Bank {hud.credits} · {hud.statsLine}
        </p>
        {postNote ? <p className="text-sm text-fg">{postNote}</p> : null}
        <button type="button" className="min-h-12 bg-signal font-mono text-sm font-semibold text-bg" onClick={() => api.current?.nextShift()}>
          Next ticket
        </button>
        <button type="button" className="min-h-12 border border-line font-mono text-sm" onClick={onBoard}>
          Leaderboard
        </button>
        <button type="button" className="min-h-12 border border-line font-mono text-sm" onClick={() => api.current?.openShop()}>
          Commissary
        </button>
      </div>
    </div>
  );
}

function Shop({ hud, api, onBoard }: { hud: Hud; api: RefObject<GameApi | null>; onBoard: () => void }) {
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-bg/80 p-4">
      <div className="flex max-h-full w-full max-w-md flex-col gap-3 overflow-y-auto border border-line bg-surface p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">Commissary</h2>
          <p className="font-mono text-sm text-signal">{hud.credits} cr</p>
        </div>
        <p className="text-sm text-muted">Credits stick between shifts. Gear applies the moment you buy it.</p>
        <ul className="flex flex-col gap-2">
          {hud.prices.map((item) => {
            const owned = hud.upgrades[item.id as UpgradeId];
            const afford = hud.credits >= item.cost;
            return (
              <li key={item.id} className="border border-line p-3">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="font-medium">{item.name}</p>
                  <p className="font-mono text-sm text-fg">{owned ? "Owned" : `${item.cost} cr`}</p>
                </div>
                <p className="mt-1 text-sm leading-relaxed text-fg">{item.blurb}</p>
                <button
                  type="button"
                  disabled={owned || !afford}
                  onClick={() => api.current?.buy(item.id)}
                  className="mt-2 min-h-11 w-full border border-line font-mono text-xs text-fg disabled:opacity-40"
                >
                  {owned ? "In the crib" : afford ? "Buy" : "Short on credits"}
                </button>
              </li>
            );
          })}
        </ul>
        <p className="font-mono text-xs tracking-widest text-signal">ONE-SHOT TOOLS</p>
        <p className="text-sm text-muted">Each swing spends one. They hit three times as hard as the sledge.</p>
        <ul className="flex flex-col gap-2">
          {hud.consumables.map((item) => {
            const afford = hud.credits >= item.cost;
            return (
              <li key={item.id} className="border border-line p-3">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="font-medium">{item.name}</p>
                  <p className="font-mono text-sm text-fg">
                    {item.count > 0 ? `${item.count} in the bag · ` : ""}
                    {item.cost} cr
                  </p>
                </div>
                <p className="mt-1 text-sm leading-relaxed text-fg">{item.blurb}</p>
                <button
                  type="button"
                  disabled={!afford}
                  onClick={() => api.current?.buySpecial(item.id as SpecialId)}
                  className="mt-2 min-h-11 w-full border border-line font-mono text-xs text-fg disabled:opacity-40"
                >
                  {afford ? "Buy one" : "Short on credits"}
                </button>
              </li>
            );
          })}
        </ul>
        <button type="button" className="min-h-12 border border-line font-mono text-sm" onClick={onBoard}>
          Leaderboard
        </button>
        <button type="button" className="min-h-12 bg-signal font-mono text-sm font-semibold text-bg" onClick={() => api.current?.closeShop()}>
          Back
        </button>
      </div>
    </div>
  );
}

function AccountChip() {
  const { user, isPending } = useCurrentUserState();
  if (isPending) return <div className="h-8 w-28 shrink-0 animate-pulse bg-surface-2" />;
  if (!user) return null;
  return (
    <div className="max-w-40 overflow-hidden">
      <UserButton />
    </div>
  );
}
