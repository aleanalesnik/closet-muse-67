import { supabase } from "@/lib/supabase";

export async function getSignedImageUrl(path: string, expires = 3600) {
  if (!path) return null;
  const { data, error } = await supabase
    .storage
    .from("sila")
    .createSignedUrl(path, expires);
  if (error) {
    console.warn("signedUrl error", error, path);
    return null;
  }
  return data?.signedUrl ?? null;
}

export async function batchCreateSignedUrls(paths: string[], expires = 3600) {
  if (paths.length === 0) return {};
  
  const results: { [path: string]: string | null } = {};
  
  // Process in parallel for better performance
  const promises = paths.map(async (path) => {
    const url = await getSignedImageUrl(path, expires);
    return { path, url };
  });
  
  const resolved = await Promise.all(promises);
  
  resolved.forEach(({ path, url }) => {
    results[path] = url;
  });
  
  return results;
}