import { useState, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Upload, Loader2, Search } from 'lucide-react';
import { analyzeImage } from '@/lib/yolos';
import { findMatchingItems } from '@/lib/items';

interface Detection {
  id: string;
  query_id: string;
  bbox?: number[];
  bbox_x?: number;
  bbox_y?: number;
  bbox_width?: number;
  bbox_height?: number;
  label?: string;
  score?: number;
  category?: string;
  details?: string[];
  crop_path?: string;
  crop_image_url?: string;
  color_name?: string | null;
  color_hex?: string | null;
}

interface MatchedItem {
  id: string;
  title: string;
  category: string;
  subcategory?: string;
  color_hex?: string;
  color_name?: string;
  image_path: string;
}

interface InspirationProps {
  user: any;
}

export default function Inspiration({ user }: InspirationProps) {
  const [detections, setDetections] = useState<Detection[]>([]);
  const [matchedItems, setMatchedItems] = useState<{[detectionId: string]: MatchedItem[]}>({});
  const [uploading, setUploading] = useState(false);
  const [imageUrls, setImageUrls] = useState<{[key: string]: string}>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      // Call YOLOS analysis on the file directly
      const analysis = await analyzeImage(file, { threshold: 0.5 });

      toast({ 
        title: 'Photo processed', 
        description: `Found ${analysis.result?.length || 0} items`
      });

      // Create detections from YOLOS results - use main category for all detections
      const newDetections: Detection[] = analysis.result && analysis.result.length > 0 
        ? analysis.result.map((item: any, idx: number) => ({
            id: `detection-${idx}`,
            query_id: 'current',
            label: item.label,
            score: item.score,
            category: analysis.category, // Use the main category from analysis
            details: analysis.details,
            bbox_x: item.box?.[0] || 0,
            bbox_y: item.box?.[1] || 0, 
            bbox_width: item.box?.[2] || 0,
            bbox_height: item.box?.[3] || 0,
            color_name: analysis.colorName,
            color_hex: analysis.colorHex
          }))
        : [{
            id: 'detection-0',
            query_id: 'current',
            label: analysis.category || 'Item',
            score: 1.0,
            category: analysis.category,
            details: analysis.details,
            bbox_x: 0,
            bbox_y: 0,
            bbox_width: 1,
            bbox_height: 1,
            color_name: analysis.colorName,
            color_hex: analysis.colorHex
          }];

      setDetections(newDetections);
      
      // Find matching items for each detection using metadata
      const matches: {[detectionId: string]: MatchedItem[]} = {};
      
      for (const detection of newDetections) {
        if (detection.category) {
          try {
            const matchingItems = await findMatchingItems({ 
              category: detection.category, 
              details: detection.details 
            });
            matches[detection.id] = matchingItems;
            
            // Load public URLs for matched item images
            const imagePaths = matchingItems.map(item => item.image_path);
            const urls: {[key: string]: string} = {};
            
            imagePaths.forEach((path) => {
              const { data: pub } = supabase.storage.from('sila').getPublicUrl(path);
              urls[path] = pub.publicUrl;
            });
            
            setImageUrls(prev => ({...prev, ...urls}));
          } catch (error) {
            console.error(`Error loading matches for detection ${detection.id}:`, error);
          }
        }
      }
      
      setMatchedItems(matches);
      
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
            {uploading ? 'Uploading…' : 'Find Your Style'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {/* Detections */}
        <div>
          {detections.length > 0 ? (
            <>
              <h2 className="text-lg font-semibold mb-4">Detected Items & Matches</h2>
              <div className="space-y-8">
                {detections.map((detection) => (
                  <div key={detection.id} className="border rounded-lg p-4">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                      {/* Detection Info */}
                      <Card className="md:col-span-1">
                        <CardContent className="p-4">
                          <div className="text-center">
                            {detection.category && (
                              <Badge variant="secondary" className="text-xs mb-2">
                                {detection.category}
                              </Badge>
                            )}
                            <p className="text-sm font-medium">Detected Item</p>
                            {detection.label && (
                              <p className="text-xs text-muted-foreground mt-1">{detection.label}</p>
                            )}
                            {detection.score && (
                              <p className="text-xs text-muted-foreground">
                                {Math.round(detection.score * 100)}% confidence
                              </p>
                            )}
                            {detection.details && detection.details.length > 0 && (
                              <div className="mt-2">
                                <p className="text-xs text-muted-foreground mb-1">Details:</p>
                                <div className="flex flex-wrap gap-1">
                                  {detection.details.map((detail, idx) => (
                                    <Badge key={idx} variant="outline" className="text-xs">
                                      {detail}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </CardContent>
                      </Card>

                      {/* Matched Items */}
                      <div className="md:col-span-3">
                        <h4 className="text-sm font-medium mb-3">Similar items from your closet:</h4>
                        {matchedItems[detection.id]?.length > 0 ? (
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                            {matchedItems[detection.id].map((item) => (
                              <Card key={item.id} className="group hover:shadow-lg transition-shadow">
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
                                        {item.category}
                                      </Badge>
                                      {item.color_hex && (
                                        <div 
                                          className="w-4 h-4 rounded-full border"
                                          style={{ backgroundColor: item.color_hex }}
                                          title={item.color_name || ''}
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
                              No similar items found in your closet for this {detection.category?.toLowerCase() || 'item'}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="text-center py-12">
              <Upload className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">Upload a photo to get started</h3>
              <p className="text-muted-foreground">
                Find similar items in your closet using AI
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}