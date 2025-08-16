import type { YolosPred } from './yolos';

const NORMALIZE: Record<string,string> = {
  // bags
  'handbag':'handbag','bag':'handbag','tote bag':'tote','shoulder bag':'shoulder bag','satchel':'handbag','backpack':'backpack',
  // bottoms
  'pants':'pants','trousers':'pants','jeans':'pants','shorts':'shorts','skirt':'skirt',
  // tops / outerwear
  'shirt':'t-shirt','t-shirt':'t-shirt','tee':'t-shirt','blouse':'t-shirt','sweater':'sweater','jumper':'sweater',
  'coat':'jacket','jacket':'jacket','blazer':'jacket','outerwear':'jacket',
  // shoes
  'boots':'boots','sneaker':'sneakers','shoe':'sneakers','trainer':'sneakers','flat':'flats','flats':'flats','sandals':'sandals',
  // accessories
  'belt':'belt','buckle':'belt','waistband':'belt','hat':'hat','cap':'hat','beanie':'hat','sunglasses':'sunglasses','glasses':'sunglasses',
};

type Mapped = { category:string; subcategory:string };

export function mapLabelToTaxonomy(raw: string): Mapped | null {
  const s = (raw || '').toLowerCase().trim();
  const norm = NORMALIZE[s] || s;

  // Bags
  if (['handbag','shoulder bag','tote','backpack'].includes(norm)) return { category:'Bags', subcategory: norm === 'handbag' ? 'Handbag' :
    norm === 'shoulder bag' ? 'Shoulder' : norm === 'tote' ? 'Tote' : 'Backpack' };

  // Accessories
  if (['belt','hat','sunglasses'].includes(norm)) return { category:'Accessories', subcategory: norm[0].toUpperCase()+norm.slice(1) };

  // Shoes
  if (['boots','sneakers','flats','sandals'].includes(norm)) return { category:'Shoes', subcategory: norm[0].toUpperCase()+norm.slice(1) };

  // Dress
  if (norm === 'dress') return { category:'Dress', subcategory:'Dress' };

  // Bottoms
  if (['pants','shorts','skirt'].includes(norm)) return { category:'Bottoms', subcategory: norm[0].toUpperCase()+norm.slice(1) };

  // Tops & Outerwear
  if (['t-shirt','sweater'].includes(norm)) return { category:'Tops', subcategory: norm === 't-shirt' ? 'T-shirt' : 'Sweater' };
  if (norm === 'jacket') return { category:'Outerwear', subcategory:'Jacket' };

  return null;
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

export function buildTitle(colorName: string | null | undefined, mapped: Mapped | null) {
  const color = colorName ? colorName[0].toUpperCase()+colorName.slice(1) : 'Black';
  if (mapped?.subcategory) return `${color} ${mapped.subcategory.toLowerCase()}`;
  if (mapped?.category) return `${color} ${mapped.category.toLowerCase()}`;
  return `${color} item`;
}