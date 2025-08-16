// src/lib/color.ts
// Lightweight dominant-color estimator + palette snap (browser-side).

export type PaletteColor = { name: string; hex: string };

/** Your palette */
export const PALETTE: PaletteColor[] = [
  { name: "Black",   hex: "#000000" },
  { name: "Grey",    hex: "#D9D9D9" },
  { name: "White",   hex: "#FFFFFF" },
  { name: "Beige",   hex: "#EEE3D1" },
  { name: "Brown",   hex: "#583B30" },
  // Skip gradients for Silver/Gold – snap to Grey/Yellow for now or add separate solid reps
  { name: "Purple",  hex: "#8023AD" },
  { name: "Blue",    hex: "#3289E2" },
  { name: "Navy",    hex: "#144679" },
  { name: "Green",   hex: "#39C161" },
  { name: "Yellow",  hex: "#FCD759" },
  { name: "Orange",  hex: "#FB7C00" },
  { name: "Pink",    hex: "#F167A7" },
  { name: "Red",     hex: "#CD0002" },
  { name: "Maroon",  hex: "#720907" },
];

function hexToRgb(hex: string) {
  const s = hex.replace("#", "");
  const n = parseInt(s, 16);
  if (s.length === 6) return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  return { r: 0, g: 0, b: 0 };
}

function dist2(a: {r:number;g:number;b:number}, b: {r:number;g:number;b:number}) {
  const dr = a.r - b.r, dg = a.g - b.g, db = a.b - b.b;
  return dr*dr + dg*dg + db*db;
}

function snapToPalette(rgb: {r:number;g:number;b:number}): PaletteColor {
  let best = PALETTE[0], bestD = Infinity;
  for (const p of PALETTE) {
    const d = dist2(rgb, hexToRgb(p.hex));
    if (d < bestD) { bestD = d; best = p; }
  }
  return best;
}

/** Compute dominant color by averaging a small downscaled canvas, then snap to palette. */
export async function dominantColorFromUrl(publicUrl: string): Promise<PaletteColor | null> {
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    const done = new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = e => rej(e);
    });
    img.src = publicUrl + (publicUrl.includes("?") ? "&" : "?") + "cachebust=" + Date.now();
    await done;

    const w = 40, h = 40;
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.drawImage(img, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h).data;

    let sr = 0, sg = 0, sb = 0, c = 0;
    for (let i = 0; i < data.length; i += 4) {
      const a = data[i+3];
      if (a < 16) continue;
      sr += data[i]; sg += data[i+1]; sb += data[i+2]; c++;
    }
    if (!c) return null;
    const rgb = { r: Math.round(sr/c), g: Math.round(sg/c), b: Math.round(sb/c) };
    return snapToPalette(rgb);
  } catch {
    return null;
  }
}