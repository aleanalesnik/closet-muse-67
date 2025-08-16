export type YolosBox = { xmin:number; ymin:number; xmax:number; ymax:number };
export type YolosPred = { score:number; label:string; box:YolosBox };

export async function runYolos(imageUrl: string) {
  // First pass (playground-like)
  const p1 = await fetch('/functions/v1/sila-model-debugger', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ imageUrl, threshold: 0.12 }),
  });
  const j1 = await p1.json().catch(()=> ({} as any));
  console.log('[YOLOS] pass1:', j1);

  let preds: YolosPred[] = Array.isArray(j1?.result) ? j1.result as any : [];

  if (!preds.length) {
    const p2 = await fetch('/functions/v1/sila-model-debugger', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ imageUrl, threshold: 0.06 }),
    });
    const j2 = await p2.json().catch(()=> ({} as any));
    console.log('[YOLOS] pass2:', j2);
    if (Array.isArray(j2?.result)) preds = j2.result as any;
  }

  return preds;
}

// Part labels to exclude from category mapping
const PART_LABELS = new Set([
  'hood','collar','lapel','epaulette','sleeve','pocket','neckline','buckle','zipper',
  'applique','bead','bow','flower','fringe','ribbon','rivet','ruffle','sequin','tassel'
]);

function norm(s?: string) { return (s ?? '').toLowerCase().trim(); }

// Map Fashionpedia labels -> coarse app categories only
export function mapLabelToCategory(label?: string): string | null {
  const L = norm(label);
  if (!L || PART_LABELS.has(L)) return null;
  if (L.includes('dress') || L.includes('jumpsuit')) return 'dress';
  if (L.includes('skirt') || L.includes('pants') || L.includes('shorts')) return 'bottom';
  if (L.includes('shirt, blouse') || L.includes('top, t-shirt, sweatshirt')
      || L.includes('sweater') || L.includes('cardigan') || L.includes('vest')) return 'top';
  if (L.includes('jacket') || L.includes('coat') || L.includes('cape')) return 'outerwear';
  if (L.includes('shoe')) return 'shoes';
  if (L.includes('bag, wallet')) return 'bag';
  if (L.includes('belt') || L.includes('glove') || L.includes('scarf') || L.includes('umbrella')
      || L.includes('glasses') || L.includes('hat') || L.includes('tie')
      || L.includes('leg warmer') || L.includes('tights, stockings') || L.includes('sock')) {
    return 'accessory';
  }
  return 'clothing'; // safe fallback
}

export function generateTitle({ colorName, category }:{
  colorName?: string | null; category?: string | null;
}): string {
  const c = (colorName ?? '').trim();
  const k = (category ?? '').trim();
  if (c && k) return `${c} ${k}`;
  if (k) return k;
  if (c) return `${c} item`;
  return 'Clothing item';
}

export function pickPrimary(preds: YolosPred[]): YolosPred | null {
  return preds
    .filter(p => (p?.score ?? 0) >= 0.12 && p?.box) // basic confidence gate
    .sort((a,b) => {
      const s = (b.score - a.score);
      if (s !== 0) return s;
      const area = (p: YolosPred) => Math.max(1,(p.box.xmax-p.box.xmin)) * Math.max(1,(p.box.ymax-p.box.ymin));
      return area(b) - area(a);
    })[0] ?? null;
}