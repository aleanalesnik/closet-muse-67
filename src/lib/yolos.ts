export type YolosBox = { xmin:number; ymin:number; xmax:number; ymax:number };
export type YolosPred = { score:number; label:string; box:YolosBox };

export async function runYolos(imageUrl: string) {
  // First pass (playground-like)
  const p1 = await fetch('/functions/v1/sila-model-debugger', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ imageUrl, threshold: 0.12 }),
  });
  const j1 = await p1.json().catch(()=> ({} as any));
  console.log('[YOLOS] pass1:', j1);

  let preds: YolosPred[] = Array.isArray(j1?.result) ? j1.result as any : [];

  if (!preds.length) {
    const p2 = await fetch('/functions/v1/sila-model-debugger', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ imageUrl, threshold: 0.06 }),
    });
    const j2 = await p2.json().catch(()=> ({} as any));
    console.log('[YOLOS] pass2:', j2);
    if (Array.isArray(j2?.result)) preds = j2.result as any;
  }

  return preds;
}