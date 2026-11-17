export type SpecialId = "balloon" | "jack" | "nailer";

export type ToolId =
  | "hands"
  | "sledge"
  | "bat"
  | "wrench"
  | "torch"
  | "washer"
  | "welder"
  | "gas"
  | "saw"
  | "extinguisher"
  | SpecialId;

export function isSpecial(id: string): id is SpecialId {
  return id === "balloon" || id === "jack" || id === "nailer";
}

export type ScenarioId = "unplug" | "loose" | "fan" | "swap" | "nick" | "wet" | "double";

export const TOOLS: {
  id: ToolId;
  key: string;
  code: string;
  name: string;
  short: string;
  hint: string;
}[] = [
  {
    id: "hands",
    key: "1",
    code: "Digit1",
    name: "Hands",
    short: "HND",
    hint: "Drag looks around. E slides a GPU or headnode out, swaps the parts on top, and seats cables. Hold E on HEAD-01 to post.",
  },
  {
    id: "sledge",
    key: "2",
    code: "Digit2",
    name: "Sledge",
    short: "SLG",
    hint: "Slow and heavy. Enough of these and the ticket is scrap.",
  },
  {
    id: "bat",
    key: "3",
    code: "Digit3",
    name: "Bat",
    short: "BAT",
    hint: "Faster swings. The metal still remembers.",
  },
  {
    id: "wrench",
    key: "4",
    code: "Digit4",
    name: "Wrench",
    short: "WRN",
    hint: "Click to dent. Hold E on a loose lug to torque it. A cut jacket needs the welder.",
  },
  {
    id: "torch",
    key: "5",
    code: "Digit5",
    name: "Torch",
    short: "TRC",
    hint: "Cuts jackets and lights gas, oil, and eventually the row.",
  },
  {
    id: "washer",
    key: "6",
    code: "Digit6",
    name: "Washer",
    short: "WSH",
    hint: "Knocks fire down. Soaks live boards — wet and powered will arc.",
  },
  {
    id: "welder",
    key: "7",
    code: "Digit7",
    name: "Welder",
    short: "WLD",
    hint: "Hold on a cut whip or IB jumper to mend it. On a chassis, it cooks.",
  },
  {
    id: "gas",
    key: "8",
    code: "Digit8",
    name: "Gas can",
    short: "GAS",
    hint: "Pour a puddle. A torch, a welder, or an arc will light it.",
  },
  {
    id: "saw",
    key: "9",
    code: "Digit9",
    name: "Saw",
    short: "SAW",
    hint: "Chews bezels, fiber, and IB jumpers. Sparks hard.",
  },
  {
    id: "extinguisher",
    key: "0",
    code: "Digit0",
    name: "CO2",
    short: "CO2",
    hint: "Puts fire out without soaking gear. Refill at the left cabinet.",
  },
];

export const SPECIALS: {
  id: SpecialId;
  key: string;
  code: string;
  name: string;
  short: string;
  hint: string;
  cost: number;
  blurb: string;
}[] = [
  {
    id: "balloon",
    key: "Q",
    code: "KeyQ",
    name: "Water balloon",
    short: "BLN",
    hint: "One throw. Three times a sledge hit, and it soaks the node it bursts on.",
    cost: 160,
    blurb: "One throw. Triple a sledge hit, then the node is soaked.",
  },
  {
    id: "jack",
    key: "F",
    code: "KeyF",
    name: "Jackhammer",
    short: "JAK",
    hint: "One slam. Three times a sledge hit. The bit does not come back.",
    cost: 210,
    blurb: "One slam. Triple a sledge hit. Scrap after you swing.",
  },
  {
    id: "nailer",
    key: "G",
    code: "KeyG",
    name: "Roofing nailer",
    short: "NIL",
    hint: "One burst. Three times a sledge hit, jackets included.",
    cost: 190,
    blurb: "One burst. Triple a sledge hit, through iron or a whip.",
  },
];

export const SCENARIO_ORDER: ScenarioId[] = [
  "unplug",
  "loose",
  "fan",
  "swap",
  "nick",
  "wet",
  "double",
];

export const SCENARIOS: Record<ScenarioId, { title: string; body: string }> = {
  unplug: {
    title: "NCCL abort — GPU-04 dark",
    body: "atlas-train died mid-step. TOR P4 has no carrier. GPU-04's DAC is hanging off the face. Seat it on the labeled port, then hold E on HEAD-01 to post the job.",
  },
  loose: {
    title: "Arc marks on PDU-B G1",
    body: "GPU-01's lug is under-torqued and ticking. Wrench out, hold E on that whip until it seats. Leave it and the breaker will save you the hard way.",
  },
  fan: {
    title: "GPU-03 thermal runaway",
    body: "The fan on GPU-03 is loose. Eject the sled — amber latch on the right of the face — seat or replace the fan on top, then slide it home. A spare fan is on the bench.",
  },
  swap: {
    title: "Brownout on the B feed",
    body: "Last night's PSU swap crossed the GPU-02 and GPU-03 whips. Phase mismatch will arc. PDU-B is the map: G2 feeds GPU-02, G3 feeds GPU-03.",
  },
  nick: {
    title: "Nicked jacket, GPU-02 whip",
    body: "Insulation is cut on the GPU-02 power whip. A wrench will not close a wound. Pull it dead, then hold the welder on the jacket.",
  },
  wet: {
    title: "CRAC drip on GPU-04",
    body: "Condensate wet the GPU-04 sled. It is powered and starting to tick. Pull the whip and let it dry before you seat it. The pressure washer makes this worse.",
  },
  double: {
    title: "Scheduler can't see the fabric",
    body: "HEAD-01 is patched into a dead optic on the TOR, and GPU-02 has no power whip at all. Two faults. The labels on the iron are the truth.",
  },
};
