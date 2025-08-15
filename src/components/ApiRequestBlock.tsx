import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface ApiRequestBlockProps {
  name: string;
  method: string;
  url: string;
  onExecute?: () => void;
}

const ApiRequestBlock: React.FC<ApiRequestBlockProps> = ({ name, method, url, onExecute }) => {
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
    />
  );
};

export default ApiRequestBlock;