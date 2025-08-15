import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface ApiRequestBlockProps {
  name: string;
  method: string;
  url: string;
  headers?: Record<string, string>;
  onExecute?: () => void;
}

const ApiRequestBlock: React.FC<ApiRequestBlockProps> = ({ name, method, url, headers, onExecute }) => {
  const [isLoading, setIsLoading] = useState(false);

  const handleExecute = async () => {
    setIsLoading(true);
    try {
      if (onExecute) {
        onExecute();
      }
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
        
        <div className="flex justify-end">
          <Button 
            onClick={handleExecute}
            disabled={isLoading}
            className="min-w-24"
          >
            {isLoading ? 'Loading...' : 'Execute'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

// Pre-configured YOLOS Detect block
export const YolosDetectBlock = () => {
  return (
    <ApiRequestBlock
      name="YOLOS Detect"
      method="POST"
      url="https://tqbjbugwwffdfhihpkcg.functions.supabase.co/sila-model-debugger"
      headers={{
        "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRxYmpidWd3d2ZmZGZoaWhwa2NnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUxMTcwOTUsImV4cCI6MjA3MDY5MzA5NX0.hDjr0Ymv-lK_ra08Ye9ya2wCYOM_LBYs2jgJVs4mJlA",
        "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRxYmpidWd3d2ZmZGZoaWhwa2NnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUxMTcwOTUsImV4cCI6MjA3MDY5MzA5NX0.hDjr0Ymv-lK_ra08Ye9ya2wCYOM_LBYs2jgJVs4mJlA",
        "Content-Type": "application/json"
      }}
    />
  );
};

export default ApiRequestBlock;