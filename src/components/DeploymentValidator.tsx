import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, XCircle, Clock, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

interface EdgeFunctionHealth {
  status: string;
  build: string;
  timestamp: string;
  uptime: number;
}

interface ValidationResult {
  isLive: boolean;
  buildMatches: boolean;
  responseTime: number;
  error?: string;
  healthData?: EdgeFunctionHealth;
}

export function DeploymentValidator() {
  const [isValidating, setIsValidating] = useState(false);
  const [lastValidation, setLastValidation] = useState<ValidationResult | null>(null);

  // Get expected BUILD string (should match edge function logic)
  function getExpectedBuild(): string {
    const now = new Date();
    const date = now.toISOString().split('T')[0]; // YYYY-MM-DD
    const hour = now.getHours();
    const letter = String.fromCharCode(97 + (hour % 26)); // a-z based on hour
    return `sila-debugger-${date}${letter}`;
  }

  const validateDeployment = async () => {
    setIsValidating(true);
    const startTime = performance.now();
    
    try {
      // Test edge function health endpoint
      const response = await fetch(
        'https://tqbjbugwwffdfhihpkcg.supabase.co/functions/v1/sila-model-debugger',
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRxYmpidWd3d2ZmZGZoaWhwa2NnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUxMTcwOTUsImV4cCI6MjA3MDY5MzA5NX0.hDjr0Ymv-lK_ra08Ye9ya2wCYOM_LBYs2jgJVs4mJlA`,
            'Content-Type': 'application/json',
          },
        }
      );

      const responseTime = performance.now() - startTime;
      const expectedBuild = getExpectedBuild();

      if (!response.ok) {
        const result: ValidationResult = {
          isLive: false,
          buildMatches: false,
          responseTime,
          error: `HTTP ${response.status}: ${response.statusText}`,
        };
        setLastValidation(result);
        toast.error('Edge function is not responding correctly', {
          description: `Got ${response.status} status code`,
        });
        return;
      }

      const healthData: EdgeFunctionHealth = await response.json();
      const buildMatches = healthData.build === expectedBuild;

      const result: ValidationResult = {
        isLive: true,
        buildMatches,
        responseTime,
        healthData,
      };

      setLastValidation(result);

      if (buildMatches) {
        toast.success('Edge function deployed successfully!', {
          description: `Build: ${healthData.build} | Response time: ${Math.round(responseTime)}ms`,
        });
      } else {
        toast.warning('Edge function is live but BUILD string mismatch', {
          description: `Expected: ${expectedBuild}, Got: ${healthData.build}`,
        });
      }

    } catch (error) {
      const responseTime = performance.now() - startTime;
      const result: ValidationResult = {
        isLive: false,
        buildMatches: false,
        responseTime,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
      setLastValidation(result);
      
      toast.error('Failed to validate edge function', {
        description: error instanceof Error ? error.message : 'Network or connection error',
      });
    } finally {
      setIsValidating(false);
    }
  };

  const getStatusIcon = (result: ValidationResult) => {
    if (!result.isLive) return <XCircle className="h-4 w-4 text-destructive" />;
    if (!result.buildMatches) return <Clock className="h-4 w-4 text-warning" />;
    return <CheckCircle className="h-4 w-4 text-success" />;
  };

  const getStatusText = (result: ValidationResult) => {
    if (!result.isLive) return 'Offline';
    if (!result.buildMatches) return 'Build Mismatch';
    return 'Healthy';
  };

  const getStatusBadgeVariant = (result: ValidationResult) => {
    if (!result.isLive) return 'destructive';
    if (!result.buildMatches) return 'secondary';
    return 'default';
  };

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Edge Function Deployment Status
          {lastValidation && getStatusIcon(lastValidation)}
        </CardTitle>
        <CardDescription>
          Validate that sila-model-debugger is deployed and responding correctly
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-4">
        <Button 
          onClick={validateDeployment} 
          disabled={isValidating}
          className="w-full"
        >
          {isValidating ? (
            <>
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              Validating...
            </>
          ) : (
            'Validate Deployment'
          )}
        </Button>

        {lastValidation && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-medium">Status:</span>
              <Badge variant={getStatusBadgeVariant(lastValidation)}>
                {getStatusText(lastValidation)}
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="font-medium">Response Time:</span>
                <p className="text-muted-foreground">{Math.round(lastValidation.responseTime)}ms</p>
              </div>
              
              {lastValidation.healthData && (
                <div>
                  <span className="font-medium">Build Version:</span>
                  <p className="text-muted-foreground font-mono text-xs">
                    {lastValidation.healthData.build}
                  </p>
                </div>
              )}
            </div>

            {lastValidation.error && (
              <div className="p-3 rounded-md bg-destructive/10 border border-destructive/20">
                <p className="text-sm text-destructive font-medium">Error Details:</p>
                <p className="text-xs text-destructive/80 font-mono mt-1">
                  {lastValidation.error}
                </p>
              </div>
            )}

            {lastValidation.healthData && (
              <div className="p-3 rounded-md bg-muted/50 border">
                <p className="text-sm font-medium mb-2">Function Health Details:</p>
                <div className="text-xs text-muted-foreground space-y-1">
                  <div>Deployed: {new Date(lastValidation.healthData.timestamp).toLocaleString()}</div>
                  <div>Uptime: {Math.round(lastValidation.healthData.uptime)}ms</div>
                  <div className="flex items-center gap-2">
                    Build Match: 
                    {lastValidation.buildMatches ? (
                      <CheckCircle className="h-3 w-3 text-success" />
                    ) : (
                      <XCircle className="h-3 w-3 text-warning" />
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="text-xs text-muted-foreground">
          <p className="font-medium mb-1">Expected Build Pattern:</p>
          <p className="font-mono">sila-debugger-YYYY-MM-DD[hour-letter]</p>
          <p className="mt-1">Current expected: <span className="font-mono">{getExpectedBuild()}</span></p>
        </div>
      </CardContent>
    </Card>
  );
}