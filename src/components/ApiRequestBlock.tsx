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
      // YOLOS Normalize
      console.log('[YOLOS Normalize] input:', {});

      // YOLOS Detect sometimes returns an array or { result: array, latencyMs }.
      // Support both.
      const $input: any = {}; // In real implementation, this would be $input from YOLOS Detect
      const raw = Array.isArray($input) ? $input :
                  Array.isArray($input?.result) ? $input.result :
                  [];
      const latencyMs = typeof $input?.latencyMs === 'number' ? $input.latencyMs : $input?.latencyMs || null;

      // Keep only the fields we render/persist.
      // Also coerce to integers where it helps the UI.
      const yolos = raw.map((r: any) => ({
        label: String(r.label ?? ''),
        score: typeof r.score === 'number' ? r.score : Number(r.score ?? 0),
        box: {
          xmin: Math.round(Number(r.box?.xmin ?? r.xmin ?? 0)),
          ymin: Math.round(Number(r.box?.ymin ?? r.ymin ?? 0)),
          xmax: Math.round(Number(r.box?.xmax ?? r.xmax ?? 0)),
          ymax: Math.round(Number(r.box?.ymax ?? r.ymax ?? 0)),
        }
      })).filter((d: any) => d.label && d.score > 0);

      // Top 3 labels by highest score, unique by label
      const seen = new Set();
      const topLabels: string[] = [];
      [...yolos].sort((a, b) => b.score - a.score).forEach((d: any) => {
        if (!seen.has(d.label)) {
          seen.add(d.label);
          topLabels.push(d.label);
        }
      });
      while (topLabels.length > 3) topLabels.pop();

      const out = { yolos, topLabels, latencyMs };
      console.log('[YOLOS Normalize] output:', out);
      setResult(out);
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
      // Persist YOLOS
      console.log('[Persist YOLOS] input:', {});

      // TODO: adjust this import to match the app's existing Supabase client helper.
      // import { supabase } from '@/lib/supabase'; // <- use the project's real path

      const $input: any = {}; // In real implementation, this would be from YOLOS Normalize
      const { yolos, topLabels, latencyMs } = $input || {};
      const itemId = 'test-item-id'; // In real implementation: $vars.itemId || $input?.itemId || $context?.itemId;

      if (!itemId) {
        console.warn('[Persist YOLOS] Missing itemId in flow context.');
        // $toast.error('Missing item id; cannot save YOLOS.');
        setResult({ ok: false, reason: 'no_item_id' });
        return;
      }
      if (!Array.isArray(yolos) || yolos.length === 0) {
        console.info('[Persist YOLOS] No detections; skipping persist.');
        // $toast.info('YOLOS not available; skipping persist.');
        setResult({ ok: false, reason: 'no_detections' });
        return;
      }

      const payload = {
        yolos_result: yolos,
        yolos_top_labels: topLabels ?? [],
        yolos_latency_ms: typeof latencyMs === 'number' ? Math.round(latencyMs) : null
      };

      console.log('[Persist YOLOS] Updating', itemId, payload);

      // In real implementation, this would use: 
      // const { error } = await supabase.from('items').update(payload).eq('id', itemId);
      
      // Simulated for demo
      const error = null;

      if (error) {
        console.error('[Persist YOLOS] Update failed:', error);
        // $toast.error(`Failed to save YOLOS: ${error.message || error}`);
        setResult({ ok: false, error });
        return;
      }

      // $toast.success(`Saved YOLOS ✓ — ${yolos.length} detections${payload.yolos_latency_ms ? ` in ${payload.yolos_latency_ms} ms` : ''}`);
      console.log('[Persist YOLOS] Update success.');
      setResult({ ok: true, itemId, saved: payload });
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