import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Upload, Loader2, Search, Clock, CheckCircle, XCircle } from 'lucide-react';
import { uploadAndStartInspiration } from '@/lib/inspo';
import { getSignedImageUrl } from '@/lib/storage';

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
  embedding?: number[];
}

interface MatchedItem {
  item_id: string;
  score: number;
  title: string;
  category: string;
  subcategory: string;
  color_hex: string;
  color_name: string;
  image_path: string;
}

interface InspirationProps {
  user: any;
}

export default function Inspiration({ user }: InspirationProps) {
  const [queries, setQueries] = useState<InspirationQuery[]>([]);
  const [detections, setDetections] = useState<Detection[]>([]);
  const [matchedItems, setMatchedItems] = useState<{[detectionId: string]: MatchedItem[]}>({});
  const [activeQuery, setActiveQuery] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [imageUrls, setImageUrls] = useState<{[key: string]: string}>({});
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
      
      // Load signed URLs for all query images
      if (data && data.length > 0) {
        const paths = data.map(q => q.image_path);
        const urls: {[key: string]: string} = {};
        
        await Promise.all(
          paths.map(async (path) => {
            const url = await getSignedImageUrl(path);
            if (url) urls[path] = url;
          })
        );
        
        setImageUrls(prev => ({...prev, ...urls}));
      }
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
      const detectionData = data || [];
      setDetections(detectionData);
      
      // Load signed URLs for all detection crops
      if (detectionData.length > 0) {
        const paths = detectionData.filter(d => d.crop_path).map(d => d.crop_path!);
        const urls: {[key: string]: string} = {};
        
        await Promise.all(
          paths.map(async (path) => {
            const url = await getSignedImageUrl(path);
            if (url) urls[path] = url;
          })
        );
        
        setImageUrls(prev => ({...prev, ...urls}));
        
        // Load matched items for detections with embeddings
        await loadMatchedItems(detectionData);
      }
    } catch (error: any) {
      toast({ 
        title: 'Error loading detections', 
        description: error.message,
        variant: 'destructive' 
      });
    }
  };

  const loadMatchedItems = async (detections: Detection[]) => {
    if (!user?.id) return;
    
    const matches: {[detectionId: string]: MatchedItem[]} = {};
    
    for (const detection of detections) {
      if (detection.embedding) {
        try {
          const { data, error } = await supabase.rpc('match_user_items', {
            p_owner: user.id,
            p_query: detection.embedding,
            p_limit: 6
          });
          
          if (!error && data) {
            matches[detection.id] = data;
            
            // Load signed URLs for matched item images
            const imagePaths = data.map((item: MatchedItem) => item.image_path);
            const urls: {[key: string]: string} = {};
            
            await Promise.all(
              imagePaths.map(async (path) => {
                const url = await getSignedImageUrl(path);
                if (url) urls[path] = url;
              })
            );
            
            setImageUrls(prev => ({...prev, ...urls}));
          }
        } catch (error) {
          console.error(`Error loading matches for detection ${detection.id}:`, error);
        }
      }
    }
    
    setMatchedItems(matches);
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      // Use the new helper function
      const { queryId } = await uploadAndStartInspiration(file);
      
      toast({ 
        title: 'Photo queued', 
        description: `Query ${queryId} started.`
      });
      
      // Reload queries
      await loadQueries();
      setActiveQuery(queryId);
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

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'queued':
        return <Clock className="w-4 h-4 text-amber-500" />;
      case 'processing':
        return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />;
      case 'completed':
      case 'done':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'failed':
      case 'error':
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
            Upload a photo to find similar items in your closet
          </p>
        </div>
        
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileUpload}
            className="hidden"
          />
          <Button
            size="lg"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-2"
          >
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {uploading ? 'Uploading…' : 'Upload & Analyze Photo'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Query History */}
        <div className="lg:col-span-1">
          <h2 className="text-lg font-semibold mb-4">Recent Searches</h2>
          <div className="space-y-4">
            {queries.length === 0 ? (
              <p className="text-muted-foreground">No inspiration searches yet.</p>
            ) : (
              queries.map((query) => (
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
                          src={imageUrls[query.image_path] || "/placeholder.svg"}
                          alt="Inspiration"
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          {getStatusIcon(query.status)}
                          <Badge 
                            variant={['completed', 'done'].includes(query.status) ? 'default' : 'secondary'}
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
              ))
            )}
          </div>
        </div>

        {/* Detections */}
        <div className="lg:col-span-2">
          {activeQuery ? (
            (() => {
              const currentQuery = queries.find(q => q.id === activeQuery);
              const isProcessing = currentQuery && ['queued', 'processing'].includes(currentQuery.status);
              
              if (isProcessing) {
                return (
                  <>
                    <h2 className="text-lg font-semibold mb-4">Processing...</h2>
                    <div className="text-center py-12">
                      <Loader2 className="w-12 h-12 text-muted-foreground mx-auto mb-4 animate-spin" />
                      <h3 className="text-lg font-medium mb-2">Analyzing your photo</h3>
                      <p className="text-muted-foreground">
                        Finding similar items in your closet
                      </p>
                    </div>
                  </>
                );
              }

              return (
                <>
                  <h2 className="text-lg font-semibold mb-4">Detected Items & Matches</h2>
                  {detections.length > 0 ? (
                    <div className="space-y-8">
                      {detections.map((detection) => (
                        <div key={detection.id} className="border rounded-lg p-4">
                          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            {/* Detection Card */}
                            <Card className="md:col-span-1">
                              <CardContent className="p-0">
                                <div className="aspect-square relative overflow-hidden rounded-lg bg-muted">
                                  {detection.crop_path ? (
                                    <img
                                      src={imageUrls[detection.crop_path!] || "/placeholder.svg"}
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
                                <div className="p-3 text-center">
                                  {detection.category && (
                                    <Badge variant="secondary" className="text-xs">
                                      {detection.category}
                                    </Badge>
                                  )}
                                  <p className="text-sm font-medium mt-2">Detected Item</p>
                                </div>
                              </CardContent>
                            </Card>

                            {/* Matched Items */}
                            <div className="md:col-span-3">
                              <h4 className="text-sm font-medium mb-3">Similar items from your closet:</h4>
                              {matchedItems[detection.id]?.length > 0 ? (
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                  {matchedItems[detection.id].map((item) => (
                                    <Card key={item.item_id} className="group hover:shadow-lg transition-shadow">
                                      <CardContent className="p-0">
                                        <div className="aspect-square relative overflow-hidden rounded-t-lg bg-muted">
                                          <img
                                            src={imageUrls[item.image_path] || "/placeholder.svg"}
                                            alt={item.title}
                                            className="w-full h-full object-cover"
                                            loading="lazy"
                                          />
                                        </div>
                                        <div className="p-2">
                                          <p className="text-xs font-medium truncate">{item.title}</p>
                                          <div className="flex items-center justify-between mt-1">
                                            <Badge variant="outline" className="text-xs">
                                              {Math.round(item.score * 100)}% match
                                            </Badge>
                                            {item.color_hex && (
                                              <div 
                                                className="w-4 h-4 rounded-full border"
                                                style={{ backgroundColor: item.color_hex }}
                                                title={item.color_name}
                                              />
                                            )}
                                          </div>
                                        </div>
                                      </CardContent>
                                    </Card>
                                  ))}
                                </div>
                              ) : (
                                <div className="text-center py-8 bg-muted/30 rounded-lg">
                                  <Search className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                                  <p className="text-sm text-muted-foreground">
                                    No similar items found in your closet
                                  </p>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12">
                      <Search className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                      <h3 className="text-lg font-medium mb-2">No items detected</h3>
                      <p className="text-muted-foreground">
                        We couldn't find any clothing items in this photo
                      </p>
                    </div>
                  )}
                </>
              );
            })()
          ) : (
            <div className="text-center py-16">
              <div className="w-24 h-24 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                <Search className="w-12 h-12 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-medium mb-2">Find Your Style</h3>
              <p className="text-muted-foreground mb-4">
                Upload inspiration photos to find similar items in your closet
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}