import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { batchCreateSignedUrls } from '@/lib/storage';
import { uploadAndProcessItem } from '@/lib/items';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import { Upload, Loader2, MoreHorizontal } from 'lucide-react';

interface Item {
  id: string;
  title?: string;
  category?: string;
  subcategory?: string;
  color_name?: string;
  color_hex?: string;
  image_path: string;
  mask_path?: string;
  notes?: string;
  created_at: string;
  yolos_top_labels?: string[];
}

interface ClosetProps {
  user: any;
}

export default function Closet({ user }: ClosetProps) {
  const [items, setItems] = useState<Item[]>([]);
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState<Set<string>>(new Set());
  const [signedUrls, setSignedUrls] = useState<{ [path: string]: string }>({});
  const [yolosAnalyzing, setYolosAnalyzing] = useState(false);
  const [yolosResult, setYolosResult] = useState<any>(null);
  const [selectedImagePreview, setSelectedImagePreview] = useState<string | null>(null);
  const previewImageRef = useRef<HTMLImageElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    loadItems();
  }, []);

  const loadItems = async () => {
    try {
      const { data, error } = await supabase
        .from('items')
        .select('*, yolos_top_labels, yolos_result, yolos_latency_ms, yolos_model')
        .order('created_at', { ascending: false });

      if (error) throw error;
      const itemsData = data || [];
      setItems(itemsData);

      // Batch create signed URLs for all items
      const imagePaths = itemsData.map(item => item.image_path).filter(Boolean);
      if (imagePaths.length > 0) {
        const urls = await batchCreateSignedUrls(imagePaths);
        setSignedUrls(urls);
      }
    } catch (error: any) {
      toast({ 
        title: 'Error loading items', 
        description: error.message,
        variant: 'destructive' 
      });
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Convert image to data URL for YOLOS detection
    const reader = new FileReader();
    reader.onload = async (e) => {
      const newItemImageDataURL = e.target?.result as string;
      setSelectedImagePreview(newItemImageDataURL);
      
      // Call YOLOS Detect API immediately after file selection
      setYolosAnalyzing(true);
      setYolosResult(null);
      
      const yolosStartTime = Date.now();
      
      try {
        const yolosBody = {
          "base64Image": newItemImageDataURL,
          "threshold": 0.5
        };

        const response = await fetch('https://tqbjbugwwffdfhihpkcg.functions.supabase.co/sila-model-debugger', {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRxYmpidWd3d2ZmZGZoaWhwa2NnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUxMTcwOTUsImV4cCI6MjA3MDY5MzA5NX0.hDjr0Ymv-lK_ra08Ye9ya2wCYOM_LBYs2jgJVs4mJlA',
            'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRxYmpidWd3d2ZmZGZoaWhwa2NnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUxMTcwOTUsImV4cCI6MjA3MDY5MzA5NX0.hDjr0Ymv-lK_ra08Ye9ya2wCYOM_LBYs2jgJVs4mJlA',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(yolosBody)
        });

        const yolosLatency = Date.now() - yolosStartTime;
        const responseData = await response.json();
        
        if (response.ok && responseData.status === "success") {
          const yolosResultWithLatency = {
            ...responseData,
            latencyMs: yolosLatency
          };
          setYolosResult(yolosResultWithLatency);
          // Trigger bounding box drawing after setting result
          setTimeout(() => drawBoundingBoxes(yolosResultWithLatency), 100);
        } else {
          throw new Error('Detection failed');
        }
      } catch (error) {
        toast({
          title: "YOLOS call failed. Please try again.",
          variant: "destructive"
        });
        setYolosResult({ error: true });
      } finally {
        setYolosAnalyzing(false);
      }
    };
    
    reader.readAsDataURL(file);

    // Continue with existing upload flow
    setUploading(true);
    try {
      console.log("Starting upload for file:", file.name);
      const { itemId, fn } = await uploadAndProcessItem(file, file.name.split('.')[0]);
      console.log("Upload completed:", { itemId, fn });
      
      // PRECHECK: Ensure we have required variables
      const newItemId = itemId;
      if (!newItemId || !yolosResult || yolosResult.status !== "success") {
        toast({
          title: "YOLOS not available; skipping persist.",
        });
      } else {
        try {
          // 1) Compute top labels (unique by label, highest score first, max 5)
          const sorted = Array.isArray(yolosResult?.result) ? [...yolosResult.result].sort((a: any, b: any) => b.score - a.score) : [];
          const yolosTop = Array.from(new Map(sorted.map((o: any) => [String(o.label).toLowerCase().trim(), o])).values())
            .map((o: any) => o.label.toLowerCase().trim())
            .slice(0, 5);

          // 2) Build payload
          const payload = {
            yolos_result: yolosResult,
            yolos_latency_ms: yolosResult.latencyMs ?? null,
            yolos_model: "valentinafeve/yolos-fashionpedia",
            yolos_top_labels: yolosTop
          };

          // 3) Run Supabase UPDATE
          const { data, error } = await supabase
            .from("items")
            .update(payload)
            .eq("id", newItemId)
            .select("id, yolos_top_labels")
            .single();

          // 4) Capture results
          const rowsUpdated = data ? 1 : 0;
          const errMsg = error?.message ?? "none";

          // 5) UX feedback
          toast({
            title: `YOLOS persist → rows:${rowsUpdated} error:${errMsg}`,
          });
        } catch (yolosUpdateError: any) {
          const errMsg = yolosUpdateError?.message ?? "unknown";
          toast({
            title: `YOLOS persist → rows:0 error:${errMsg}`,
            variant: "destructive",
          });
        }
      }
      
      // Extract FASHION_SEG status for dev badge
      const fashionSegStatus = fn?.trace?.find((t: any) => t.step === "FASHION_SEG")?.status;
      const devBadge = import.meta.env.DEV && fashionSegStatus ? ` (YOLOS: ${fashionSegStatus})` : "";
      
      toast({
        title: fn?.ok !== false ? "Processing started" : "Uploaded",
        description: (fn?.ok !== false ? "We're tagging your item…" : "We'll retry processing in the background.") + devBadge
      });

      // Refresh items list to show the new item
      await loadItems();
      
    } catch (err: any) {
      console.error("Upload failed:", err);
      toast({ 
        title: "Upload failed", 
        description: err?.message ?? String(err), 
        variant: "destructive" 
      });
    } finally {
      setUploading(false);
      setSelectedImagePreview(null);
      setYolosResult(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const drawBoundingBoxes = (result: any) => {
    const overlay = document.getElementById('yolos-overlay');
    const previewImg = previewImageRef.current;
    
    if (!overlay || !previewImg || !result?.result) return;
    
    // Clear existing boxes
    overlay.innerHTML = '';
    
    // Wait for image to be loaded if not already
    const drawBoxes = () => {
      const natW = previewImg.naturalWidth;
      const natH = previewImg.naturalHeight;
      const dispW = previewImg.clientWidth;
      const dispH = previewImg.clientHeight;
      
      if (natW === 0 || natH === 0) {
        // If naturalWidth/Height not available, create offscreen image
        const offscreenImg = new Image();
        offscreenImg.onload = () => {
          const sx = dispW / offscreenImg.naturalWidth;
          const sy = dispH / offscreenImg.naturalHeight;
          renderBoxes(result.result, overlay, sx, sy);
        };
        offscreenImg.src = selectedImagePreview!;
        return;
      }
      
      const sx = dispW / natW;
      const sy = dispH / natH;
      renderBoxes(result.result, overlay, sx, sy);
    };
    
    if (previewImg.complete) {
      drawBoxes();
    } else {
      previewImg.onload = drawBoxes;
    }
  };
  
  const renderBoxes = (detections: any[], overlay: HTMLElement, sx: number, sy: number) => {
    detections.forEach((detection, idx) => {
      if (detection.score < 0.50) return;
      
      const { box, label, score } = detection;
      const { xmin, ymin, xmax, ymax } = box;
      
      const left = Math.round(xmin * sx);
      const top = Math.round(ymin * sy);
      const width = Math.round((xmax - xmin) * sx);
      const height = Math.round((ymax - ymin) * sy);
      
      const boxDiv = document.createElement('div');
      boxDiv.style.cssText = `
        position: absolute;
        left: ${left}px;
        top: ${top}px;
        width: ${width}px;
        height: ${height}px;
        border: 2px solid rgba(0,0,0,0.9);
        border-radius: 6px;
        background: rgba(0,0,0,0.06);
        pointer-events: none;
      `;
      
      const labelDiv = document.createElement('div');
      labelDiv.textContent = `${label} ${(score * 100).toFixed(0)}%`;
      labelDiv.style.cssText = `
        position: absolute;
        top: -2px;
        left: -2px;
        background: rgba(0,0,0,0.9);
        color: white;
        padding: 2px 6px;
        font-size: 10px;
        border-radius: 4px 0 4px 0;
        white-space: nowrap;
      `;
      
      boxDiv.appendChild(labelDiv);
      overlay.appendChild(boxDiv);
    });
  };

  const handleRetryProcessing = async (itemId: string, imagePath: string) => {
    setProcessing(prev => new Set([...prev, itemId]));
    
    try {
      const { data, error } = await supabase.functions.invoke("items-process", {
        body: { itemId, imagePath, debug: import.meta.env.DEV }
      });
      
      if (error) {
        toast({
          title: "Retry failed",
          description: (error as any)?.message || "Processing failed",
          variant: "destructive"
        });
      } else {
        toast({
          title: data?.ok ? "Processing completed" : "Processing queued",
          description: data?.ok ? "Item has been processed successfully" : "We'll retry in the background"
        });
      }
      
      // Refresh items list
      await loadItems();
    } catch (err: any) {
      toast({
        title: "Retry failed", 
        description: err?.message || "Unknown error",
        variant: "destructive"
      });
    } finally {
      setProcessing(prev => {
        const next = new Set(prev);
        next.delete(itemId);
        return next;
      });
    }
  };

  // Remove processing state when item has category (processing completed)
  useEffect(() => {
    setProcessing(prev => {
      const newSet = new Set(prev);
      items.forEach(item => {
        if (item.category && newSet.has(item.id)) {
          newSet.delete(item.id);
        }
      });
      return newSet;
    });
  }, [items]);

  return (
    <>
      <style>{`
        .ai-row { display:flex; gap:6px; flex-wrap:wrap; margin-top:4px; align-items:center; }
        .ai-kicker { font-size:12px; line-height:18px; padding:2px 6px; border-radius:9999px;
                     background:#4f46e5; color:white; font-weight:600; }
        .ai-chip { font-size:12px; line-height:18px; padding:2px 8px; border-radius:9999px;
                   border:1px dashed #818cf8; color:#4f46e5; background:#eef2ff; }
      `}</style>
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-foreground">My Closet</h1>
          <p className="text-muted-foreground mt-1">{items.length} items in your collection</p>
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
            disabled={uploading || yolosAnalyzing}
            className="flex items-center gap-2"
          >
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {uploading ? 'Uploading...' : 'Add Item'}
          </Button>
        </div>
      </div>

      {/* YOLOS Detection Preview */}
      {selectedImagePreview && (
        <div className="mb-8 max-w-md mx-auto">
          <Card className="p-4">
            <div className="relative">
              <div className="relative">
                <img 
                  ref={previewImageRef}
                  src={selectedImagePreview} 
                  alt="Preview" 
                  className="w-full h-64 object-cover rounded"
                />
                <div 
                  id="yolos-overlay"
                  className="absolute left-0 top-0 w-full h-full pointer-events-none"
                />
              </div>
              {yolosAnalyzing && (
                <div className="mt-2 text-sm text-muted-foreground">
                  Analyzing with YOLOS (Supabase)…
                </div>
              )}
              {yolosResult && !yolosAnalyzing && (
                <div className="mt-2 space-y-1">
                  <div id="yolos-proof" className="text-sm font-medium">
                    {yolosResult.error 
                      ? "YOLOS ✗ (error)"
                      : `YOLOS ✓ — ${yolosResult.result.length} detections in ${yolosResult.latencyMs} ms`
                    }
                  </div>
                  {yolosResult.result && (
                    <div className="space-y-1">
                      {yolosResult.result.slice(0, 3).map((detection: any, idx: number) => (
                        <div key={idx} className="text-xs text-muted-foreground">
                          {detection.label}: {(detection.score * 100).toFixed(2)}%
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </Card>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
        {items.map((item) => {
          // Compute AI labels safely
          const aiLabels = Array.isArray(item.yolos_top_labels)
            ? [...new Set(item.yolos_top_labels.filter(Boolean).map(s => String(s).trim().toLowerCase()))]
            : [];

          return (
            <div key={item.id} className="relative group">
              <Link to={`/item/${item.id}`} className="block">
                <Card className="overflow-hidden hover:shadow-lg transition-shadow">
                  <div className="aspect-square relative">
                    {processing.has(item.id) && (
                      <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-10 rounded-t-lg">
                        <Loader2 className="h-8 w-8 animate-spin text-white" />
                      </div>
                    )}
                    <img 
                      src={signedUrls[item.image_path] || "/placeholder.svg"} 
                      alt={item.title || 'Closet item'}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button 
                            variant="secondary" 
                            size="sm" 
                            className="h-8 w-8 p-0"
                            onClick={(e) => e.preventDefault()} // Prevent Link navigation
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem 
                            onClick={(e) => {
                              e.preventDefault();
                              handleRetryProcessing(item.id, item.image_path);
                            }}
                            disabled={processing.has(item.id)}
                          >
                            {processing.has(item.id) ? 'Processing...' : 'Retry processing'}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                  <CardContent className="p-4">
                    <h3 className="font-medium text-sm mb-2 line-clamp-2">{item.title || 'Untitled'}</h3>
                    <div className="flex flex-wrap gap-1 mb-2">
                      {item.category && (
                        <Badge variant="secondary" className="text-xs">
                          {item.category}
                        </Badge>
                      )}
                      {item.subcategory && (
                        <Badge variant="outline" className="text-xs">
                          {item.subcategory}
                        </Badge>
                      )}
                      {item.color_name && (
                        <Badge variant="outline" className="text-xs">
                          {item.color_name}
                        </Badge>
                      )}
                    </div>
                    {aiLabels.length > 0 && (
                      <div className="ai-row" data-testid="ai-chips">
                        <span className="ai-kicker">AI</span>
                        {aiLabels.slice(0, 3).map(label => (
                          <span key={label} className="ai-chip">{label}</span>
                        ))}
                      </div>
                    )}
                    <div className="text-xs text-muted-foreground">
                      Added {new Date(item.created_at).toLocaleDateString()}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            </div>
          );
        })}
      </div>

      {items.length === 0 && (
        <div className="text-center py-16">
          <div className="w-24 h-24 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
            <Upload className="w-12 h-12 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-medium mb-2">Your closet is empty</h3>
          <p className="text-muted-foreground mb-4">
            Start building your virtual wardrobe by uploading photos of your clothes
          </p>
          <Button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            Upload Your First Item
          </Button>
        </div>
      )}
    </div>
    </>
  );
}