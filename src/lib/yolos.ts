// src/lib/yolos.ts
import { supabase } from "@/lib/supabase";

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
  bbox: BBoxArray | null;     // <-- TRUST THIS (already [x,y,w,h])
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

export async function analyzeImage(
  file: Blob,
  threshold = 0.12,
): Promise<EdgeResponse> {
  // simpler: let the client handle auth
  const { data, error } = await supabase.functions.invoke("sila-model-debugger", {
    body: file,
    headers: {
      "Content-Type": file.type || "application/octet-stream",
      "x-threshold": String(threshold),
    },
  });

  if (error || !data) {
    throw new Error(error?.message ?? "Edge function failed");
  }

  const raw = data as any;
  console.info("[YOLOS] raw bbox", raw?.bbox);

  // Normalize main bbox + each detector result's box
  raw.bbox = toUnitBox(normalizeBbox(raw.bbox));

  if (Array.isArray(raw.result)) {
    raw.result = raw.result
      .map((d: any) => ({ ...d, box: toUnitBox(normalizeBbox(d.box)) }))
      .filter((d: any) => d.box);
  }
  return raw as EdgeResponse;
}

export async function waitUntilPublic(url: string) {
  for (let i = 0; i < 6; i++) {
    const r = await fetch(url, { method: "HEAD", cache: "no-store" }).catch(
      () => null,
    );
    if (r?.ok) return;
    await new Promise((res) => setTimeout(res, 250 * Math.pow(2, i))); // 250ms → 8s
  }
  throw new Error("Public URL never became readable");
}
