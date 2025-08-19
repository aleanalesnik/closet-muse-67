// src/lib/yolos.ts
export type BBoxArray = [number, number, number, number]; // generic bbox tuple

export type EdgeDet = {
  score: number;
  label: string;
  box: BBoxArray | null;
};

export type EdgeResponse = {
  status: "success";
  build: string;
  category: string;           // <-- TRUST THIS
  bbox: BBoxArray | null;      // <-- TRUST THIS (already [x,y,w,h])
  proposedTitle?: string | null;
  colorName?: string | null;
  colorHex?: string | null;
  yolosTopLabels?: string[];
  result: EdgeDet[];
  latencyMs: number;
  model: string;
};

/**
 * Best-effort bbox parser.
 * - Arrays are returned as number tuples if all entries are finite.
 * - Object form { xmin, ymin, xmax, ymax } is converted to an array.
 * This function does not try to normalize or interpret the values; the
 * SmartCropImg component will convert pixel or normalized boxes as needed.
 */
export function normalizeBbox(b: any): BBoxArray | null {
  if (!b) return null;

  if (Array.isArray(b) && b.length === 4) {
    const arr = b.map(Number);
    return arr.every(Number.isFinite) ? (arr as BBoxArray) : null;
  }

  if (typeof b === "object" && b !== null) {
    const arr = [b.xmin, b.ymin, b.xmax, b.ymax].map(Number);
    return arr.every(Number.isFinite) ? (arr as BBoxArray) : null;
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
  if (!r.ok) throw new Error(`Edge error ${r.status}: ${await r.text().catch(() => "")}`);
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
