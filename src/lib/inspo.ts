import { supabase } from "@/lib/supabase";

export async function uploadInspiration(file: File) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const ext = file.name.split(".").pop()?.toLowerCase() || "png";
  const key = `${user.id}/inspo/${crypto.randomUUID()}.${ext}`;

  const { error: upErr } = await supabase.storage.from("sila").upload(key, file, {
    contentType: file.type || `image/${ext}`,
    upsert: true
  });
  if (upErr) throw upErr;

  const { data, error } = await supabase.functions.invoke("inspiration-start", {
    body: { imagePath: key }
  });
  if (error) throw error;
  return { imagePath: key, queryId: data?.queryId as string };
}