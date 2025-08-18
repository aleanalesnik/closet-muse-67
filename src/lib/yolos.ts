// src/lib/yolos.ts
import { supabase } from "@/lib/supabase";
import { getDominantColor, snapToPalette } from "@/lib/color";

export type NormBbox = [number, number, number, number]; // xywh in 0..1
export type TrimDet = { score: number; label: string; box: NormBbox | null };

export type EdgeResponse = {
  status: "success";
  category: string;                 // e.g., "Tops", "Bottoms", "Bags", etc.
  bbox: NormBbox | null;            // normalized [x,y,w,h] or null
  proposedTitle: string;            // e.g., "Bags", "Dress"
  colorName: null;                  // always null from edge
  colorHex: null;                   // always null from edge
  yolosTopLabels: string[];         // top detected labels
  result: TrimDet[];                // detection results for visualization
  latencyMs: number;
  model: string;
};

export async function waitUntilPublic(url: string) {
  for (let i = 0; i < 6; i++) {
    const r = await fetch(url, { method: "HEAD", cache: "no-store" }).catch(() => null);
    if (r?.ok) return;
    await new Promise((res) => setTimeout(res, 250 * Math.pow(2, i))); // 250ms → 8s
  }
  throw new Error("Public URL never became readable");
}

function clamp01(n: number) { return Math.min(1, Math.max(0, n)); }

export function normalizeBbox(b: any): NormBbox | null {
  if (!b) return null;
  let arr: number[] | null = null;
  if (Array.isArray(b) && b.length === 4) arr = b.map(Number);
  else if (typeof b === "object") {
    const may = [b.xmin, b.ymin, b.xmax, b.ymax].map((n:any) => Number(n));
    if (may.every(Number.isFinite)) arr = may;
  }
  if (!arr || arr.some(v => !Number.isFinite(v))) return null;
  let [a,b1,c,d] = arr.map(clamp01);
  const looksXYXY = c > a && d > b1 && c <= 1 && d <= 1;
  if (looksXYXY) {
    const w = clamp01(c - a), h = clamp01(d - b1);
    if (w <= 0 || h <= 0) return null;
    return [a, b1, w, h];
  }
  if (c <= 0 || d <= 0) return null; // invalid xywh
  return [a, b1, c, d];
}

function singularizeCategory(k: string): string {
  const s = k.toLowerCase();
  if (s === "bottoms") return "bottoms"; // Keep "bottoms" plural
  if (s === "tops") return "tops"; // Keep "tops" plural
  return k.toLowerCase();
}

export async function invokeYolos(publicUrl: string): Promise<EdgeResponse> {
  const { data, error } = await supabase.functions.invoke("sila-model-debugger", {
    body: { imageUrl: publicUrl, threshold: 0.12 },
  });
  if (error) throw error;
  if (!data || data.status !== "success") {
    throw new Error("YOLOS failed: " + JSON.stringify(data));
  }
  // Make sure bbox is normalized array or null
  data.bbox = normalizeBbox(data.bbox);
  return data as EdgeResponse;
}

/**
 * Full analysis step used by your upload flow:
 * - Call edge (category + optional bbox + trimmed detections)
 * - Compute dominant color client-side
 * - Snap to your palette
 * - Build title "{ColorName} {categorySingular}"
 */
export async function analyzeImage(publicUrl: string) {
  const edge = await invokeYolos(publicUrl);

  // Compute color on the client (avoid server "always black" fallbacks)
  const rgb = await getDominantColor(publicUrl).catch(() => null);
  const snapped = rgb ? snapToPalette(rgb) : null;

  const category = edge.category; // Trust category from edge (CLIP-based)
  const categorySingular = singularizeCategory(category);
  const colorName = snapped?.name ?? null;
  const colorHex = snapped?.hex ?? null;

  // Start with proposedTitle from edge, update with color when available
  const title = colorName ? `${colorName} ${categorySingular}` : edge.proposedTitle;

  // Edge function already returns [x, y, width, height] format - use directly
  const bbox = edge.bbox;

  return {
    // Persist exactly these:
    title,
    category, // e.g., "Tops", "Bottoms", "Bags", etc.
    subcategory: null, // Keep null until user chooses
    color_name: colorName, // snapped or null
    color_hex: colorHex, // snapped or null
    bbox, // normalized [x,y,w,h] or null
    yolos_result: edge.result, // detection results
    yolos_top_labels: edge.yolosTopLabels,
    yolos_model: edge.model,
    yolos_latency_ms: edge.latencyMs,
  };
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
