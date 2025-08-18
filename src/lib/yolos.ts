// src/lib/yolos.ts
export type NormBbox = [number, number, number, number]; // [x,y,w,h] normalized

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

/** Accepts [x,y,w,h], [x1,y1,x2,y2], or {xmin,...}; always returns [x,y,w,h] */
export function normalizeBbox(b: any): NormBbox | null {
  if (!b) return null;

  if (Array.isArray(b) && b.length === 4) {
    const [a,b1,c,d] = b.map(Number);
    if ([a,b1,c,d].every(Number.isFinite)) {
      // Heuristic: xyxy if c > a && d > b1, else assume xywh
      if (c > a && d > b1) {
        const w = clamp01(c - a);
        const h = clamp01(d - b1);
        if (w <= 0 || h <= 0) return null;
        return [clamp01(a), clamp01(b1), w, h];
      }
      if (c > 0 && d > 0) return [clamp01(a), clamp01(b1), clamp01(c), clamp01(d)];
    }
  } else if (typeof b === "object") {
    const arr = [b.xmin, b.ymin, b.xmax, b.ymax].map((n) => Number(n));
    if (arr.every(Number.isFinite)) {
      const [x1,y1,x2,y2] = arr;
      const w = clamp01(x2 - x1);
      const h = clamp01(y2 - y1);
      if (w <= 0 || h <= 0) return null;
      return [clamp01(x1), clamp01(y1), w, h];
    }
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
