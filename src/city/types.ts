import type { TargetKind } from "@/game/levels";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Circle {
  cx: number;
  cy: number;
  r: number;
}

export type RoofColor = "blue" | "terracotta" | "charcoal" | "sand" | "grey" | "brick" | "slate" | "teal";
export type CarColor = "white" | "silver" | "black" | "grey" | "red" | "navy" | "beige";
export type LandUse = "residential" | "park" | "commercial" | "plaza" | "reservoir";
export type LakeShape = "circle" | "ellipse" | "blob" | "rect";

export interface House extends Rect {
  kind: "house";
  id: string;
  /** Ridge runs horizontally (h) or vertically (v). */
  ridge: "h" | "v";
  style: "gable" | "hip";
  roof: RoofColor;
  chimney: boolean;
  target: boolean;
}

export interface Building extends Rect {
  kind: "building";
  id: string;
  roof: "white" | "grey" | "dark";
  units: Rect[];
  solar: Rect | null;
}

export interface Tree extends Circle {
  kind: "tree";
  id: string;
  tone: 0 | 1 | 2;
  lobes: Circle[];
  target: boolean;
}

export interface Lake {
  kind: "lake";
  id: string;
  shape: LakeShape;
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  rotation: number;
  /** Outline for blob lakes, in absolute coordinates. */
  path: string | null;
  target: boolean;
}

export interface Car {
  kind: "car";
  id: string;
  cx: number;
  cy: number;
  length: number;
  width: number;
  angle: number;
  color: CarColor;
  target: boolean;
}

export interface Pool extends Rect {
  kind: "pool";
  id: string;
}

export interface Hedge extends Rect {
  kind: "hedge";
  id: string;
}

export interface Shrub extends Circle {
  kind: "shrub";
  id: string;
}

/** Round paved monument plaza: a circular look-alike that is not water. */
export interface Monument extends Circle {
  kind: "monument";
  id: string;
}

export type CityObject = House | Building | Tree | Lake | Car | Pool | Hedge | Shrub | Monument;

export type GroundKind = "lawn" | "lawn2" | "lawn3" | "park" | "parking" | "plaza" | "concrete" | "field" | "bank" | "driveway";

export interface Ground extends Rect {
  kind: GroundKind;
}

export interface Line {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface Road extends Rect {
  orientation: "h" | "v";
  arterial: boolean;
}

export interface Block {
  rect: Rect;
  use: LandUse;
}

export interface Detection {
  id: string;
  box: Rect;
  label: string;
  confidence: number;
}

export interface CityScene {
  width: number;
  height: number;
  seed: number;
  level: number;
  target: TargetKind;
  count: number;
  roads: Road[];
  intersections: Rect[];
  blocks: Block[];
  grounds: Ground[];
  /** Footpaths as SVG path data with stroke width. */
  paths: Array<{ d: string; width: number }>;
  fences: Line[];
  bayLines: Line[];
  objects: CityObject[];
  detections: Detection[];
  /** gsdM: metres per pixel when the tile is shown 1440 px wide. */
  caption: { tile: string; lat: string; lon: string; gsdM: number };
}
