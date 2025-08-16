import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { batchCreateSignedUrls } from '@/lib/storage';
import { waitUntilPublic, detectYolosByUrl } from '@/lib/yolos';
import SmartCropImg from '@/components/SmartCropImg';
import DetectionsOverlay from '@/components/DetectionsOverlay';
import ItemCard from '@/components/ItemCard';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Upload, Loader2, Trash2, X, Square, CheckSquare, Eye, EyeOff } from 'lucide-react';

interface Item {
  id: string;
  title?: string;
  category?: string;
  subcategory?: string;
  color_name?: string;
  color_hex?: string;
  image_path: string;
  created_at: string;
  yolos_top_labels?: string[];
  bbox?: number[] | null;
}

interface UploadingItem {
  id: string;
  file: File;
  preview: string;
  status: 'uploading' | 'analyzing';
  title?: string;
}

interface ClosetProps {
  user: any;
}

// Types for YOLOS detections
type YolosBox = { xmin: number; ymin: number; xmax: number; ymax: number };
type YolosPred = { label: string; score: number; box: YolosBox };
type DetectionsMap = Map<string, YolosPred[]>;

// Helper to convert bbox to number array for persistence
function asBboxArray(b: any): number[] | null {
  if (!b) return null;

  if (Array.isArray(b) && b.length === 4) {
    const arr = b.map((n) => Number(n));
    return arr.every((n) => Number.isFinite(n)) ? arr as number[] : null;
  }

  if (typeof b === "object" && b !== null) {
    const maybe = [b.xmin, b.ymin, b.xmax, b.ymax].map((n) => Number(n));
    return maybe.every((n) => Number.isFinite(n)) ? (maybe as number[]) : null;
  }

  return null;
}

// Helper to process edge function response
function processEdgeResponse(res: any) {
  const pretty = (s?: string | null) => s ? s.trim() : null;

  return {
    title: pretty(res.proposedTitle) || 'Item',
    category: pretty(res.category),
    subcategory: null, // Always null after upload - user sets later
    color_name: pretty(res.colorName),
    color_hex: pretty(res.colorHex), 
    bbox: res.bbox || null, // Normalized array from edge
    yolos_latency_ms: res.latencyMs ?? null,
    yolos_model: res.model ?? null,
  };
}

