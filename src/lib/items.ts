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

  // 5) call Edge Function (client uses the user's JWT automatically)
  const { data: fnData, error: fnErr } = await supabase.functions
    .invoke("items-process", { body: { itemId, imagePath } });

  if (fnErr) {
    console.error("items-process invoke error:", fnErr);
    return { itemId, imagePath, fn: { ok: false, error: (fnErr as any)?.message ?? "Edge Function error" } };
  }
  
  // Log response for debugging
  console.log("items-process response:", fnData);
  return { itemId, imagePath, fn: fnData };
}
