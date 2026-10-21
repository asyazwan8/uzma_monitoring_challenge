import type { CarColor, GroundKind, RoofColor } from "./types";

/**
 * Map palette: cool, slightly desaturated daylight imagery (per the brand's
 * imagery rule). Map-only colours: never reuse these for UI chrome.
 */

export const GROUND: Record<GroundKind, string> = {
  lawn: "#8E9F78",
  lawn2: "#97A57D",
  lawn3: "#869872",
  park: "#7F9A6A",
  parking: "#6C7177",
  plaza: "#C4BCAA",
  concrete: "#B3AEA3",
  field: "#7FA05F",
  bank: "#869C6E",
  driveway: "#C1BAAB",
};

export const ROAD = {
  asphalt: "#4F555C",
  arterial: "#484E55",
  sidewalk: "#B9B3A6",
  kerb: "#9C968A",
  marking: "#E4DFCF",
  centreLine: "#D2B65E",
  crossing: "#E9E5D8",
};

export const LINEWORK = {
  fence: "#6E7F5E",
  bay: "#D9D5C8",
  path: "#D3C9B1",
  pathEdge: "#B9AE95",
};

export interface RoofTone {
  lit: string;
  shade: string;
  ridge: string;
  edge: string;
}

export const ROOFS: Record<RoofColor, RoofTone> = {
  blue: { lit: "#4383C9", shade: "#285894", ridge: "#7DAEE0", edge: "#1C416E" },
  terracotta: { lit: "#BD6E50", shade: "#8D4A35", ridge: "#D69479", edge: "#663323" },
  charcoal: { lit: "#666B72", shade: "#46494F", ridge: "#878D94", edge: "#2F3236" },
  sand: { lit: "#D2BF9A", shade: "#A6936F", ridge: "#E6D7B8", edge: "#7E6E50" },
  grey: { lit: "#B0B3B7", shade: "#86898E", ridge: "#CDD0D3", edge: "#63666A" },
  brick: { lit: "#94574A", shade: "#6C3B31", ridge: "#B07366", edge: "#4D2921" },
  // Hard+ look-alikes: cool, but clearly not blue.
  slate: { lit: "#717D89", shade: "#525C66", ridge: "#8E99A4", edge: "#3A424A" },
  teal: { lit: "#55928A", shade: "#3A6B64", ridge: "#76AFA6", edge: "#294E49" },
};

export const FLAT_ROOFS = {
  white: { fill: "#E2E0D9", parapet: "#C5C2B9", unit: "#B4B6B8" },
  grey: { fill: "#A7AAAD", parapet: "#8D9094", unit: "#C8CACC" },
  dark: { fill: "#5D6166", parapet: "#4A4E53", unit: "#8E9296" },
};

export const SOLAR = { cell: "#26364A", grid: "#4F6884", frame: "#C9CDD2" };

export const CARS: Record<CarColor, { body: string; roof: string }> = {
  white: { body: "#ECEBE7", roof: "#F8F7F4" },
  silver: { body: "#B8BCC1", roof: "#CED1D5" },
  black: { body: "#2A2D31", roof: "#3A3E43" },
  grey: { body: "#72777D", roof: "#868B91" },
  red: { body: "#8E302B", roof: "#A6443E" },
  navy: { body: "#2E4766", roof: "#3E5A7E" },
  beige: { body: "#BFAE8C", roof: "#D1C2A3" },
};

export const GLASS = "#1E2429";

export const TREES: Array<{ light: string; mid: string; dark: string }> = [
  { light: "#7FA35F", mid: "#5D8445", dark: "#3E6232" },
  { light: "#8AA866", mid: "#67894B", dark: "#466A36" },
  { light: "#6F975A", mid: "#507A42", dark: "#355A2F" },
];

export const SHRUB = { fill: "#A3B26E", edge: "#7F8F52" };
export const HEDGE = { fill: "#4E6E3F", top: "#62844F" };

export const WATER = { deep: "#2D6C93", mid: "#3B82AB", shallow: "#6AA6C4", rim: "#CDC3A3", glint: "#B9D7E6" };
export const POOL = { water: "#5FB4C8", deep: "#3E97AE", coping: "#E7E3D8" };
export const MONUMENT = { paving: "#D6CFBF", ring: "#B2A993", centre: "#9C9381" };

export const SHADOW = "#0F1B24";
