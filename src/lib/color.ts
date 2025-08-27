// src/lib/color.ts
// Tiny, dependency-free helpers to get a dominant color from an image
// and snap it to your fixed palette.

export type RGB = { r: number; g: number; b: number };

// Centralized thresholds for color classification
export const COLOR_THRESHOLDS = {
  // Lightness boundaries
  lightnessWhite: 0.95,
  lightnessBlack: 0.05,
  lightnessGreyWhite: 0.9,  // Grey vs White cutoff (was 0.8)
  lightnessGreyBlack: 0.2,  // Grey vs Black cutoff
  lightnessBeigeMin: 0.7,   // Minimum lightness for Beige
  lightnessMaroonMax: 0.3,  // Maximum lightness for Maroon
  lightnessNavyMax: 0.3,    // Maximum lightness for Navy
  
  // Saturation boundaries
  saturationGrey: 0.1,      // Below this = achromatic (grey/black/white)
  saturationHueMap: 0.15,   // Below this = no hue mapping (was 0.3)
  
  // Hue ranges (in degrees)
  hueRanges: {
    Red: [345, 15],
    Orange: [15, 45], 
    Yellow: [45, 75],
    Beige: [30, 60],        // Warm low-sat tones
    Green: [75, 165],
    Blue: [165, 240],
    Purple: [240, 290],
    Pink: [290, 345],
  },
  
  // Special hue ranges for low-saturation handling
  lowSatHueRanges: {
    Red: [345, 15],    // For Maroon detection
    Blue: [165, 240],  // For Navy detection
    Warm: [20, 80],    // For Brown detection (orange/yellow/beige range)
  }
} as const;

export const PALETTE: { name: string; hex: string }[] = [
  { name: "Black",   hex: "#1A1A1A" },
  { name: "Grey",    hex: "#808080" },
  { name: "White",   hex: "#F8F8F8" },
  { name: "Beige",   hex: "#D2B48C" },
  { name: "Brown",   hex: "#8B4513" },
  { name: "Purple",  hex: "#8A2BE2" },
  { name: "Blue",    hex: "#4169E1" },
  { name: "Navy",    hex: "#2C3E50" },
  { name: "Green",   hex: "#228B22" },
  { name: "Yellow",  hex: "#FFD700" },
  { name: "Orange",  hex: "#FF8C00" },
  { name: "Pink",    hex: "#FF69B4" },
  { name: "Red",     hex: "#DC143C" },
  { name: "Maroon",  hex: "#800000" },
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
  let r = 0, g = 0, b = 0, n = 0, whites = 0;

  for (let i = 0; i < data.length; i += 4) {
    const R = data[i], G = data[i + 1], B = data[i + 2], A = data[i + 3];
    if (A < 128) continue; // skip transparent
    // skip near-white (backgrounds)
    const max = Math.max(R, G, B);
    const min = Math.min(R, G, B);
    const light = (max + min) / 2 / 255;
    if (light > 0.97) { whites++; continue; }

    r += R; g += G; b += B; n++;
  }

  if (whites > n * 3) {
    return { r: 255, g: 255, b: 255 };
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
  // Convert to HSL for hue/saturation/lightness analysis
  const hsl = rgbToHsl(rgb);
  
  // Apply heuristics for extreme cases - prioritize white detection
  if (hsl.l > 0.95 && hsl.s < 0.1) return PALETTE.find(p => p.name === "White")!;
  if (hsl.l < 0.05) return PALETTE.find(p => p.name === "Black")!;
  
  // Enhanced white detection for slightly tinted whites
  if (hsl.l > 0.85 && hsl.s < 0.15) return PALETTE.find(p => p.name === "White")!;
  if (hsl.l > 0.9) return PALETTE.find(p => p.name === "White")!;
  
  if (hsl.s < 0.1) {
    if (hsl.l < 0.2) return PALETTE.find(p => p.name === "Black")!;
    if (hsl.l > 0.8) return PALETTE.find(p => p.name === "White")!;
    return PALETTE.find(p => p.name === "Grey")!;
  }

  // More restrictive beige detection - only for true beige items
  if (hsl.h >= 20 && hsl.h <= 50 && hsl.l > 0.4 && hsl.l < 0.8 && hsl.s > 0.15 && hsl.s < 0.4) {
    return PALETTE.find(p => p.name === "Beige")!;
  }
  
  // For colored items, use hue-based mapping with LAB distance fallback
  const h = hsl.h;
  const hueRanges: Record<string, [number, number]> = {
    "Red": [345, 15],
    "Orange": [15, 45],
    "Yellow": [45, 75],
    "Green": [75, 165],
    "Blue": [165, 255],
    "Purple": [255, 310],
    "Pink": [290, 345],
    "Maroon": [345, 15], // darker reds
    "Navy": [165, 240], // darker blues
  };
  
  // Check hue ranges first for strong colors
  if (hsl.s > 0.15) {
    for (const [colorName, [min, max]] of Object.entries(hueRanges)) {
      const inRange = max > min ? (h >= min && h <= max) : (h >= min || h <= max);
      if (inRange) {
        if (colorName === "Purple" && h >= 290 && h <= 310 && hsl.s > 0.35) {
          continue; // allow vibrant magentas to be handled by Pink
        }

        const candidate = PALETTE.find(p => p.name === colorName);
        if (candidate) {
          // Refine red/pink/maroon distinctions
          if (colorName === "Red") {
            if (hsl.l < 0.3) return PALETTE.find(p => p.name === "Maroon")!;
            if (hsl.l >= 0.6) return PALETTE.find(p => p.name === "Pink")!;
          }

          if (colorName === "Pink" && (hsl.s < 0.35 || hsl.l < 0.4)) {
            return PALETTE.find(p => p.name === "Purple")!;
          }

          if (colorName === "Blue") {
            if (h >= 240 && h <= 255 && (rgb.r - rgb.g) > 10) {
              return PALETTE.find(p => p.name === "Purple")!;
            }
            if (h >= 230 && h <= 255 && hsl.l > 0.8) {
              return PALETTE.find(p => p.name === "Purple")!;
            }
            if (hsl.l < 0.2) return PALETTE.find(p => p.name === "Navy")!;
          }

          if (colorName === "Orange" && hsl.l < 0.4) {
            return PALETTE.find(p => p.name === "Brown")!;
          }

          return candidate;
        }
      }
    }
  }
  
  // Fallback to LAB distance for edge cases
  const lab = rgbToLab(rgb);
  let best = PALETTE[0], bestD = Infinity;
  for (const p of PALETTE) {
    const d = deltaE(lab, rgbToLab(hexToRgb(p.hex)));
    if (d < bestD) { bestD = d; best = p; }
  }
  return best;
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

function rgbToHsl(rgb: RGB): { h: number; s: number; l: number } {
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  
  if (max === min) {
    return { h: 0, s: 0, l }; // achromatic
  }
  
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  
  let h: number;
  switch (max) {
    case r: h = (g - b) / d + (g < b ? 6 : 0); break;
    case g: h = (b - r) / d + 2; break;
    case b: h = (r - g) / d + 4; break;
    default: h = 0;
  }
  h /= 6;
  
  return { h: h * 360, s, l };
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