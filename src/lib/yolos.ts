// src/lib/yolos.ts
export type NormBbox = [number, number, number, number]; // [x,y,w,h], normalized 0..1

export type EdgeDet = {
  score: number;
  label: string;
  box: NormBbox | null;
};

export type EdgeResponse = {
  status: "success";
  build: string;
  category: string;           // <-- TRUST THIS
  bbox: NormBbox | null;      // <-- TRUST THIS (already [x,y,w,h])
  proposedTitle?: string | null;
  colorName?: string | null;
  colorHex?: string | null;
  yolosTopLabels?: string[];
  result: EdgeDet[];
  latencyMs: number;
  model: string;
};

function clamp01(n: number) {
  return Math.min(1, Math.max(0, n));
}

/**
 * Deterministic normalizer:
 * - Arrays whose values are all in [0,1] are treated as normalized [x,y,w,h] (no guessing).
 * - Object form { xmin, ymin, xmax, ymax } is converted to xywh and clamped to [0,1].
 * - Any pixel-space arrays (>1) are rejected here (edge returns normalized; old rows should
 *   be handled by SmartCrop guard below).
 */
export function normalizeBbox(b: any): NormBbox | null {
  if (!b) return null;

  // Object form -> xyxy -> xywh
  if (typeof b === "object" && !Array.isArray(b)) {
    const arr = [b.xmin, b.ymin, b.xmax, b.ymax].map(Number);
    if (arr.every(Number.isFinite)) {
      let [x1, y1, x2, y2] = arr;
      const w = clamp01(x2 - x1);
      const h = clamp01(y2 - y1);
      if (w <= 0 || h <= 0) return null;
      return [clamp01(x1), clamp01(y1), w, h];
    }
    return null;
  }

  // Array form
  if (Array.isArray(b) && b.length === 4) {
    const [x, y, w, h] = b.map(Number);
    if (![x, y, w, h].every(Number.isFinite)) return null;

    const allIn01 = [x, y, w, h].every(v => v >= 0 && v <= 1);
    if (allIn01) {
      if (w <= 0 || h <= 0) return null;
      return [clamp01(x), clamp01(y), clamp01(w), clamp01(h)];
    }

    // Not normalized (likely pixels) — reject here. The component guard will avoid mis-crops.
    return null;
  }

  return null;
}

export async function analyzeImage(functionUrl: string, imageUrl: string, jwt: string): Promise<EdgeResponse> {
  const r = await fetch(functionUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${jwt}`,
      apikey: jwt,
    },
    body: JSON.stringify({ imageUrl }),
  });
  if (!r.ok) throw new Error(`Edge error ${r.status}: ${await r.text().catch(()=>"")}`);
  const raw = await r.json();

  // Normalize defensively (keeps old rows safe)
  raw.bbox = normalizeBbox(raw.bbox);
  if (Array.isArray(raw.result)) {
    raw.result = raw.result.map((d: any) => ({ ...d, box: normalizeBbox(d.box) })).filter((d: any) => d.box);
  }
  return raw as EdgeResponse;
}

export async function waitUntilPublic(url: string) {
  for (let i = 0; i < 6; i++) {
    const r = await fetch(url, { method: "HEAD", cache: "no-store" }).catch(() => null);
    if (r?.ok) return;
    await new Promise((res) => setTimeout(res, 250 * Math.pow(2, i))); // 250ms → 8s
  }
  throw new Error("Public URL never became readable");
}
