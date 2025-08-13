import { supabase } from "@/lib/supabase";

export async function uploadAndStartInspiration(file: File) {
  // Ensure signed-in user
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  // Put the image in the user's private folder
  const ext = (file.name.split(".").pop() || "png").toLowerCase();
  const key = `${user.id}/inspo/${crypto.randomUUID()}.${ext}`;

  const { error: upErr } = await supabase.storage
    .from("sila")
    .upload(key, file, { contentType: file.type || `image/${ext}`, upsert: true });
  if (upErr) throw upErr;

  // Pass JWT to the Edge Function
  const { data: { session } } = await supabase.auth.getSession();
  const jwt = session?.access_token ?? "";

  const { data, error } = await supabase.functions.invoke("inspiration-start", {
    body: { imagePath: key },
    headers: { Authorization: `Bearer ${jwt}` },
  });
  if (error) throw new Error(error.message || "Edge Function failed");
  if (!data?.ok) throw new Error(data?.error || "Edge Function returned non-2xx");

  return { imagePath: key, queryId: data.queryId as string };
}