import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Upload, Loader2, Search, Clock, CheckCircle, XCircle } from 'lucide-react';

interface InspirationQuery {
  id: string;
  image_path: string;
  status: string;
  error?: string;
  created_at: string;
}

interface Detection {
  id: string;
  query_id: string;
  bbox: number[];
  category?: string;
  crop_path?: string;
  mask_path?: string;
}

interface InspirationProps {
  user: any;
}

export default function Inspiration({ user }: InspirationProps) {
  const [queries, setQueries] = useState<InspirationQuery[]>([]);
  const [detections, setDetections] = useState<Detection[]>([]);
  const [activeQuery, setActiveQuery] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    loadQueries();
  }, []);

  useEffect(() => {
    if (activeQuery) {
      loadDetections(activeQuery);
    }
  }, [activeQuery]);

  const loadQueries = async () => {
    try {
      const { data, error } = await supabase
        .from('inspiration_queries')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setQueries(data || []);
    } catch (error: any) {
      toast({ 
        title: 'Error loading inspiration queries', 
        description: error.message,
        variant: 'destructive' 
      });
    }
  };

  const loadDetections = async (queryId: string) => {
    try {
      const { data, error } = await supabase
        .from('inspiration_detections')
        .select('*')
        .eq('query_id', queryId);

      if (error) throw error;
      setDetections(data || []);
    } catch (error: any) {
      toast({ 
        title: 'Error loading detections', 
        description: error.message,
        variant: 'destructive' 
      });
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      // Generate unique filename
      const fileExt = file.name.split('.').pop();
      const fileName = `${crypto.randomUUID()}.${fileExt}`;
      const filePath = `${user.id}/inspo/${fileName}`;

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from('sila')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // Start inspiration query
      const { data: startData, error: startError } = await supabase.functions.invoke('inspiration-start', {
        body: { imagePath: filePath }
      });

      if (startError) throw startError;

      const queryId = startData.queryId;

      // Run inspiration processing
      const { error: runError } = await supabase.functions.invoke('inspiration-run', {
        body: { queryId }
      });

      if (runError) throw runError;

      // Reload queries
      await loadQueries();
      setActiveQuery(queryId);

      toast({ title: 'Inspiration uploaded and processed!' });
    } catch (error: any) {
      toast({ 
        title: 'Upload failed', 
        description: error.message,
        variant: 'destructive' 
      });
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const getImageUrl = (path: string) => {
    const { data } = supabase.storage.from('sila').getPublicUrl(path);
    return data.publicUrl;
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'queued':
        return <Clock className="w-4 h-4 text-amber-500" />;
      case 'processing':
        return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />;
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-500" />;
      default:
        return null;
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Style Inspiration</h1>
          <p className="text-muted-foreground mt-1">
            Find similar items in your closet from inspiration photos
          </p>
        </div>
        
        <div className="flex gap-4">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileUpload}
            className="hidden"
          />
          <Button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-2"
          >
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            {uploading ? 'Processing...' : 'Analyze Photo'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Query History */}
        <div className="lg:col-span-1">
          <h2 className="text-lg font-semibold mb-4">Recent Searches</h2>
          <div className="space-y-4">
            {queries.map((query) => (
              <Card
                key={query.id}
                className={`cursor-pointer transition-all ${
                  activeQuery === query.id ? 'ring-2 ring-primary' : ''
                }`}
                onClick={() => setActiveQuery(query.id)}
              >
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-16 h-16 rounded-lg overflow-hidden bg-muted">
                      <img
                        src={getImageUrl(query.image_path)}
                        alt="Inspiration"
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {getStatusIcon(query.status)}
                        <Badge 
                          variant={query.status === 'completed' ? 'default' : 'secondary'}
                          className="text-xs"
                        >
                          {query.status}
                        </Badge>
                      </div>
                      
                      <p className="text-sm text-muted-foreground">
                        {new Date(query.created_at).toLocaleDateString()}
                      </p>
                      
                      {query.error && (
                        <p className="text-xs text-red-500 mt-1 truncate">
                          {query.error}
                        </p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Detections */}
        <div className="lg:col-span-2">
          {activeQuery ? (
            <>
              <h2 className="text-lg font-semibold mb-4">Detected Items</h2>
              {detections.length > 0 ? (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {detections.map((detection) => (
                    <Card key={detection.id} className="group hover:shadow-lg transition-shadow">
                      <CardContent className="p-0">
                        <div className="aspect-square relative overflow-hidden rounded-t-lg bg-muted">
                          {detection.crop_path ? (
                            <img
                              src={getImageUrl(detection.crop_path)}
                              alt={`Detected ${detection.category}`}
                              className="w-full h-full object-cover"
                              loading="lazy"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                            </div>
                          )}
                        </div>
                        
                        <div className="p-3">
                          <div className="flex items-center gap-2">
                            {detection.category && (
                              <Badge variant="secondary" className="text-xs">
                                {detection.category}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <Search className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium mb-2">Processing...</h3>
                  <p className="text-muted-foreground">
                    Analyzing your inspiration photo for similar items
                  </p>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-16">
              <div className="w-24 h-24 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                <Search className="w-12 h-12 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-medium mb-2">Find Your Style</h3>
              <p className="text-muted-foreground mb-4">
                Upload inspiration photos to find similar items in your closet
              </p>
              <Button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                Upload Inspiration
              </Button>
            </div>
          )}
        </div>
      </div>

      {queries.length === 0 && (
        <div className="text-center py-16">
          <div className="w-24 h-24 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
            <Search className="w-12 h-12 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-medium mb-2">No inspiration searches yet</h3>
          <p className="text-muted-foreground mb-4">
            Upload photos of outfits you love to find similar pieces in your closet
          </p>
          <Button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            Start Your First Search
          </Button>
        </div>
      )}
    </div>
  );
}