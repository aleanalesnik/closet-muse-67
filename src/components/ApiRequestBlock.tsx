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

// Pre-configured YOLOS Persist block
export const YolosPersistBlock = () => {
  const [itemId, setItemId] = useState('');

  return (
    <div className="space-y-4">
      <Card className="w-full max-w-2xl">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg font-semibold">YOLOS Persist</CardTitle>
            <Badge variant="secondary" className="font-mono text-xs">
              PATCH
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <span className="text-sm font-medium text-muted-foreground">Item ID:</span>
            <input
              type="text"
              value={itemId}
              onChange={(e) => setItemId(e.target.value)}
              placeholder="Enter item ID..."
              className="w-full rounded bg-muted px-2 py-1 text-sm font-mono"
            />
          </div>
          
          <div className="flex items-center space-x-2">
            <span className="text-sm font-medium text-muted-foreground">URL:</span>
            <code className="flex-1 rounded bg-muted px-2 py-1 text-sm font-mono">
              https://tqbjbugwwffdfhihpkcg.supabase.co/rest/v1/items?id=eq.{itemId || '{{item_id}}'}
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
            <div className="flex items-center space-x-2">
              <code className="rounded bg-muted px-2 py-1 text-sm font-mono font-medium">
                Prefer:
              </code>
              <code className="flex-1 rounded bg-muted px-2 py-1 text-sm font-mono">
                return=representation
              </code>
            </div>
          </div>

          <div className="space-y-2">
            <span className="text-sm font-medium text-muted-foreground">Body (JSON):</span>
            <pre className="rounded bg-muted p-3 text-sm font-mono overflow-x-auto whitespace-pre-wrap">
{JSON.stringify({
  "yolos_result": "{{ blocks.YOLOS_Detect.result | toJson }}",
  "yolos_top_labels": "{{ blocks.YOLOS_Detect.result | map('label') | unique | slice(0,3) | toJson }}",
  "yolos_latency_ms": "{{ blocks.YOLOS_Detect.latencyMs }}",
  "yolos_model": "valentinafeve/yolos-fashionpedia"
}, null, 2)}
            </pre>
          </div>
        </CardContent>
      </Card>
      
      <ApiRequestBlock
        name="YOLOS Persist"
        method="PATCH"
        url={`https://tqbjbugwwffdfhihpkcg.supabase.co/rest/v1/items?id=eq.${itemId || 'ENTER_ITEM_ID'}`}
        headers={{
          "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRxYmpidWd3d2ZmZGZoaWhwa2NnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUxMTcwOTUsImV4cCI6MjA3MDY5MzA5NX0.hDjr0Ymv-lK_ra08Ye9ya2wCYOM_LBYs2jgJVs4mJlA",
          "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRxYmpidWd3d2ZmZGZoaWhwa2NnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUxMTcwOTUsImV4cCI6MjA3MDY5MzA5NX0.hDjr0Ymv-lK_ra08Ye9ya2wCYOM_LBYs2jgJVs4mJlA",
          "Content-Type": "application/json",
          "Prefer": "return=representation"
        }}
        body={JSON.stringify({
          "yolos_result": "{{ blocks.YOLOS_Detect.result | toJson }}",
          "yolos_top_labels": "{{ blocks.YOLOS_Detect.result | map('label') | unique | slice(0,3) | toJson }}",
          "yolos_latency_ms": "{{ blocks.YOLOS_Detect.latencyMs }}",
          "yolos_model": "valentinafeve/yolos-fashionpedia"
        }, null, 2)}
      />
    </div>
  );
};

export default ApiRequestBlock;