import { supabase } from "@/lib/supabase";

export async function uploadAndProcessItem(file: File, title?: string) {
  console.log("uploadAndProcessItem called with:", { fileName: file.name, title });
  // 1) current user
  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  console.log("Auth check:", { user: user?.id, error: userErr });
  if (userErr || !user) throw new Error("Not signed in");

  // 2) make a storage path (keep bucket private)
  const ext = file.name.split(".").pop()?.toLowerCase() || "png";
  const objectId = crypto.randomUUID(); // not the DB id
  const imagePath = `${user.id}/items/${objectId}.${ext}`;

  // 3) upload to storage
  console.log("Uploading to storage:", imagePath);
  const { error: upErr } = await supabase.storage.from("sila").upload(imagePath, file, {
    contentType: file.type || `image/${ext}`,
    upsert: true
  });
  console.log("Storage upload result:", { error: upErr });
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
  console.log('[SILA] UPLOAD PATH ACTIVE', { itemId });

  // 5) Get public URL for the uploaded image
  const { data: urlData } = supabase.storage
    .from("sila")
    .getPublicUrl(imagePath);
  
  const imageUrl = urlData.publicUrl;
  console.log('[SILA] Calling sila-model-debugger with imageUrl:', imageUrl);

  // 6) Call sila-model-debugger directly
  const response = await fetch(`https://tqbjbugwwffdfhihpkcg.supabase.co/functions/v1/sila-model-debugger`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRxYmpidWd3d2ZmZGZoaWhwa2NnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUxMTcwOTUsImV4cCI6MjA3MDY5MzA5NX0.hDjr0Ymv-lK_ra08Ye9ya2wCYOM_LBYs2jgJVs4mJlA`
    },
    body: JSON.stringify({ imageUrl, threshold: 0.5 })
  });

  const fnData = await response.json();
  console.log("sila-model-debugger response:", fnData);

  if (!response.ok || fnData.status !== 'success') {
    return { itemId, imagePath, fn: { ok: false, error: fnData.error || "YOLOS detection failed" } };
  }
  
  return { itemId, imagePath, fn: { ok: true, result: fnData.result } };
}
