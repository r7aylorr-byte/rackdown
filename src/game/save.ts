import type { SpecialId } from "@/game/content";

export type UpgradeId = "gloves" | "co2" | "maul" | "visor" | "kit";

export type Upgrades = Record<UpgradeId, boolean>;

export type SpecialStock = Record<SpecialId, number>;

export type SaveData = {
  version: 1;
  credits: number;
  fixed: number;
  chaos: number;
  shifts: number;
  upgrades: Upgrades;
  specials: SpecialStock;
};

export const UPGRADE_CATALOG: { id: UpgradeId; name: string; cost: number; blurb: string }[] = [
  {
    id: "gloves",
    name: "Arc gloves",
    cost: 280,
    blurb: "Wrong feeds and wet boards build an arc more slowly.",
  },
  {
    id: "co2",
    name: "CO2 twin tank",
    cost: 220,
    blurb: "The extinguisher holds more and spends slower.",
  },
  {
    id: "maul",
    name: "Maul bit",
    cost: 320,
    blurb: "Sledge, bat, and wrench hit harder.",
  },
  {
    id: "visor",
    name: "IR visor",
    cost: 260,
    blurb: "Inspect shows degrees, moisture, jacket, and arc charge.",
  },
  {
    id: "kit",
    name: "Weld kit",
    cost: 240,
    blurb: "Cut jackets and IB jumpers mend twice as fast.",
  },
];

const KEY = "rackdown-save-v1";

function countOf(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

export function emptyUpgrades(): Upgrades {
  return { gloves: false, co2: false, maul: false, visor: false, kit: false };
}

export function emptySpecials(): SpecialStock {
  return { balloon: 0, jack: 0, nailer: 0 };
}

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) throw new Error("empty");
    const parsed = JSON.parse(raw) as Partial<SaveData>;
    const prior = (parsed.specials ?? {}) as Partial<SpecialStock>;
    return {
      version: 1,
      credits: typeof parsed.credits === "number" ? parsed.credits : 0,
      fixed: typeof parsed.fixed === "number" ? parsed.fixed : 0,
      chaos: typeof parsed.chaos === "number" ? parsed.chaos : 0,
      shifts: typeof parsed.shifts === "number" ? parsed.shifts : 0,
      upgrades: { ...emptyUpgrades(), ...(parsed.upgrades ?? {}) },
      specials: {
        balloon: countOf(prior.balloon),
        jack: countOf(prior.jack),
        nailer: countOf(prior.nailer),
      },
    };
  } catch {
    return { version: 1, credits: 0, fixed: 0, chaos: 0, shifts: 0, upgrades: emptyUpgrades(), specials: emptySpecials() };
  }
}

export function writeSave(data: SaveData) {
  localStorage.setItem(KEY, JSON.stringify(data));
}
