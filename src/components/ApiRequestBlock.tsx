import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';

interface ApiRequestBlockProps {
  name: string;
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: string;
  onExecute?: () => void;
}

const ApiRequestBlock: React.FC<ApiRequestBlockProps> = ({ name, method, url, headers, body, onExecute }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [response, setResponse] = useState<any>(null);
  const [latency, setLatency] = useState<number | null>(null);

  const handleExecute = async () => {
    setIsLoading(true);
    const startTime = Date.now();
    try {
      const fetchOptions: RequestInit = {
        method,
        headers: headers || {},
      };
      
      if (body && method !== 'GET') {
        fetchOptions.body = body;
      }
      
      const res = await fetch(url, fetchOptions);
      const endTime = Date.now();
      setLatency(endTime - startTime);
      
      const responseData = await res.json();
      setResponse(responseData);
      
      if (onExecute) {
        onExecute();
      }
    } catch (error) {
      const endTime = Date.now();
      setLatency(endTime - startTime);
      setResponse({ error: error instanceof Error ? error.message : 'Unknown error' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold">{name}</CardTitle>
          <Badge variant="secondary" className="font-mono text-xs">
            {method}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center space-x-2">
          <span className="text-sm font-medium text-muted-foreground">URL:</span>
          <code className="flex-1 rounded bg-muted px-2 py-1 text-sm font-mono">
            {url}
          </code>
        </div>
        
        {headers && Object.keys(headers).length > 0 && (
          <div className="space-y-2">
            <span className="text-sm font-medium text-muted-foreground">Headers:</span>
            {Object.entries(headers).map(([key, value]) => (
              <div key={key} className="flex items-center space-x-2">
                <code className="rounded bg-muted px-2 py-1 text-sm font-mono font-medium">
                  {key}:
                </code>
                <code className="flex-1 rounded bg-muted px-2 py-1 text-sm font-mono">
                  {value}
                </code>
              </div>
            ))}
          </div>
        )}

        {body && (
          <div className="space-y-2">
            <span className="text-sm font-medium text-muted-foreground">Body (RAW JSON):</span>
            <pre className="rounded bg-muted p-3 text-sm font-mono overflow-x-auto whitespace-pre-wrap">
              {body}
            </pre>
          </div>
        )}
        
        <div className="flex justify-end">
          <Button 
            onClick={handleExecute}
            disabled={isLoading}
            className="min-w-24"
          >
            {isLoading ? 'Loading...' : 'Test'}
          </Button>
        </div>

        {response && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-muted-foreground">Response:</span>
              {latency && (
                <Badge variant="outline" className="text-xs">
                  {latency}ms
                </Badge>
              )}
            </div>
            <pre className="rounded bg-muted p-3 text-sm font-mono overflow-x-auto whitespace-pre-wrap max-h-96 overflow-y-auto">
              {JSON.stringify(response, null, 2)}
            </pre>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

// Pre-configured YOLOS Detect block with editable body
export const YolosDetectBlock = () => {
  const [body, setBody] = useState('');

  return (
    <div className="space-y-4">
      <Card className="w-full max-w-2xl">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg font-semibold">YOLOS Detect</CardTitle>
            <Badge variant="secondary" className="font-mono text-xs">
              POST
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center space-x-2">
            <span className="text-sm font-medium text-muted-foreground">URL:</span>
            <code className="flex-1 rounded bg-muted px-2 py-1 text-sm font-mono">
              https://tqbjbugwwffdfhihpkcg.functions.supabase.co/sila-model-debugger
            </code>
          </div>
          
          <div className="space-y-2">
            <span className="text-sm font-medium text-muted-foreground">Headers:</span>
            <div className="flex items-center space-x-2">
              <code className="rounded bg-muted px-2 py-1 text-sm font-mono font-medium">
                Authorization:
              </code>
              <code className="flex-1 rounded bg-muted px-2 py-1 text-sm font-mono">
                Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRxYmpidWd3d2ZmZGZoaWhwa2NnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUxMTcwOTUsImV4cCI6MjA3MDY5MzA5NX0.hDjr0Ymv-lK_ra08Ye9ya2wCYOM_LBYs2jgJVs4mJlA
              </code>
            </div>
            <div className="flex items-center space-x-2">
              <code className="rounded bg-muted px-2 py-1 text-sm font-mono font-medium">
                apikey:
              </code>
              <code className="flex-1 rounded bg-muted px-2 py-1 text-sm font-mono">
                eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRxYmpidWd3d2ZmZGZoaWhwa2NnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUxMTcwOTUsImV4cCI6MjA3MDY5MzA5NX0.hDjr0Ymv-lK_ra08Ye9ya2wCYOM_LBYs2jgJVs4mJlA
              </code>
            </div>
            <div className="flex items-center space-x-2">
              <code className="rounded bg-muted px-2 py-1 text-sm font-mono font-medium">
                Content-Type:
              </code>
              <code className="flex-1 rounded bg-muted px-2 py-1 text-sm font-mono">
                application/json
              </code>
            </div>
          </div>

          <div className="space-y-2">
            <span className="text-sm font-medium text-muted-foreground">Body (RAW JSON):</span>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Paste your JSON here..."
              className="font-mono text-sm min-h-32"
            />
          </div>
        </CardContent>
      </Card>
      
      <ApiRequestBlock
        name="YOLOS Detect"
        method="POST"
        url="https://tqbjbugwwffdfhihpkcg.functions.supabase.co/sila-model-debugger"
        headers={{
          "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRxYmpidWd3d2ZmZGZoaWhwa2NnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUxMTcwOTUsImV4cCI6MjA3MDY5MzA5NX0.hDjr0Ymv-lK_ra08Ye9ya2wCYOM_LBYs2jgJVs4mJlA",
          "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRxYmpidWd3d2ZmZGZoaWhwa2NnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUxMTcwOTUsImV4cCI6MjA3MDY5MzA5NX0.hDjr0Ymv-lK_ra08Ye9ya2wCYOM_LBYs2jgJVs4mJlA",
          "Content-Type": "application/json"
        }}
        body={body}
      />
    </div>
  );
};

// YOLOS Normalize transform block
export const YolosNormalizeBlock = () => {
  const [result, setResult] = useState<any>(null);

  const executeNormalize = () => {
    try {
      // Input is the previous block (YOLOS Detect) response:
      // { status: "success" | "fail", latencyMs: number, result: Array<{label, score, box}> }
      const resp: any = {}; // In real implementation, this would be $input from YOLOS Detect
      const status = resp?.status ?? 'fail';
      const arr = Array.isArray(resp?.result) ? resp.result : [];

      // Collect labels, dedupe, keep top 3
      const labels = arr.map((d: any) => d?.label).filter(Boolean);
      const top3 = [...new Set(labels)].slice(0, 3);

      const output = {
        ok: status === 'success' && arr.length > 0,
        labels: top3,                                  // e.g. ["jacket","sleeve","zipper"]
        latency: Number.isFinite(resp?.latencyMs) ? resp.latencyMs : null,
        model: 'valentinafeve/yolos-fashionpedia',
        raw: arr                                       // keep full detections for UI overlay
      };

      setResult(output);
    } catch (error) {
      setResult({ error: error instanceof Error ? error.message : 'Normalize failed' });
    }
  };

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold">YOLOS Normalize</CardTitle>
          <Badge variant="secondary" className="font-mono text-xs">
            Transform
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <span className="text-sm font-medium text-muted-foreground">Input (from YOLOS Detect):</span>
          <div className="text-sm text-muted-foreground bg-muted p-3 rounded">
            Wire from YOLOS Detect block output...
          </div>
        </div>
        
        <div className="flex justify-end">
          <Button onClick={executeNormalize} className="min-w-24">
            Normalize
          </Button>
        </div>

        {result && (
          <div className="space-y-2">
            <span className="text-sm font-medium text-muted-foreground">Normalized Output:</span>
            <pre className="rounded bg-muted p-3 text-sm font-mono overflow-x-auto whitespace-pre-wrap max-h-96 overflow-y-auto">
              {JSON.stringify(result, null, 2)}
            </pre>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

// Debug Log block for YOLOS Normalize output
export const YolosDebugLogBlock = () => {
  const [result, setResult] = useState<any>(null);

  const executeDebugLog = () => {
    try {
      // This would be $prev from YOLOS Normalize in real implementation
      const prev: any = {}; // Wire from previous block
      
      const debugInfo = {
        keys: Object.keys(prev || {}),
        sample: (prev && JSON.stringify(prev).slice(0, 300)) || null
      };

      setResult(debugInfo);
    } catch (error) {
      setResult({ error: error instanceof Error ? error.message : 'Debug log failed' });
    }
  };

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold">Debug (Log)</CardTitle>
          <Badge variant="secondary" className="font-mono text-xs">
            Debug
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <span className="text-sm font-medium text-muted-foreground">Input (from YOLOS Normalize):</span>
          <div className="text-sm text-muted-foreground bg-muted p-3 rounded">
            Wire from YOLOS Normalize block output...
          </div>
        </div>
        
        <div className="flex justify-end">
          <Button onClick={executeDebugLog} className="min-w-24">
            Log
          </Button>
        </div>

        {result && (
          <div className="space-y-2">
            <span className="text-sm font-medium text-muted-foreground">Debug Output:</span>
            <pre className="rounded bg-muted p-3 text-sm font-mono overflow-x-auto whitespace-pre-wrap max-h-96 overflow-y-auto">
              {JSON.stringify(result, null, 2)}
            </pre>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

// Transform block for building YOLOS patch data
export const BuildYolosPatchBlock = () => {
  const [detections, setDetections] = useState('[]');
  const [latency, setLatency] = useState('0');
  const [itemId, setItemId] = useState('');
  const [result, setResult] = useState<any>(null);

  const executeTransform = () => {
    try {
      // Parse inputs
      const dets = JSON.parse(detections);
      const latencyNum = parseFloat(latency);
      const model = 'valentinafeve/yolos-fashionpedia';

      // Transform code (exactly as provided)
      const modelName = typeof model === 'string' && model.length
        ? model
        : 'valentinafeve/yolos-fashionpedia';

      const detArray = Array.isArray(dets) ? dets : [];

      // Sort by score desc, keep top 5 unique labels
      const sorted = [...detArray].sort((a, b) => (b?.score ?? 0) - (a?.score ?? 0));
      const labelsInOrder = sorted.map(d => d?.label).filter(Boolean);
      const seen = new Set();
      const topLabels = [];
      for (const lbl of labelsInOrder) {
        if (!seen.has(lbl)) {
          seen.add(lbl);
          topLabels.push(lbl);
        }
        if (topLabels.length >= 5) break;
      }

      const latencyMs = Number.isFinite(latencyNum) ? Math.max(0, Math.round(latencyNum)) : null;

      const output = {
        ok: !!itemId && detArray.length >= 0,
        itemId,
        patch: {
          yolos_latency_ms: latencyMs,
          yolos_model: modelName,
          yolos_result: detArray,        // jsonb on the DB
          yolos_top_labels: topLabels // text[] on the DB
        }
      };

      setResult(output);
    } catch (error) {
      setResult({ error: error instanceof Error ? error.message : 'Transform failed' });
    }
  };

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold">Build YOLOS Patch</CardTitle>
          <Badge variant="secondary" className="font-mono text-xs">
            Transform
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3">
          <div className="space-y-2">
            <span className="text-sm font-medium text-muted-foreground">detections (from YOLOS Detect result):</span>
            <Textarea
              value={detections}
              onChange={(e) => setDetections(e.target.value)}
              placeholder="Wire from YOLOS Detect block result array..."
              className="font-mono text-sm min-h-24"
            />
          </div>
          
          <div className="space-y-2">
            <span className="text-sm font-medium text-muted-foreground">latency (from YOLOS Detect latency):</span>
            <input
              type="text"
              value={latency}
              onChange={(e) => setLatency(e.target.value)}
              placeholder="Wire from YOLOS Detect latency..."
              className="w-full rounded bg-muted px-2 py-1 text-sm font-mono"
            />
          </div>
          
          <div className="space-y-2">
            <span className="text-sm font-medium text-muted-foreground">itemId (from Insert Item):</span>
            <input
              type="text"
              value={itemId}
              onChange={(e) => setItemId(e.target.value)}
              placeholder="Wire from newly created item ID..."
              className="w-full rounded bg-muted px-2 py-1 text-sm font-mono"
            />
          </div>
          
          <div className="space-y-2">
            <span className="text-sm font-medium text-muted-foreground">model (constant):</span>
            <code className="block rounded bg-muted px-2 py-1 text-sm font-mono">
              "valentinafeve/yolos-fashionpedia"
            </code>
          </div>
        </div>
        
        <div className="flex justify-end">
          <Button onClick={executeTransform} className="min-w-24">
            Transform
          </Button>
        </div>

        {result && (
          <div className="space-y-2">
            <span className="text-sm font-medium text-muted-foreground">Output:</span>
            <pre className="rounded bg-muted p-3 text-sm font-mono overflow-x-auto whitespace-pre-wrap max-h-96 overflow-y-auto">
              {JSON.stringify(result, null, 2)}
            </pre>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

// YOLOS Persist - JavaScript block with exact code provided
export const YolosPersistBlock = () => {
  const [result, setResult] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);

  const executeYolosPersist = async () => {
    setIsLoading(true);
    try {
      // EXPECTS:
      //  - previous step ($prev) to contain YOLOS normalized data, e.g.:
      //      { labels: [{ label, score }...],
      //        boxes: [{ xmin, ymin, xmax, ymax, score, label }...],
      //        top3: ["label", ...],      // optional
      //        latency: 2531,             // ms
      //        threshold: 0.5,            // optional
      //        model: "valentinafeve/yolos-fashionpedia" // optional
      //      }
      //  - a variable 'itemId' available (the id of the newly created/updated item)
      //  - Supabase REST headers are set with anon key (Authorization + apikey) as in our earlier blocks.

      // Simulated context - in real implementation this would come from the workflow
      const ctx: any = {
        prev: {}, // This would be the output from YOLOS Normalize
        vars: { itemId: '' }, // This would be set by the workflow
        input: {},
        ui: {
          toast: (message: string) => console.log('Toast:', message)
        }
      };

      const prev = ctx.prev ?? {};                       // output of YOLOS Normalize
      const itemId = ctx.vars?.itemId || ctx.input?.itemId;

      // Normalize shape regardless of nesting
      const src = prev?.yolos ? prev.yolos : prev;       // handle either {yolos:{...}} or flat
      const labels = Array.isArray(src?.labels) ? src.labels : [];
      const latency = Number.isFinite(src?.latency) ? Math.round(src.latency) : null;
      const boxes = Array.isArray(src?.boxes) ? src.boxes : [];
      const top3 = (Array.isArray(src?.top3) ? src.top3 : labels.map((x: any) => x.label)).slice(0, 3);
      const model = src?.model || 'valentinafeve/yolos-fashionpedia';
      const threshold = Number.isFinite(src?.threshold) ? src.threshold : 0.5;

      // Guardrails & toasts
      if (!itemId) {
        ctx.ui.toast('Missing item id; cannot persist.');
        setResult({ ok: false, reason: 'no_item_id' });
        return;
      }
      if (!labels.length || latency === null) {
        ctx.ui.toast('YOLOS ran but returned no labels; skipping persist.');
        setResult({ ok: false, reason: 'no_labels_or_latency' });
        return;
      }

      // Supabase REST PATCH
      // Reuse the same anon key approach we used earlier: both Authorization and apikey headers.
      const SUPABASE_URL = 'https://tqbjbugwwffdfhihpkcg.supabase.co';
      const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRxYmpidWd3d2ZmZGZoaWhwa2NnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUxMTcwOTUsImV4cCI6MjA3MDY5MzA5NX0.hDjr0Ymv-lK_ra08Ye9ya2wCYOM_LBYs2jgJVs4mJlA';

      const url = `${SUPABASE_URL}/rest/v1/items?id=eq.${encodeURIComponent(itemId)}`;
      const body = {
        yolos_latency_ms: latency,
        yolos_model: model,
        yolos_top_labels: top3,
        yolos_result: { labels, boxes, threshold }
      };

      const res = await fetch(url, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Prefer': 'return=representation',
          'Authorization': `Bearer ${ANON}`,
          'apikey': ANON
        },
        body: JSON.stringify(body)
      });

      if (!res.ok) {
        const errTxt = await res.text().catch(() => '');
        ctx.ui.toast(`YOLOS persist error: ${res.status} ${errTxt}`);  // visible failure
        setResult({ ok: false, status: res.status, error: errTxt });
        return;
      }

      const rows = await res.json().catch(() => []);
      const updated = rows?.[0]?.id || itemId;

      ctx.ui.toast(`YOLOS saved ✓ — ${top3.join(', ') || 'no labels'} (${latency} ms)`);  // visible success
      setResult({ ok: true, updatedId: updated, saved: body });
    } catch (error) {
      setResult({ error: error instanceof Error ? error.message : 'Persist failed' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold">YOLOS Persist</CardTitle>
          <Badge variant="secondary" className="font-mono text-xs">
            JavaScript
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <span className="text-sm font-medium text-muted-foreground">Description:</span>
          <div className="text-sm text-muted-foreground bg-muted p-3 rounded">
            Persists YOLOS normalized data to Supabase items table. Expects normalized data from previous step and itemId variable.
          </div>
        </div>
        
        <div className="flex justify-end">
          <Button 
            onClick={executeYolosPersist}
            disabled={isLoading}
            className="min-w-24"
          >
            {isLoading ? 'Persisting...' : 'Execute'}
          </Button>
        </div>

        {result && (
          <div className="space-y-2">
            <span className="text-sm font-medium text-muted-foreground">Result:</span>
            <pre className="rounded bg-muted p-3 text-sm font-mono overflow-x-auto whitespace-pre-wrap max-h-96 overflow-y-auto">
              {JSON.stringify(result, null, 2)}
            </pre>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

// Debug transform for YOLOS Persist response
export const PersistDebugBlock = () => {
  const [input, setInput] = useState('{}');
  const [result, setResult] = useState<any>(null);

  const executeDebug = () => {
    try {
      const parsedInput = JSON.parse(input);
      const r = parsedInput["YOLOS Persist"];
      const status = r?.status ?? r?.response?.status ?? null;
      const body = r?.data ?? r?.json ?? r?.response?.data ?? r?.response ?? null;
      
      setResult({ status, body });
    } catch (error) {
      setResult({ error: error instanceof Error ? error.message : 'Debug failed' });
    }
  };

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold">Persist Debug</CardTitle>
          <Badge variant="secondary" className="font-mono text-xs">
            Transform
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <span className="text-sm font-medium text-muted-foreground">Input (from YOLOS Persist response):</span>
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Wire from YOLOS Persist block response..."
            className="font-mono text-sm min-h-24"
          />
        </div>
        
        <div className="flex justify-end">
          <Button onClick={executeDebug} className="min-w-24">
            Debug
          </Button>
        </div>

        {result && (
          <div className="space-y-2">
            <span className="text-sm font-medium text-muted-foreground">Debug Output:</span>
            <pre className="rounded bg-muted p-3 text-sm font-mono overflow-x-auto whitespace-pre-wrap max-h-96 overflow-y-auto">
              {JSON.stringify(result, null, 2)}
            </pre>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ApiRequestBlock;