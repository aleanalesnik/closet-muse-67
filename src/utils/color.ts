export const PALETTE = [
  { name: "Black", hex: "#000000" },
  { name: "Grey", hex: "#D9D9D9" },
  { name: "White", hex: "#FFFFFF" },
  { name: "Beige", hex: "#EEE3D1" },
  { name: "Brown", hex: "#583B30" },
  { name: "Silver", hex: "#C0C0C0" },
  { name: "Gold", hex: "#D4AF37" },
  { name: "Purple", hex: "#8023AD" },
  { name: "Blue", hex: "#3289E2" },
  { name: "Navy", hex: "#144679" },
  { name: "Green", hex: "#39C161" },
  { name: "Yellow", hex: "#FCD759" },
  { name: "Orange", hex: "#FB7C00" },
  { name: "Pink", hex: "#F167A7" },
  { name: "Red", hex: "#CD0002" },
  { name: "Maroon", hex: "#720907" },
];

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function snapToPalette(hex: string): { name: string; hex: string } {
  const [r, g, b] = hexToRgb(hex);
  let best = 0;
  let bestDistance = Infinity;
  
  for (let i = 0; i < PALETTE.length; i++) {
    const [pr, pg, pb] = hexToRgb(PALETTE[i].hex);
    const distance = (r - pr) ** 2 + (g - pg) ** 2 + (b - pb) ** 2;
    if (distance < bestDistance) {
      best = i;
      bestDistance = distance;
    }
  }
  
  return PALETTE[best];
}