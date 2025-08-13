import { useState } from "react";
import { uploadInspiration } from "@/lib/inspo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function InspirationPage() {
  const [file, setFile] = useState<File|null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{queryId:string,imagePath:string}|null>(null);

  async function onStart(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    try {
      const r = await uploadInspiration(file);
      setResult(r);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-xl mx-auto p-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Find Similar Items</CardTitle>
          <p className="text-muted-foreground">Upload an inspiration photo to find similar items in your closet</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={onStart} className="space-y-3">
            <div>
              <input 
                type="file" 
                accept="image/*" 
                onChange={e=>setFile(e.target.files?.[0] ?? null)}
                className="w-full p-2 border rounded-md"
              />
            </div>
            <Button type="submit" disabled={!file || busy} className="w-full">
              {busy ? "Starting..." : "Start Analysis"}
            </Button>
          </form>
          
          {result && (
            <div className="p-4 bg-muted rounded-lg">
              <div className="text-sm text-muted-foreground">
                <div className="font-medium text-foreground mb-2">Analysis Started!</div>
                Query ID: <code className="bg-background px-1 rounded">{result.queryId}</code><br/>
                <div className="mt-2 text-xs">Next step will run detection & matching (coming next).</div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}