// src/lib/color.ts
// Tiny, dependency-free helpers to get a dominant color from an image
// and snap it to your fixed palette.

export type RGB = { r: number; g: number; b: number };

const PALETTE: { name: string; hex: string }[] = [
  { name: "Black",   hex: "#000000" },
  { name: "Grey",    hex: "#D9D9D9" },
  { name: "White",   hex: "#FFFFFF" },
  { name: "Beige",   hex: "#EEE3D1" },
  { name: "Brown",   hex: "#583B30" },
  // Treat gradient colors as solid anchors:
  { name: "Silver",  hex: "#C0C0C0" },
  { name: "Gold",    hex: "#FFD700" },
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

export async function getDominantColor(src: string, size = 64): Promise<RGB> {
  // Draw on a tiny canvas and compute average, ignoring near-white background.
  const img = await loadImage(src);
  const w = Math.max(8, Math.min(size, img.naturalWidth || size));
  const h = Math.max(8, Math.min(size, img.naturalHeight || size));

  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, w, h);

  const { data } = ctx.getImageData(0, 0, w, h);
  let r = 0, g = 0, b = 0, n = 0;

  for (let i = 0; i < data.length; i += 4) {
    const R = data[i], G = data[i + 1], B = data[i + 2], A = data[i + 3];
    if (A < 128) continue; // skip transparent
    // skip near-white (backgrounds)
    const max = Math.max(R, G, B);
    const min = Math.min(R, G, B);
    const light = (max + min) / 2 / 255;
    if (light > 0.93) continue;

    r += R; g += G; b += B; n++;
  }

  if (n === 0) {
    // fallback: average everything
    for (let i = 0; i < data.length; i += 4) {
      r += data[i]; g += data[i+1]; b += data[i+2];
    }
    n = data.length / 4;
  }

  return { r: Math.round(r / n), g: Math.round(g / n), b: Math.round(b / n) };
}

export function snapToPalette(rgb: RGB) {
  // Convert to LAB for perceptual distance
  const lab = rgbToLab(rgb);
  let best = PALETTE[0], bestD = Infinity;
  for (const p of PALETTE) {
    const d = deltaE(lab, rgbToLab(hexToRgb(p.hex)));
    if (d < bestD) { bestD = d; best = p; }
  }
  return best; // { name, hex }
}

// --- color math (sRGB → XYZ → LAB) ---

function hexToRgb(hex: string): RGB {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)!;
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
}

function srgbToLinear(c: number) {
  const cs = c / 255;
  return cs <= 0.04045 ? cs / 12.92 : Math.pow((cs + 0.055) / 1.055, 2.4);
}

function rgbToXyz({ r, g, b }: RGB) {
  const R = srgbToLinear(r), G = srgbToLinear(g), B = srgbToLinear(b);
  // sRGB D65
  return {
    x: R * 0.4124 + G * 0.3576 + B * 0.1805,
    y: R * 0.2126 + G * 0.7152 + B * 0.0722,
    z: R * 0.0193 + G * 0.1192 + B * 0.9505
  };
}

function xyzToLab({ x, y, z }: { x:number; y:number; z:number }) {
  // D65 reference white
  const X = x / 0.95047, Y = y / 1.00000, Z = z / 1.08883;
  const f = (t:number)=> t > 0.008856 ? Math.cbrt(t) : (7.787 * t) + 16/116;
  const fx = f(X), fy = f(Y), fz = f(Z);
  return { L: (116 * fy) - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

function rgbToLab(rgb: RGB) { return xyzToLab(rgbToXyz(rgb)); }

function deltaE(lab1: any, lab2: any) {
  // Simple CIE76
  const dL = lab1.L - lab2.L;
  const da = lab1.a - lab2.a;
  const db = lab1.b - lab2.b;
  return Math.sqrt(dL*dL + da*da + db*db);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = src;
  });
}