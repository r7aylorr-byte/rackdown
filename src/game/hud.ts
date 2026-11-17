import type { SpecialId, ToolId } from "@/game/content";
import type { UpgradeId, Upgrades } from "@/game/save";

export type Phase = "boot" | "play" | "pause" | "chaos" | "debrief" | "shop";

export type Hud = {
  phase: Phase;
  touch: boolean;
  ticketOpen: boolean;
  ticketTitle: string;
  ticketId: string;
  ticketBody: string;
  objectives: string[];
  log: string[];
  tool: ToolId;
  toolName: string;
  toolHint: string;
  tools: { id: ToolId; key: string; name: string }[];
  lookTitle: string;
  lookLines: string[];
  lookPrompt: string;
  cross: "idle" | "hot" | "bad";
  credits: number;
  payout: number;
  payoutNote: string;
  outcome: "fixed" | "chaos" | null;
  chaosLeft: number;
  chaosReason: string;
  elapsed: number;
  extinguisher: number;
  extMax: number;
  gas: number;
  water: number;
  upgrades: Upgrades;
  prices: { id: UpgradeId; name: string; cost: number; blurb: string }[];
  consumables: { id: SpecialId; name: string; cost: number; blurb: string; count: number }[];
  flash: number;
  alarm: boolean;
  holding: string;
  statsLine: string;
  error: string;
};

export function emptyHud(): Hud {
  return {
    phase: "boot",
    touch: false,
    ticketOpen: true,
    ticketTitle: "Pulling the queue",
    ticketId: "INC-····",
    ticketBody: "The rack is spinning up.",
    objectives: [],
    log: [],
    tool: "hands",
    toolName: "Hands",
    toolHint: "",
    tools: [],
    lookTitle: "",
    lookLines: [],
    lookPrompt: "",
    cross: "idle",
    credits: 0,
    payout: 0,
    payoutNote: "",
    outcome: null,
    chaosLeft: 30,
    chaosReason: "",
    elapsed: 0,
    extinguisher: 1,
    extMax: 1,
    gas: 1,
    water: 1,
    upgrades: { gloves: false, co2: false, maul: false, visor: false, kit: false },
    prices: [],
    consumables: [],
    flash: 0,
    alarm: false,
    holding: "",
    statsLine: "",
    error: "",
  };
}
