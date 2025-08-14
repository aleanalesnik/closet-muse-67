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
}

interface ClosetProps {
  user: any;
}

export default function Closet({ user }: ClosetProps) {
  const [items, setItems] = useState<Item[]>([]);
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState<Set<string>>(new Set());
  const [signedUrls, setSignedUrls] = useState<{ [path: string]: string }>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

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

    setUploading(true);
    try {
      console.log("Starting upload for file:", file.name);
      const { itemId, fn } = await uploadAndProcessItem(file, file.name.split('.')[0]);
      console.log("Upload completed:", { itemId, fn });
      
      toast({
        title: fn?.ok !== false ? "Processing started" : "Uploaded",
        description: fn?.ok !== false ? "We're tagging your item…" : "We'll retry processing in the background."
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
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRetryProcessing = async (itemId: string, imagePath: string) => {
    setProcessing(prev => new Set([...prev, itemId]));
    
    try {
      const { data, error } = await supabase.functions.invoke("items-process", {
        body: { itemId, imagePath }
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
            disabled={uploading}
            className="flex items-center gap-2"
          >
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {uploading ? 'Uploading...' : 'Add Item'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
        {items.map((item) => (
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
                  <div className="text-xs text-muted-foreground">
                    Added {new Date(item.created_at).toLocaleDateString()}
                  </div>
                </CardContent>
              </Card>
            </Link>
          </div>
        ))}
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
  );
}