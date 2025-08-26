import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { batchCreateSignedUrls } from '@/lib/storage';
import { analyzeImage, normalizeBbox } from '@/lib/yolos';
import { getDominantColor, snapToPalette } from '@/lib/color';
import SmartCropImg from '@/components/SmartCropImg';
import ItemCard from '@/components/ItemCard';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Upload, Loader2, Trash2, X, Square, CheckSquare, MoreVertical } from 'lucide-react';

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
  yolos_result?: any[];  // Detection results
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


export default function Closet({ user }: ClosetProps) {
  const [items, setItems] = useState<Item[]>([]);
  const [uploadingItems, setUploadingItems] = useState<UploadingItem[]>([]);
  const [signedUrls, setSignedUrls] = useState<{ [path: string]: string }>({});
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const isMobile = useIsMobile();

  useEffect(() => {
    loadItems();
  }, []);

  const loadItems = async () => {
    try {
      const { data, error } = await supabase
        .from('items')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      const itemsData = (data || []).map(it => ({ ...it, bbox: normalizeBbox(it.bbox) }));
      // Debug: show the first few bboxes so you can tell if they're null/invalid
      console.info("[Closet] first few bboxes", itemsData.slice(0, 5).map(i => i.bbox));
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
    // Handle file upload
    if (!file) return;

    // Create preview URL
    const preview = URL.createObjectURL(file);
    const uploadingId = crypto.randomUUID();
    // Create preview and add to uploading items
    
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

      // Detect dominant color from the preview image
      let detectedColorName: string | null = null;
      let detectedColorHex: string | null = null;
      try {
        const rgb = await getDominantColor(preview);
        const snapped = snapToPalette(rgb);
        detectedColorName = snapped.name;
        detectedColorHex = snapped.hex;
      } catch (colorErr) {
        console.warn('Color detection failed', colorErr);
      }
      
      // Upload to storage
      const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
      const objectId = crypto.randomUUID();
      const imagePath = `${user.id}/items/${objectId}.${ext}`;
      
      
      const { error: upErr } = await supabase.storage.from('sila').upload(imagePath, file, {
        contentType: file.type || `image/${ext}`,
        upsert: true
      });
      
      
      if (upErr) throw upErr;
      
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
          color_name: detectedColorName,
          color_hex: detectedColorHex,
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
      
      console.info('[FLOW] have path', imagePath);
      
      console.info('[YOLOS] analyzing image with binary API');
      
      // Analyze image directly from file (no need to wait for public URL)
      const analysis = await analyzeImage(file);
      console.info('[YOLOS] analysis result', analysis);
      
      // Extract detail labels from YOLOS predictions
      const DETAIL_LABELS = new Set([
        "hood","collar","lapel","epaulette","sleeve","pocket","neckline","buckle","zipper",
        "applique","bead","bow","flower","fringe","ribbon","rivet","ruffle","sequin","tassel"
      ]);
      const details = analysis.yolosTopLabels?.filter(l => DETAIL_LABELS.has(l.toLowerCase())) ?? null;
      
      // Build payload using edge response directly 
      const payload = {
        title: analysis.proposedTitle ?? "Item",
        category: analysis.category,
        color_hex: analysis.colorHex ?? detectedColorHex,
        color_name: analysis.colorName ?? detectedColorName,
        bbox: analysis.bbox,
        details,
        yolos_top_labels: analysis.yolosTopLabels ?? null
      };
      console.info('[YOLOS] persist', payload);

      const { error: updateErr } = await supabase
        .from('items')
        .update(payload)
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
          description: `Detected: ${payload.category || 'item'}, Color: ${payload.color_name || 'unknown'}`
        });
      }
      
      // Remove from uploading and add to items directly instead of reloading
      setUploadingItems(prev => prev.filter(item => item.id !== uploadingId));
      
      // Add the new item to the items list directly to preserve detections
      const newItem = {
        id: itemId,
        ...payload,
        image_path: imagePath,
        created_at: new Date().toISOString(),
        // Make sure isUploading is false for completed items
        isUploading: false
      };
      setItems(prev => [newItem, ...prev]);
      
      // Generate signed URL for the new item
      try {
        const urls = await batchCreateSignedUrls([imagePath]);
        setSignedUrls(prev => ({ ...prev, ...urls }));
      } catch (urlError) {
        console.warn('Failed to generate signed URL:', urlError);
      }
      
      
    } catch (error: any) {
      console.error('[YOLOS] Upload failed:', error);
      setUploadingItems(prev => prev.filter(item => item.id !== uploadingId));
      
      // Provide user-friendly error messages based on error type
      let title = 'Upload failed';
      let description = 'Please try again.';
      
      const errorMessage = error.message || '';
      
      if (errorMessage.includes('503 Service Unavailable') || errorMessage.includes('service_unavailable')) {
        title = 'Service temporarily unavailable';
        description = 'The AI analysis service is temporarily down. Please try uploading your item again in a few minutes.';
      } else if (errorMessage.includes('service_error') || errorMessage.includes('HF error 50')) {
        title = 'Analysis service issues';
        description = 'The image analysis service is experiencing issues. Please try again later.';
      } else if (errorMessage.includes('Edge error 500')) {
        title = 'Processing error';
        description = 'There was an issue processing your image. Please try uploading it again.';
      } else if (errorMessage.includes('Not authenticated')) {
        title = 'Authentication required';
        description = 'Please sign in to upload items.';
      } else if (errorMessage.includes('Public URL never became readable')) {
        title = 'Upload incomplete';
        description = 'Your image is still being processed. Please wait a moment and try again.';
      }
      
      toast({
        title,
        description,
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
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 sm:mb-8">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground truncate">My Closet</h1>
          <p className="text-muted-foreground text-sm sm:text-base mt-1">
            {items.length} item{items.length !== 1 ? 's' : ''} in your collection
          </p>
        </div>
        
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileUpload}
          className="hidden"
        />
        
        {/* Mobile Layout */}
        {isMobile ? (
          <div className="flex items-center gap-2 flex-shrink-0">
            {isSelectionMode ? (
              <>
                <Button onClick={selectAllItems} disabled={selectedItems.size === items.length} variant="outline" size="sm">
                  All
                </Button>
                <Button onClick={clearSelection} disabled={selectedItems.size === 0} variant="outline" size="sm">
                  Clear
                </Button>
                <Button 
                  onClick={deleteSelectedItems} 
                  disabled={selectedItems.size === 0 || deleting} 
                  variant="destructive" 
                  size="sm"
                  className="flex items-center gap-1"
                >
                  {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  {selectedItems.size > 0 && `(${selectedItems.size})`}
                </Button>
                <Button onClick={toggleSelectionMode} variant="outline" size="sm">
                  <X className="w-4 h-4" />
                </Button>
              </>
            ) : (
              <>
                <Button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2">
                  <Upload className="w-4 h-4" />
                  Add Item
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="px-2">
                      <MoreVertical className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem onClick={toggleSelectionMode} disabled={items.length === 0}>
                      <CheckSquare className="w-4 h-4 mr-2" />
                      Select Items
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            )}
          </div>
        ) : (
          /* Desktop Layout */
          <div className="flex gap-3 flex-shrink-0">
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
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4 md:gap-6">
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
                  <div className="relative overflow-hidden rounded-xl bg-white border" style={{ aspectRatio: "4 / 3" }}>
                    <div className="w-full h-full bg-muted flex items-center justify-center">
                      <div className="text-center">
                        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground mx-auto mb-2" />
                        <div className="text-xs text-muted-foreground px-2">
                          {uploadStatus === 'uploading' ? 'Uploading…' : 'Analyzing with YOLOS (Supabase)…'}
                        </div>
                      </div>
                    </div>
                  </div>
                  <CardContent className="p-3 sm:p-4">
                    <div className="flex flex-wrap gap-1">
                      {/* Empty badges space to maintain consistent spacing */}
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <ItemCard
                  item={item}
                  imageUrl={imageUrl}
                  isSelectionMode={isSelectionMode}
                  isSelected={selectedItems.has(item.id)}
                  onToggleSelection={() => toggleItemSelection(item.id)}
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