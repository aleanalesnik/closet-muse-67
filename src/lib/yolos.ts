// src/lib/yolos.ts
import { supabase } from "@/lib/supabase";
import { getDominantColor, snapToPalette } from "@/lib/color";

export type NormBbox = [number, number, number, number];
export type TrimDet = { score: number; label: string; box: NormBbox | null };

export type EdgeResponse = {
  status: "success";
  category: string;                 // e.g., "Tops", "Bottoms", "Bags", etc.
  bbox: NormBbox | null;            // normalized [x1,y1,x2,y2] or null
  proposedTitle: string;            // e.g., "Bags", "Dress"
  colorName: null;                  // always null from edge
  colorHex: null;                   // always null from edge
  yolosTopLabels: string[];         // for debug
  result: TrimDet[];                // trimmed detections for overlay
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

export function normalizeBbox(b: any): NormBbox | null {
  if (!Array.isArray(b) || b.length !== 4) return null;
  const [x1, y1, x2, y2] = b.map((v: any) => Number(v));
  if (![x1, y1, x2, y2].every(Number.isFinite)) return null;
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  const nx1 = clamp(Math.min(x1, x2));
  const ny1 = clamp(Math.min(y1, y2));
  const nx2 = clamp(Math.max(x1, x2));
  const ny2 = clamp(Math.max(y1, y2));
  if (nx2 - nx1 < 0.001 || ny2 - ny1 < 0.001) return null;
  return [nx1, ny1, nx2, ny2];
}

function singularizeCategory(k: string): string {
  const s = k.toLowerCase();
  if (s === "bottoms") return "bottom";
  if (s === "tops") return "top";
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
    yolos_result: edge.result, // trimmed array (for Debug overlay)
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
