import { useState } from "react";
import { supabase } from "@/lib/supabase";

export default function InspoTest() {
  const [status, setStatus] = useState("idle");
  const [queryId, setQueryId] = useState<string | null>(null);
  const [rows, setRows] = useState<any[]>([]);

  async function run(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const file = (e.currentTarget.elements.namedItem("file") as HTMLInputElement).files?.[0];
    if (!file) return;

    const { data: u } = await supabase.auth.getUser();
    if (!u?.user?.id) { alert("Please sign in first"); return; }

    // 1) upload to bucket `sila/{userId}/inspo/...`
    const path = `${u.user.id}/inspo/${crypto.randomUUID()}.jpg`;
    setStatus("uploading");
    const up = await supabase.storage.from("sila").upload(path, file, { upsert: false });
    if (up.error) { setStatus(`upload error: ${up.error.message}`); return; }

    // 2) start query
    setStatus("start");
    const start = await supabase.functions.invoke("inspiration-start", { body: { imagePath: path } });
    if (start.error) { setStatus(`start error: ${start.error.message}`); return; }
    const qid = start.data?.queryId as string; setQueryId(qid);

    // 3) run processing
    setStatus("run");
    const runRes = await supabase.functions.invoke("inspiration-run", { body: { queryId: qid } });
    if (runRes.error) { setStatus(`run error: ${runRes.error.message}`); return; }

    // 4) poll detections for ~20s
    setStatus("polling");
    const t0 = Date.now();
    const iv = setInterval(async () => {
      const { data, error } = await supabase
        .from("inspiration_detections")
        .select("*")
        .eq("query_id", qid)
        .order("id");
      if (!error && data) setRows(data);
      if (Date.now() - t0 > 20000) { clearInterval(iv); setStatus("done"); }
    }, 2000);
  }

  return (
    <div style={{ padding: 24 }}>
      <h1>Inspo Test</h1>
      <form onSubmit={run}>
        <input type="file" name="file" accept="image/*" />
        <button type="submit">Upload & Run</button>
      </form>
      <p>Status: {status}</p>
      <p>QueryId: {queryId}</p>
      <pre>{JSON.stringify(rows, null, 2)}</pre>
    </div>
  );
}