export type PaletteEntry = { name: string; hex: string }; // hex OR linear-gradient

export const SILA_PALETTE: PaletteEntry[] = [
  { name: "Black",  hex: "#000000" },
  { name: "Grey",   hex: "#D9D9D9" },
  { name: "White",  hex: "#FFFFFF" },
  { name: "Beige",  hex: "#EEE3D1" },
  { name: "Brown",  hex: "#583B30" },
  { name: "Silver", hex: "linear-gradient(45deg, #C0C0C0, #E8E8E8)" },
  { name: "Gold",   hex: "linear-gradient(45deg, #FFD700, #FFA500)" },
  { name: "Purple", hex: "#8023AD" },
  { name: "Blue",   hex: "#3289E2" },
  { name: "Navy",   hex: "#144679" },
  { name: "Green",  hex: "#39C161" },
  { name: "Yellow", hex: "#FCD759" },
  { name: "Orange", hex: "#FB7C00" },
  { name: "Pink",   hex: "#F167A7" },
  { name: "Red",    hex: "#CD0002" },
  { name: "Maroon", hex: "#720907" },
];

const HEX_RE = /#([0-9a-f]{6})/ig;

function hexToRgb(hex: string) {
  const h = hex.replace("#", "");
  const n = parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbToHex(r: number, g: number, b: number) {
  const h = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2,"0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

function averageHexes(hexes: string[]) {
  if (!hexes.length) return "#000000";
  let R=0,G=0,B=0;
  for (const h of hexes) { const {r,g,b} = hexToRgb(h); R+=r; G+=g; B+=b; }
  return rgbToHex(R/hexes.length, G/hexes.length, B/hexes.length);
}

/** For gradients, use the average of all #RRGGBB stops. Otherwise return the hex itself. */
function representativeHex(color: string) {
  if (!color) return "#000000";
  if (color.startsWith("linear-gradient")) {
    const stops = [...color.matchAll(HEX_RE)].map(m => m[0].toUpperCase());
    return stops.length ? averageHexes(stops) : "#C0C0C0";
  }
  return color.toUpperCase();
}

function dist2(a:{r:number;g:number;b:number}, b:{r:number;g:number;b:number}) {
  const dr=a.r-b.r, dg=a.g-b.g, db=a.b-b.b;
  return dr*dr + dg*dg + db*db;
}

export function snapToPalette(inputHex: string, palette: PaletteEntry[] = SILA_PALETTE) {
  const src = representativeHex(inputHex);
  const srcRgb = hexToRgb(src);
  let best = palette[0], bestD = Infinity;
  for (const p of palette) {
    const rep = representativeHex(p.hex);
    const d = dist2(srcRgb, hexToRgb(rep));
    if (d < bestD) { bestD = d; best = p; }
  }
  // Return palette NAME and DISPLAY color (original string—gradient preserved)
  return { name: best.name, hex: best.hex };
}

export async function dominantHexFromImage(url: string): Promise<string> {
  // downsample to reduce work
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.crossOrigin = "anonymous";
    i.onload = () => res(i);
    i.onerror = (e) => rej(new Error("image load failed"));
    i.src = url;
  });
  const w = 64, h = 64;
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h).data;
  let R=0,G=0,B=0, count=0;
  for (let i=0; i<data.length; i+=4) { R+=data[i]; G+=data[i+1]; B+=data[i+2]; count++; }
  return rgbToHex(R/count, G/count, B/count);
}

/** Build title as "<Color> <Label>" (no brand). */
export function buildTitle(parts: { label?: string; colorName?: string }) {
  const words: string[] = [];
  if (parts.colorName) words.push(parts.colorName);
  if (parts.label)     words.push(parts.label.toLowerCase());
  const t = words.join(" ").trim();
  return t || "Untitled item";
}