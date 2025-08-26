import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';

export default function EdgeFunctionDebugger() {
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const testHealthEndpoint = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch('https://tqbjbugwwffdfhihpkcg.supabase.co/functions/v1/sila-model-debugger', {
        method: 'GET'
      });
      
      const data = await response.json();
      setResult({ type: 'health', data });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const testDebugEndpoint = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch('https://tqbjbugwwffdfhihpkcg.supabase.co/functions/v1/sila-model-debugger/debug', {
        method: 'GET'
      });
      
      const data = await response.json();
      setResult({ type: 'debug', data });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle>Edge Function Debugger</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Button onClick={testHealthEndpoint} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Test Health
          </Button>
          <Button onClick={testDebugEndpoint} disabled={loading} variant="outline">
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Test Debug
          </Button>
        </div>

        {error && (
          <div className="p-4 bg-destructive/10 border border-destructive/20 rounded">
            <p className="text-destructive font-medium">Error:</p>
            <p className="text-sm">{error}</p>
          </div>
        )}

        {result && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Badge variant="outline">{result.type}</Badge>
              <Badge variant="secondary">Build: {result.data.build}</Badge>
            </div>
            
            <pre className="bg-muted p-4 rounded text-sm overflow-auto">
              {JSON.stringify(result.data, null, 2)}
            </pre>
          </div>
        )}
      </CardContent>
    </Card>
  );
}