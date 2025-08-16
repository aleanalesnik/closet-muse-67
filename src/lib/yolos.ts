// src/lib/yolos.ts
//
// What this file provides:
// - waitUntilPublic(publicUrl): HEAD polls until the storage URL is actually readable
// - invokeYolosEdge(publicUrl, threshold): calls the Supabase Edge function
// - detectYolosByUrl(publicUrl, threshold): backwards-compatible alias to invokeYolosEdge
// - normalizeBbox(bbox): ensures we store ONE canonical format [x,y,w,h] in 0..1
// - persistEdgeResult(itemId, edge): updates the 'items' row with ONLY edge values
//
// NOTE: The edge now returns: {
//   status: "success",
//   model, latencyMs, result, yolosTopLabels,
//   category, bbox:[x,y,w,h] | null, colorName, colorHex, proposedTitle
// }

import { supabase } from "@/lib/supabase";

export type EdgeSuccess = {
  status: "success";
  model: string;
  latencyMs: number;
  result: any[];
  yolosTopLabels: string[];
  category: string;            // e.g., "Bottoms", "Bags", ...
  bbox: number[] | null;       // normalized [x,y,w,h] in 0..1
  colorName: string;           // e.g., "Black", "Beige"
  colorHex: string;            // e.g., "#000000"
  proposedTitle: string;       // e.g., "Black pants"
};

// ---- Public URL read-iness ---------------------------------------------------

export async function waitUntilPublic(url: string) {
  // Exponential backoff: 250ms -> ~8s total
  for (let i = 0; i < 6; i++) {
    const r = await fetch(url, { method: "HEAD", cache: "no-store" }).catch(() => null);
    if (r?.ok) return;
    await new Promise((res) => setTimeout(res, 250 * Math.pow(2, i)));
  }
  throw new Error("Public URL never became readable");
}

// ---- Edge invocation ---------------------------------------------------------

export async function invokeYolosEdge(publicUrl: string, threshold = 0.12) {
  const { data, error } = await supabase.functions.invoke<EdgeSuccess>("sila-model-debugger", {
    body: { imageUrl: publicUrl, threshold },
  });
  if (error) throw error;
  if (!data || data.status !== "success") {
    throw new Error("YOLOS edge failed: " + JSON.stringify(data));
  }
  return data;
}

// Back-compat name used elsewhere in your app:
export async function detectYolosByUrl(publicUrl: string, threshold = 0.12) {
  return invokeYolosEdge(publicUrl, threshold);
}

// ---- BBox normalization ------------------------------------------------------

export function normalizeBbox(bbox: unknown): number[] | null {
  // We only accept an array of 4 finite numbers in 0..1 -> [x,y,w,h]
  if (!Array.isArray(bbox) || bbox.length !== 4) return null;
  const nums = bbox.map((n) => (typeof n === "number" && isFinite(n) ? n : NaN));
  if (nums.some((n) => Number.isNaN(n))) return null;
  const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
  const [x, y, w, h] = nums as number[];
  return [clamp01(x), clamp01(y), clamp01(w), clamp01(h)];
}

// ---- Persistence to the items table -----------------------------------------

export async function persistEdgeResult(itemId: string, edge: EdgeSuccess) {
  // We persist ONLY what the edge is authoritative for.
  const bbox = normalizeBbox(edge.bbox);

  const updates = {
    title: edge.proposedTitle,
    category: edge.category,
    subcategory: null as unknown as string | null, // user sets later
    color_name: edge.colorName,
    color_hex: edge.colorHex,
    bbox, // numeric[] or null (normalized)
    yolos_model: edge.model,
    yolos_latency_ms: edge.latencyMs,
    yolos_top_labels: edge.yolosTopLabels as unknown as string[], // keep if the column exists
  };

  const { error } = await supabase.from("items").update(updates).eq("id", itemId);
  if (error) throw error;
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
