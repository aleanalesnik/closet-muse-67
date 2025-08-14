import { useRef, useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { uploadAndStartInspiration } from "@/lib/inspo";
import { supabase } from "@/lib/supabase";

export default function InspirationPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [recent, setRecent] = useState<Array<{id:string; image_path:string; created_at:string}>>([]);
  const { toast } = useToast();

  async function loadRecent() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data, error } = await supabase
      .from("inspiration_queries")
      .select("id, image_path, created_at")
      .eq("owner", user.id)
      .order("created_at", { ascending: false })
      .limit(10);
    if (!error && data) setRecent(data);
  }

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setLoading(true);
      const { queryId } = await uploadAndStartInspiration(file);
      toast({ title: "Photo queued", description: `Query ${queryId} started.` });
      await loadRecent();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Upload failed", description: String(err?.message || err) });
    } finally {
      setLoading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  // call once on mount
  useEffect(() => { loadRecent(); }, []);

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Style Inspiration</h1>
        <p className="text-muted-foreground">Upload a photo to find similar items in your closet.</p>
      </div>

      <div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={onPick}
        />
        <Button size="lg" onClick={() => fileRef.current?.click()} disabled={loading}>
          {loading ? "Uploading…" : "Find Your Style"}
        </Button>
      </div>

      <section>
        <h2 className="text-xl font-semibold mb-3">Recent Searches</h2>
        {recent.length === 0 ? (
          <p className="text-muted-foreground">No inspiration searches yet.</p>
        ) : (
          <ul className="space-y-2">
            {recent.map(r => (
              <li key={r.id} className="text-sm">
                <span className="font-mono">{r.id.slice(0,8)}</span> — {new Date(r.created_at).toLocaleString()}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}