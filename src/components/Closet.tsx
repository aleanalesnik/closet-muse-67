import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { batchCreateSignedUrls } from '@/lib/storage';
import { uploadAndProcessItem } from '@/lib/items';
import { dominantHexFromUrl, snapToPalette, mapLabel, makeTitle, isValidItemBox, humanizeFileName, toBBox, type Det } from '@/lib/aiMapping';
import SmartCropImg from '@/components/SmartCropImg';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Upload, Loader2, Trash2, Check, X, Square, CheckSquare } from 'lucide-react';

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
  bbox?: number[] | null;
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
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
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
        .select('*, yolos_top_labels, yolos_result, yolos_latency_ms, yolos_model, bbox')
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

    // Set preview for UI
    const reader = new FileReader();
    reader.onload = (e) => {
      setSelectedImagePreview(e.target?.result as string);
    };
    reader.readAsDataURL(file);

    // Continue with existing upload flow
    setUploading(true);
    try {
      console.log("Starting upload for file:", file.name);
      const { itemId, imagePath, fn } = await uploadAndProcessItem(file, file.name.split('.')[0]);
      console.log("Upload completed:", { itemId, imagePath, fn });
      
      // Call YOLOS with public URL after upload
      setYolosAnalyzing(true);
      setYolosResult(null);
      
      try {
        // Get public URL for the uploaded image using the actual imagePath
        const { data: pub } = supabase.storage.from('sila').getPublicUrl(imagePath);
        const imageUrl = pub.publicUrl;
        
        const fnUrl = `https://tqbjbugwwffdfhihpkcg.functions.supabase.co/sila-model-debugger`;
        const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRxYmpidWd3d2ZmZGZoaWhwa2NnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUxMTcwOTUsImV4cCI6MjA3MDY5MzA5NX0.hDjr0Ymv-lK_ra08Ye9ya2wCYOM_LBYs2jgJVs4mJlA';

        const detectRes = await fetch(fnUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${ANON}`,
            'apikey': ANON,
          },
          body: JSON.stringify({ imageUrl, threshold: 0.5 }),
        });
        const detectJson = await detectRes.json();
        console.log('[YOLOS Normalize] output:', detectJson);

        if (!detectRes.ok || detectJson?.status !== 'success') {
          toast({ title: 'YOLOS not available; skipping persist.' });
          setYolosResult({ error: true });
        } else {
          setYolosResult(detectJson);
          // Trigger bounding box drawing after setting result
          setTimeout(() => drawBoundingBoxes(detectJson), 100);

          // 1) Process YOLOS detections for garment-level mapping
          const dets = (detectJson?.result ?? []) as Det[];
          const best = [...dets].sort((a, b) => b.score - a.score)[0];
          const mapped = best ? mapLabel(best.label) : null;

          // 2) Extract color from full image (not bbox)
          const colorHexRaw = await dominantHexFromUrl(imageUrl);
          const { name: colorName, hex: colorHex } = snapToPalette(colorHexRaw);

          // 3) Create garment-level title
          const proposedTitle = makeTitle({
            colorName,
            mapped,
            fallback: humanizeFileName(file.name)
          });

          // 4) Prepare update payload
          const payload: any = {
            title: proposedTitle,
            color_hex: colorHex,
            color_name: colorName,
            yolos_latency_ms: detectJson.latencyMs ?? null,
            yolos_model: detectJson.model ?? 'valentinafeve/yolos-fashionpedia',
            yolos_result: dets,
            yolos_top_labels: dets.slice(0, 3).map(d => d.label),
          };

          // 5) Only persist bbox and category if we detected a valid garment (not a part)
          if (best && isValidItemBox(best) && mapped) {
            payload.category = mapped.category;
            payload.subcategory = mapped.subcategory;
            payload.bbox = [best.box!.xmin, best.box!.ymin, best.box!.xmax, best.box!.ymax];
          } else {
            // Don't persist part bboxes or map part labels to categories
            payload.category = null;
            payload.subcategory = null;
            payload.bbox = null;
          }

          // 6) Update the database
          const { error: updErr } = await supabase
            .from('items')
            .update(payload)
            .eq('id', itemId);

          if (!updErr) {
            toast({
              title: 'AI analysis complete',
              description: `Detected: ${mapped?.subcategory || 'item'}, Color: ${colorName}`,
            });
            
            // 7) Update local state with new data
            setItems(prevItems => 
              prevItems.map(item => 
                item.id === itemId 
                  ? { ...item, ...payload }
                  : item
              )
            );
          } else {
            toast({
              title: 'Save failed',
              description: updErr.message,
              variant: 'destructive',
            });
          }
        }
      } catch (yolosError) {
        console.error('YOLOS processing failed:', yolosError);
        toast({ title: 'YOLOS processing failed.', variant: 'destructive' });
        setYolosResult({ error: true });
      } finally {
        setYolosAnalyzing(false);
      }
      
      // Remove this dev badge since we no longer have trace data
      const devBadge = "";
      
      // DISABLED: Processing started toast
      /*
      toast({
        title: fn?.ok !== false ? "Processing started" : "Uploaded",
        description: (fn?.ok !== false ? "We're tagging your item…" : "We'll retry processing in the background.") + devBadge
      });
      */

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

  const toggleSelectionMode = () => {
    setIsSelectionMode(!isSelectionMode);
    setSelectedItems(new Set());
  };

  const toggleItemSelection = (itemId: string) => {
    setSelectedItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(itemId)) {
        newSet.delete(itemId);
      } else {
        newSet.add(itemId);
      }
      return newSet;
    });
  };

  const selectAllItems = () => {
    setSelectedItems(new Set(items.map(item => item.id)));
  };

  const clearSelection = () => {
    setSelectedItems(new Set());
  };

  const deleteSelectedItems = async () => {
    if (selectedItems.size === 0) return;
    
    setDeleting(true);
    try {
      const itemIds = Array.from(selectedItems);
      
      // Delete from database
      const { error } = await supabase
        .from('items')
        .delete()
        .in('id', itemIds);

      if (error) throw error;

      // Update local state
      setItems(prev => prev.filter(item => !selectedItems.has(item.id)));
      setSelectedItems(new Set());
      setIsSelectionMode(false);

      toast({
        title: 'Items deleted',
        description: `Successfully deleted ${itemIds.length} item${itemIds.length > 1 ? 's' : ''}`,
      });
    } catch (error: any) {
      toast({
        title: 'Delete failed',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setDeleting(false);
    }
  };

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
          {isSelectionMode ? (
            <div className="flex items-center gap-2">
              <Button
                onClick={selectAllItems}
                disabled={selectedItems.size === items.length}
                variant="outline"
                size="sm"
              >
                Select All
              </Button>
              <Button
                onClick={clearSelection}
                disabled={selectedItems.size === 0}
                variant="outline" 
                size="sm"
              >
                Clear
              </Button>
              <Button
                onClick={deleteSelectedItems}
                disabled={selectedItems.size === 0 || deleting}
                variant="destructive"
                size="sm"
                className="flex items-center gap-2"
              >
                {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Delete {selectedItems.size > 0 ? `(${selectedItems.size})` : ''}
              </Button>
              <Button
                onClick={toggleSelectionMode}
                variant="outline"
                size="sm"
              >
                <X className="w-4 h-4" />
                Cancel
              </Button>
            </div>
          ) : (
            <>
              <Button
                onClick={toggleSelectionMode}
                disabled={items.length === 0}
                variant="outline"
                className="flex items-center gap-2"
              >
                <CheckSquare className="w-4 h-4" />
                Select
              </Button>
              <Button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading || yolosAnalyzing}
                className="flex items-center gap-2"
              >
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {uploading ? 'Uploading...' : 'Add Item'}
              </Button>
            </>
          )}
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
              {isSelectionMode ? (
                <Card className={`overflow-hidden transition-all cursor-pointer ${
                  selectedItems.has(item.id) ? 'ring-2 ring-primary shadow-lg' : 'hover:shadow-lg'
                }`} onClick={() => toggleItemSelection(item.id)}>
                  <div className="aspect-square relative">
                    {processing.has(item.id) && (
                      <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-10 rounded-t-lg">
                        <Loader2 className="h-8 w-8 animate-spin text-white" />
                      </div>
                    )}
                    <SmartCropImg 
                      src={signedUrls[item.image_path] || supabase.storage.from('sila').getPublicUrl(item.image_path).data.publicUrl}
                      bbox={toBBox(item.bbox) ? [toBBox(item.bbox)!.xmin, toBBox(item.bbox)!.ymin, toBBox(item.bbox)!.xmax, toBBox(item.bbox)!.ymax] : null}
                      aspect={1}
                      pad={0.08}
                      label={item.subcategory || item.category || ""}
                      alt={item.title || 'Closet item'}
                      className="w-full rounded-xl shadow-sm"
                    />
                    <div className="absolute top-2 right-2 bg-background/80 rounded-full p-1">
                      {selectedItems.has(item.id) ? (
                        <CheckSquare className="w-5 h-5 text-primary" />
                      ) : (
                        <Square className="w-5 h-5 text-muted-foreground" />
                      )}
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
              ) : (
                <Link to={`/item/${item.id}`} className="block">
                  <Card className="overflow-hidden hover:shadow-lg transition-shadow">
                  <div className="aspect-square relative">
                    {processing.has(item.id) && (
                      <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-10 rounded-t-lg">
                        <Loader2 className="h-8 w-8 animate-spin text-white" />
                      </div>
                    )}
                    <SmartCropImg 
                      src={signedUrls[item.image_path] || supabase.storage.from('sila').getPublicUrl(item.image_path).data.publicUrl}
                      bbox={toBBox(item.bbox) ? [toBBox(item.bbox)!.xmin, toBBox(item.bbox)!.ymin, toBBox(item.bbox)!.xmax, toBBox(item.bbox)!.ymax] : null}
                      aspect={1}
                      pad={0.08}
                      label={item.subcategory || item.category || ""}
                      alt={item.title || 'Closet item'}
                      className="w-full rounded-xl shadow-sm"
                    />
                      <div className="absolute top-2 right-2">
                        {/* Removed retry processing dropdown since items-process is no longer available */}
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
              )}
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