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
  yolosTopLabels?: string[] | null;
  result?: EdgeDet[];         // <-- optional detector results
};

/**
 * normalizeBbox:
 * Accepts array or object forms and returns a plain 4-number tuple or null.
 * - Arrays are returned as number tuples if all entries are finite.
 * - Object form { xmin, ymin, xmax, ymax } is converted to an array.
 * This function does not try to normalize or interpret the values; the
 * SmartCropImg component will convert pixel or normalized boxes as needed.
 */
// Converts 0–100 percent-based [x,y,w,h] into 0–1 if detected.
// Pass-through for 0–1 or pixel-space (which SmartCropImg can handle later with dimensions).
export function toUnitBox(b: BBoxArray | null): BBoxArray | null {
  if (!b) return null;
  const max = Math.max(...b);
  if (max > 1 && max <= 100) {
    return [b[0] / 100, b[1] / 100, b[2] / 100, b[3] / 100] as BBoxArray;
  }
  return b;
}

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

export async function analyzeImage(file: File, { threshold = 0.12 } = {}): Promise<EdgeResponse> {
  const functionUrl = `https://tqbjbugwwffdfhihpkcg.supabase.co/functions/v1/sila-model-debugger`;
  
  const r = await fetch(functionUrl, {
    method: "POST",
    headers: {
      "Content-Type": file.type || "image/jpeg",
    },
    body: await file.arrayBuffer(),
  });

  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(`Edge returned ${r.status} ${r.statusText}: ${text}`);
  }

  const raw = await r.json();
  console.info("[YOLOS] raw bbox", raw?.bbox);

  // Normalize main bbox + each detector result's box
  raw.bbox = toUnitBox(normalizeBbox(raw.bbox));

  if (Array.isArray(raw.result)) {
    raw.result = raw.result.map((d: any) => ({ ...d, box: toUnitBox(normalizeBbox(d.box)) })).filter((d: any) => d.box);
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
