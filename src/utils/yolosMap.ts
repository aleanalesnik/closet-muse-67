function titleCase(s: string): string {
  return s.split(/\s+/).map(w => 
    w[0] ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w
  ).join(' ');
}

export function mapYolosToTaxonomy(label: string): { category: string; subcategory: string } | null {
  const s = label.toLowerCase();
  
  // Bags
  if (["handbag", "bag", "tote", "shoulder bag", "satchel", "purse", "crossbody", "hobo", "clutch", "duffle"].some(term => s.includes(term))) {
    if (s.includes("tote")) return { category: "Bags", subcategory: "Tote" };
    if (s.includes("shoulder") || s.includes("crossbody")) return { category: "Bags", subcategory: "Shoulder" };
    if (s.includes("backpack")) return { category: "Bags", subcategory: "Backpack" };
    return { category: "Bags", subcategory: "Bag" };
  }
  
  // Accessories
  if (["belt", "buckle", "sunglasses", "glasses", "hat", "cap", "beanie", "scarf"].some(term => s.includes(term))) {
    if (s.includes("belt") || s.includes("buckle")) return { category: "Accessories", subcategory: "Belt" };
    if (s.includes("sunglasses") || s.includes("glasses")) return { category: "Accessories", subcategory: "Sunglasses" };
    if (s.includes("hat") || s.includes("cap") || s.includes("beanie")) return { category: "Accessories", subcategory: "Hat" };
    if (s.includes("scarf")) return { category: "Accessories", subcategory: "Scarf" };
    return { category: "Accessories", subcategory: "Accessory" };
  }
  
  // Shoes
  if (["boot", "boots", "sneaker", "shoe", "loafer", "heel", "sandals", "flat", "flats"].some(term => s.includes(term))) {
    if (s.includes("boots")) return { category: "Shoes", subcategory: "Boots" };
    if (s.includes("sneaker") || s.includes("trainer")) return { category: "Shoes", subcategory: "Sneakers" };
    if (s.includes("heel")) return { category: "Shoes", subcategory: "Heels" };
    if (s.includes("flat") || s.includes("loafer")) return { category: "Shoes", subcategory: "Flats" };
    return { category: "Shoes", subcategory: "Shoes" };
  }
  
  // Dress
  if (s.includes("dress")) return { category: "Dress", subcategory: "Dress" };
  
  // Top
  if (["shirt", "t-shirt", "tee", "blouse", "polo", "sweater", "knit", "jumper", "tank", "top", "sweatshirt", "hoodie"].some(term => s.includes(term))) {
    if (s.includes("sweater") || s.includes("knit") || s.includes("jumper")) return { category: "Top", subcategory: "Sweater" };
    if (s.includes("sweatshirt") || s.includes("hoodie")) return { category: "Top", subcategory: "Sweatshirt" };
    if (s.includes("tank")) return { category: "Top", subcategory: "Tank" };
    return { category: "Top", subcategory: "T-Shirt" };
  }
  
  // Outerwear
  if (["jacket", "coat", "blazer", "trench", "outerwear"].some(term => s.includes(term))) {
    if (s.includes("coat") || s.includes("trench")) return { category: "Outerwear", subcategory: "Coat" };
    if (s.includes("blazer")) return { category: "Outerwear", subcategory: "Blazer" };
    return { category: "Outerwear", subcategory: "Jacket" };
  }
  
  // Bottoms
  if (["jeans", "pants", "trousers", "skirt", "shorts"].some(term => s.includes(term))) {
    if (s.includes("jeans")) return { category: "Bottoms", subcategory: "Jeans" };
    if (s.includes("pants") || s.includes("trousers")) return { category: "Bottoms", subcategory: "Pants" };
    if (s.includes("skirt")) return { category: "Bottoms", subcategory: "Skirt" };
    if (s.includes("shorts")) return { category: "Bottoms", subcategory: "Shorts" };
    return { category: "Bottoms", subcategory: "Pants" };
  }
  
  // Fallback
  return { category: "Clothing", subcategory: "Item" };
}

export function buildProposedTitle({
  colorName,
  category,
  subcategory
}: {
  colorName?: string | null;
  category?: string | null;
  subcategory?: string | null;
}): string {
  const color = colorName?.toLowerCase?.() || "";
  
  if (category && subcategory) {
    if (category === "Bags" && subcategory === "Tote") {
      return color ? `${titleCase(color)} tote bag` : "Tote bag";
    }
    return color ? `${titleCase(color)} ${subcategory.toLowerCase()}` : titleCase(subcategory);
  }
  
  if (category) {
    return color ? `${titleCase(color)} ${category.toLowerCase()}` : titleCase(category);
  }
  
  return color ? `${titleCase(color)} clothing` : "Clothing";
}