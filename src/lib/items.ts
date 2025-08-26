import { supabase } from "@/lib/supabase";

export async function uploadAndProcessItem(file: File, title?: string) {
  // Check authentication
  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr || !user) throw new Error("Not signed in");

  // 2) make a storage path (keep bucket private)
  const ext = file.name.split(".").pop()?.toLowerCase() || "png";
  const objectId = crypto.randomUUID(); // not the DB id
  const imagePath = `${user.id}/items/${objectId}.${ext}`;

  // Upload to storage
  const { error: upErr } = await supabase.storage.from("sila").upload(imagePath, file, {
    contentType: file.type || `image/${ext}`,
    upsert: true
  });
  if (upErr) throw upErr;

  // 4) create DB row (so we have an item id & owner)
  const { data: inserted, error: insErr } = await supabase
    .from("items")
    .insert({
      owner: user.id,
      title: title ?? file.name.replace(/\.[^/.]+$/, ""),
      image_path: imagePath
    })
    .select("id, title, image_path")
    .single();
  if (insErr) throw insErr;

  const itemId = inserted.id as string;
  

  // 5) Get public URL for the uploaded image
  const { data: urlData } = supabase.storage
    .from("sila")
    .getPublicUrl(imagePath);
  
  const imageUrl = urlData.publicUrl;
  // Call sila-model-debugger directly
  const response = await fetch(`https://tqbjbugwwffdfhihpkcg.supabase.co/functions/v1/sila-model-debugger`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRxYmpidWd3d2ZmZGZoaWhwa2NnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUxMTcwOTUsImV4cCI6MjA3MDY5MzA5NX0.hDjr0Ymv-lK_ra08Ye9ya2wCYOM_LBYs2jgJVs4mJlA`
    },
    body: JSON.stringify({ imageUrl, threshold: 0.5 })
  });

  const fnData = await response.json();

  if (!response.ok || fnData.status !== 'success') {
    return { itemId, imagePath, fn: { ok: false, error: fnData.error || "YOLOS detection failed" } };
  }

  // Normalize bbox if present before returning
  if (fnData.bbox) {
    const { normalizeBbox } = await import('@/lib/yolos');
    fnData.bbox = normalizeBbox(fnData.bbox);
  }
  
  return { itemId, imagePath, fn: { ok: true, result: fnData.result } };
}

export async function findMatchingItems({ category, details }: { category: string; details?: string[] }) {
  // Check authentication
  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr || !user) throw new Error("Not signed in");

  let query = supabase
    .from("items")
    .select("*")
    .eq("owner", user.id)
    .eq("category", category);
  
  if (details && details.length > 0) {
    query = query.contains("details", details);
  }
  
  const { data, error } = await query.limit(6);
  if (error) throw error;
  return data || [];
}
