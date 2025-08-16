export async function waitUntilPublic(url: string, opts?: { tries?: number; delayMs?: number }) {
  const tries = opts?.tries ?? 6;          // ~1.6s total with exp backoff
  const base = opts?.delayMs ?? 100;
  let lastErr: any = null;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { method: "HEAD", cache: "no-store" });
      if (res.ok) return true;
      lastErr = res.status;
    } catch (e) {
      lastErr = e;
    }
    await new Promise(r => setTimeout(r, base * Math.pow(2, i))); // 100,200,400,800,1600...
  }
  console.warn("[waitUntilPublic] giving up", { url, lastErr });
  return false;
}