export default function Closet({ user }: ClosetProps) {
  const [items, setItems] = useState<Item[]>([]);
  const [uploadingItems, setUploadingItems] = useState<UploadingItem[]>([]);
  const [signedUrls, setSignedUrls] = useState<{ [path: string]: string }>({});
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [debugDetections, setDebugDetections] = useState(false);
  const [detections, setDetections] = useState<DetectionsMap>(new Map());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    loadItems();
    // Load debug toggle from localStorage
    const saved = localStorage.getItem('sila.debugDetections');
    if (saved === 'true') setDebugDetections(true);
  }, []);

  const setItemDetections = (itemId: string, preds: YolosPred[]) => {
    setDetections(prev => {
      const next = new Map(prev);
      next.set(itemId, preds);
      return next;
    });
  };

  const toggleDebugDetections = () => {
    const newState = !debugDetections;
    setDebugDetections(newState);
    localStorage.setItem('sila.debugDetections', newState ? 'true' : 'false');
  };

  const loadItems = async () => {
    try {
      const { data, error } = await supabase
        .from('items')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      const itemsData = data || [];
      setItems(itemsData);

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

    // Create preview URL
    const preview = URL.createObjectURL(file);
    const uploadingId = crypto.randomUUID();
    
    // Add to uploading items immediately (in grid position)
    const uploadingItem: UploadingItem = {
      id: uploadingId,
      file,
      preview,
      status: 'uploading',
      title: file.name.replace(/\.[^/.]+$/, "")
    };
    
    setUploadingItems(prev => [uploadingItem, ...prev]);
    
    try {
      console.log('[YOLOS] Starting upload:', file.name);
      
      // Upload to storage
      const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
      const objectId = crypto.randomUUID();
      const imagePath = `${user.id}/items/${objectId}.${ext}`;
      
      const { error: upErr } = await supabase.storage.from('sila').upload(imagePath, file, {
        contentType: file.type || `image/${ext}`,
        upsert: true
      });
      
      if (upErr) throw upErr;
      
      // Create DB row with proper auth check
      const { data: { user: authUser }, error: userErr } = await supabase.auth.getUser();
      if (userErr || !authUser) {
        throw new Error("Not authenticated");
      }

      const { data: itemRow, error: insertErr } = await supabase
        .from("items")
        .insert({
          owner: authUser.id,
          title: "Uploading…",
          image_path: imagePath,
          category: null,
          color_name: null,
          color_hex: null,
        })
        .select()
        .single();

      if (insertErr) {
        console.error("Insert failed", insertErr);
        throw insertErr;
      }
      
      const itemId = itemRow.id;
      
      // Update status to analyzing
      setUploadingItems(prev => 
        prev.map(item => 
          item.id === uploadingId 
            ? { ...item, status: 'analyzing' as const }
            : item
        )
      );
      
      // Get public URL and wait until it's accessible
      const { data: pub } = supabase.storage.from('sila').getPublicUrl(imagePath);
      const publicUrl = pub.publicUrl;
      console.info('[FLOW] have path', imagePath);
      console.info('[FLOW] publicUrl', publicUrl);
      
      await waitUntilPublic(publicUrl);
      
      console.info('[YOLOS] invoking', { publicUrl, threshold: 0.12 });
      const yolos = await detectYolosByUrl(publicUrl, 0.12);
      console.info('[YOLOS] result', yolos);
      
      // Store detections in memory for overlay
      if (yolos.status === 'success' && Array.isArray(yolos.result)) {
        const preds: YolosPred[] = yolos.result
          .filter((p: any) => p?.box && typeof p?.score === 'number' && p?.label)
          .sort((a: any, b: any) => b.score - a.score)
          .slice(0, 3)
          .map((p: any) => ({ 
            label: String(p.label), 
            score: Number(p.score), 
            box: p.box 
          }));
        setItemDetections(itemId, preds);
      }
      
      // Process edge response - this is the single source of truth
      const updatePayload = processEdgeResponse(yolos);
      console.info('[YOLOS] persist', updatePayload);

      const { error: updateErr } = await supabase
        .from('items')
        .update(updatePayload)
        .eq('id', itemId);
        
      if (updateErr) {
        console.error('[YOLOS] Persist failed:', updateErr);
        toast({
          title: 'Save failed',
          description: updateErr.message,
          variant: 'destructive'
        });
      } else {
        console.info('[YOLOS] OK');
        toast({
          title: 'Analysis complete',
          description: `Detected: ${updatePayload.category || 'item'}, Color: ${updatePayload.color_name || 'unknown'}`
        });
      }
      
      // Remove from uploading and refresh items
      setUploadingItems(prev => prev.filter(item => item.id !== uploadingId));
      await loadItems();
      
    } catch (error: any) {
      console.error('[YOLOS] Upload failed:', error);
      setUploadingItems(prev => prev.filter(item => item.id !== uploadingId));
      toast({
        title: 'Upload failed',
        description: error.message,
        variant: 'destructive'
      });
    }
    
    // Clean up preview URL
    URL.revokeObjectURL(preview);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

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
      
      const { error } = await supabase
        .from('items')
        .delete()
        .in('id', itemIds);

      if (error) throw error;

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

  const allItems = [...uploadingItems.map(u => ({ 
    ...u, 
    isUploading: true, 
    image_path: '', 
    created_at: new Date().toISOString(),
    yolos_top_labels: [],
    bbox: null,
    category: undefined,
    subcategory: undefined
  })), ...items.map(i => ({ ...i, isUploading: false }))];

  return (
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
              <Button onClick={selectAllItems} disabled={selectedItems.size === items.length} variant="outline" size="sm">
                Select All
              </Button>
              <Button onClick={clearSelection} disabled={selectedItems.size === 0} variant="outline" size="sm">
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
              <Button onClick={toggleSelectionMode} variant="outline" size="sm">
                <X className="w-4 h-4" />
                Cancel
              </Button>
            </div>
          ) : (
            <>
              <Button 
                onClick={toggleDebugDetections} 
                variant="outline" 
                size="sm"
                className="flex items-center gap-2"
              >
                {debugDetections ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                Debug: Detections
              </Button>
              <Button onClick={toggleSelectionMode} disabled={items.length === 0} variant="outline" className="flex items-center gap-2">
                <CheckSquare className="w-4 h-4" />
                Select
              </Button>
              <Button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2">
                <Upload className="w-4 h-4" />
                Add Item
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
        {allItems.map((item) => {
          const isUploading = 'isUploading' in item && item.isUploading;
          const uploadStatus = isUploading ? (item as any).status : null;
          const imageUrl = isUploading 
            ? (item as any).preview 
            : signedUrls[item.image_path] || supabase.storage.from('sila').getPublicUrl(item.image_path).data.publicUrl;

          return (
            <div key={item.id} className="relative group">
              {isUploading ? (
                <Card className="overflow-hidden">
                  <div className="aspect-square relative">
                    <div className="w-full h-full bg-muted rounded-t-lg flex items-center justify-center">
                      <div className="text-center">
                        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground mx-auto mb-2" />
                        <div className="text-xs text-muted-foreground px-2">
                          {uploadStatus === 'uploading' ? 'Uploading…' : 'Analyzing with YOLOS (Supabase)…'}
                        </div>
                      </div>
                    </div>
                  </div>
                  <CardContent className="p-4">
                    <h3 className="font-medium text-sm mb-2 line-clamp-2">{item.title || 'Untitled'}</h3>
                  </CardContent>
                </Card>
              ) : (
                <ItemCard
                  item={item}
                  imageUrl={imageUrl}
                  isSelectionMode={isSelectionMode}
                  isSelected={selectedItems.has(item.id)}
                  onToggleSelection={() => toggleItemSelection(item.id)}
                  debugDetections={debugDetections}
                  detectionPreds={detections.get(item.id)}
                />
              )}
            </div>
          );
        })}
      </div>

      {allItems.length === 0 && (
        <div className="text-center py-16">
          <div className="w-24 h-24 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
            <Upload className="w-12 h-12 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-medium mb-2">Your closet is empty</h3>
          <p className="text-muted-foreground mb-4">
            Start building your virtual wardrobe by uploading photos of your clothes
          </p>
          <Button onClick={() => fileInputRef.current?.click()}>
            Upload Your First Item
          </Button>
        </div>
      )}
    </div>
  );
}