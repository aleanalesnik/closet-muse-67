// src/lib/aiMapping.ts
export type BBox = { xmin: number; ymin: number; xmax: number; ymax: number };
export type Det = { label: string; score: number; box?: BBox };

const PART_LABELS = new Set([
  "sleeve","collar","neckline","pocket","zipper","button","hem","waistband","cuff","lapel"
]);

// YOLOS → our taxonomy (garment-level only). Return null for parts.
export function mapLabel(label: string):
  | { category: string; subcategory: string }
  | null {
  const s = label.toLowerCase();
  if (PART_LABELS.has(s)) return null;

  if (/(handbag|bag|tote|shoulder bag)/.test(s)) return { category: "bag", subcategory: "handbag" };
  if (/backpack/.test(s))                     return { category: "bag", subcategory: "backpack" };
  if (/(belt)/.test(s))                       return { category: "accessory", subcategory: "belt" };
  if (/(sunglasses|glasses)/.test(s))         return { category: "accessory", subcategory: "sunglasses" };
  if (/(hat|cap|beanie)/.test(s))             return { category: "accessory", subcategory: "hat" };
  if (/boots?/.test(s))                       return { category: "shoes", subcategory: "boots" };
  if (/(sneaker|trainer|shoe)/.test(s))       return { category: "shoes", subcategory: "sneakers" };
  if (/dress/.test(s))                        return { category: "dress", subcategory: "dress" };
  if (/skirt/.test(s))                        return { category: "bottoms", subcategory: "skirt" };
  if (/(jeans|pants|trousers)/.test(s))       return { category: "bottoms", subcategory: "trousers" };
  if (/shorts/.test(s))                       return { category: "bottoms", subcategory: "shorts" };
  if (/(t-?shirt|tee)/.test(s))               return { category: "tops", subcategory: "t-shirt" };
  if (/(sweater|knit|jumper)/.test(s))        return { category: "tops", subcategory: "sweater" };
  if (/(jacket|coat|blazer|outerwear)/.test(s)) return { category: "outerwear", subcategory: "jacket" };

  // unknown = clothing, but still garment-level
  if (/clothing|apparel|garment/.test(s))     return { category: "clothing", subcategory: "item" };

  return null;
}

export function isValidItemBox(det: Det): boolean {
  if (!det.box) return false;
  if (PART_LABELS.has(det.label?.toLowerCase?.() ?? "")) return false;

  const w = det.box.xmax - det.box.xmin;
  const h = det.box.ymax - det.box.ymin;
  const area = Math.max(0, w * h);
  if (area < 0.06) return false;               // ignore tiny boxes
  // allow very wide for belts; otherwise reject ultra-extreme aspect ratios
  const ar = w / Math.max(h, 1e-6);
  if (!/belt/i.test(det.label) && (ar > 4.5 || ar < 0.2)) return false;
  return true;
}

// Title: prefer mapped garment + color; never use part labels.
export function makeTitle(opts: {
  colorName?: string | null;
  mapped?: { category: string; subcategory: string } | null;
  fallback?: string; // e.g. from filename
}) {
  const color = opts.colorName?.toLowerCase?.();
  const nounBySub: Record<string,string> = {
    "t-shirt":"t-shirt", sweater:"sweater", skirt:"skirt", trousers:"jeans",
    shorts:"shorts", jacket:"jacket", dress:"dress", sneakers:"sneakers",
    boots:"boots", handbag:"bag", backpack:"backpack", "item":"clothing"
  };
  if (opts.mapped) {
    const noun = nounBySub[opts.mapped.subcategory] ?? "clothing";
    return color ? `${capitalize(color)} ${noun}` : capitalize(noun);
  }
  return color ? `${capitalize(color)} clothing` : (opts.fallback ?? "Clothing");
}

function capitalize(s:string){ return s ? s[0].toUpperCase()+s.slice(1) : s; }

// Color from FULL image (not bbox), then snap to fixed palette
import { getDominantColor, snapToPalette as snapToColorPalette, PALETTE } from './color.js';

export async function dominantHexFromUrl(url: string): Promise<string> {
  const rgb = await getDominantColor(url);
  return rgbToHex(rgb.r, rgb.g, rgb.b);
}

export function snapToPalette(hex: string) {
  const [r, g, b] = hexToRgb(hex);
  return snapToColorPalette({ r, g, b });
}

// Convert numeric bbox array to BBox object
export function toBBox(bbox: number[] | null): BBox | null {
  if (!bbox || bbox.length !== 4) return null;
  const [xmin, ymin, xmax, ymax] = bbox;
  return { xmin, ymin, xmax, ymax };
}

// Helper for filename normalization
export function humanizeFileName(filename: string): string {
  const base = filename.replace(/\.(jpe?g|png|gif|webp)$/i, '');
  return base.replace(/[_-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// utils
function loadImage(url:string){ return new Promise<HTMLImageElement>((res,rej)=>{ const i=new Image(); i.crossOrigin="anonymous"; i.onload=()=>res(i); i.onerror=rej; i.src=url; });}
function makeCanvas(w:number,h:number){ const c=document.createElement("canvas"); c.width=w;c.height=h; const ctx=c.getContext("2d")!; return {canvas:c,ctx}; }
function rgbToHex(r:number,g:number,b:number){ const h=(n:number)=>n.toString(16).padStart(2,"0"); return `#${h(r)}${h(g)}${h(b)}`;}
function hexToRgb(hex:string){ const n=parseInt(hex.slice(1),16); return [(n>>16)&255,(n>>8)&255,n&255]; }