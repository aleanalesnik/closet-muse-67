// src/lib/yolos.ts
import { supabase } from "@/lib/supabase";

/** Wait until a Supabase public storage URL is readable */
export async function waitUntilPublic(url: string) {
  for (let i = 0; i < 6; i++) {
    const r = await fetch(url, { method: "HEAD", cache: "no-store" }).catch(() => null);
    if (r?.ok) return;
    await new Promise(res => setTimeout(res, 250 * Math.pow(2, i))); // 250ms→8s
  }
  throw new Error("Public URL never became readable");
}

export type BBox = [number, number, number, number]; // [x1,y1,x2,y2] absolute pixels or normalized (client decides)
export type YolosRawDet = { score:number; label:string; box?:{ xmin:number; ymin:number; xmax:number; ymax:number } };

export type YolosEdgeSuccess = {
  status: "success";
  model: string;
  latencyMs: number;
  result: YolosRawDet[];
  yolosTopLabels: string[];
  category: string;
  bbox: { xmin:number; ymin:number; xmax:number; ymax:number } | null;
  colorName: string | null;
  colorHex: string | null;
  proposedTitle: string | null;
};

export type YolosEdgeFail = {
  status: "fail";
  stop?: string;
  error?: string;
  latencyMs?: number;
};

export type YolosEdgeResponse = YolosEdgeSuccess | YolosEdgeFail;

export async function detectYolosByUrl(publicUrl: string, threshold = 0.12): Promise<YolosEdgeResponse> {
  // Critical: do NOT throw on non-2xx, we always want the JSON body.
  const { data, error } = await supabase.functions.invoke("sila-model-debugger", {
    body: { imageUrl: publicUrl, threshold },
    // @ts-ignore - supabase-js accepts this option
    throwOnError: false,
  });
  if (error && !data) {
    return { status: "fail", stop: "invoke", error: String(error) };
  }
  return (data as YolosEdgeResponse) ?? { status: "fail", stop: "empty" };
}

/** Normalize bbox to [x1,y1,x2,y2] numbers. Returns null if invalid. */
export function normalizeBBox(b: any): BBox | null {
  if (!b) return null;
  if (Array.isArray(b) && b.length === 4) {
    const [x1,y1,x2,y2] = b.map(Number);
    if ([x1,y1,x2,y2].some(n => !Number.isFinite(n))) return null;
    if (x2 <= x1 || y2 <= y1) return null;
    return [x1,y1,x2,y2];
  }
  if (typeof b === "object" && b !== null) {
    const x1 = Number(b.xmin), y1 = Number(b.ymin), x2 = Number(b.xmax), y2 = Number(b.ymax);
    if ([x1,y1,x2,y2].some(n => !Number.isFinite(n))) return null;
    if (x2 <= x1 || y2 <= y1) return null;
    return [x1,y1,x2,y2];
  }
  return null;
}

/** Build a nice default title (only if backend didn't provide one). */
export function buildTitle(colorName: string | null | undefined, category: string | null | undefined) {
  const c = (colorName ?? "").trim();
  const k = (category ?? "").trim();
  if (c && k) return `${c} ${k.toLowerCase()}`;
  if (k) return k;
  if (c) return `${c} item`;
  return "Clothing item";
}

// -----------------------------------------------------------------------------
// The helpers below are kept for compatibility with any older code paths that
// might still import them. The edge now returns category/title, so these are
// generally not needed for new logic.
// -----------------------------------------------------------------------------

export type YolosBox = { xmin: number; ymin: number; xmax: number; ymax: number };
export type YolosPred = { score: number; label: string; box: YolosBox };

// Part labels to exclude from category mapping (legacy)
const PART_LABELS = new Set([
  "hood",
  "collar",
  "lapel",
  "epaulette",
  "sleeve",
  "pocket",
  "neckline",
  "buckle",
  "zipper",
  "applique",
  "bead",
  "bow",
  "flower",
  "fringe",
  "ribbon",
  "rivet",
  "ruffle",
  "sequin",
  "tassel",
]);

function norm(s?: string) {
  return (s ?? "").toLowerCase().trim();
}

// Legacy label -> coarse category mapper (prefer edge.category now)
export function mapLabelToCategory(label?: string): string | null {
  const L = norm(label);
  if (!L || PART_LABELS.has(L)) return null;
  if (L.includes("dress") || L.includes("jumpsuit")) return "dress";
  if (L.includes("skirt") || L.includes("pants") || L.includes("shorts")) return "bottom";
  if (
    L.includes("shirt, blouse") ||
    L.includes("top, t-shirt, sweatshirt") ||
    L.includes("sweater") ||
    L.includes("cardigan") ||
    L.includes("vest")
  )
    return "top";
  if (L.includes("jacket") || L.includes("coat") || L.includes("cape")) return "outerwear";
  if (L.includes("shoe")) return "shoes";
  if (L.includes("bag, wallet")) return "bag";
  if (
    L.includes("belt") ||
    L.includes("glove") ||
    L.includes("scarf") ||
    L.includes("umbrella") ||
    L.includes("glasses") ||
    L.includes("hat") ||
    L.includes("tie") ||
    L.includes("leg warmer") ||
    L.includes("tights, stockings") ||
    L.includes("sock")
  ) {
    return "accessory";
  }
  return "clothing";
}

// Legacy title generator (prefer edge.proposedTitle now)
export function generateTitle({
  colorName,
  category,
}: {
  colorName?: string | null;
  category?: string | null;
}): string {
  const c = (colorName ?? "").trim();
  const k = (category ?? "").trim();
  if (c && k) return `${c} ${k}`;
  if (k) return k;
  if (c) return `${c} item`;
  return "Clothing item";
}

// Legacy "primary" picker (we now let the edge pick & normalize)
export function pickPrimary(preds: YolosPred[]): YolosPred | null {
  return (
    preds
      ?.filter((p) => (p?.score ?? 0) >= 0.12 && p?.box)
      .sort((a, b) => {
        const s = b.score - a.score;
        if (s !== 0) return s;
        const area = (p: YolosPred) =>
          Math.max(1, p.box.xmax - p.box.xmin) * Math.max(1, p.box.ymax - p.box.ymin);
        return area(b) - area(a);
      })[0] ?? null
  );
}
