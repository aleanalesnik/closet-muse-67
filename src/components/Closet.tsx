import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Upload, Loader2 } from 'lucide-react';

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
      setItems(data || []);
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
      // Generate unique filename
      const fileExt = file.name.split('.').pop();
      const fileName = `${crypto.randomUUID()}.${fileExt}`;
      const filePath = `${user.id}/items/${fileName}`;

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from('sila')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // Create item record
      const { data: newItem, error: insertError } = await supabase
        .from('items')
        .insert({
          owner: user.id,
          image_path: filePath,
          title: file.name.split('.')[0]
        })
        .select()
        .single();

      if (insertError) throw insertError;

      // Add to local state
      setItems(prev => [newItem, ...prev]);
      setProcessing(prev => new Set([...prev, newItem.id]));

      // Process item in background
      await processItem(newItem.id, filePath);

      toast({ title: 'Item uploaded successfully!' });
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

  const processItem = async (itemId: string, imagePath: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('items-process', {
        body: { itemId, imagePath }
      });

      if (error) throw error;

      // Refresh the item data
      const { data: updatedItem, error: fetchError } = await supabase
        .from('items')
        .select('*')
        .eq('id', itemId)
        .single();

      if (fetchError) throw fetchError;

      // Update local state
      setItems(prev => 
        prev.map(item => item.id === itemId ? updatedItem : item)
      );

      toast({ title: 'Item processed successfully!' });
    } catch (error: any) {
      toast({ 
        title: 'Processing failed', 
        description: error.message,
        variant: 'destructive' 
      });
    } finally {
      setProcessing(prev => {
        const newSet = new Set(prev);
        newSet.delete(itemId);
        return newSet;
      });
    }
  };

  const getImageUrl = (path: string) => {
    const { data } = supabase.storage.from('sila').getPublicUrl(path);
    return data.publicUrl;
  };

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
          <Card key={item.id} className="group hover:shadow-lg transition-shadow">
            <CardContent className="p-0">
              <div className="aspect-square relative overflow-hidden rounded-t-lg bg-muted">
                <img
                  src={getImageUrl(item.image_path)}
                  alt={item.title || 'Closet item'}
                  className="w-full h-full object-cover transition-transform group-hover:scale-105"
                  loading="lazy"
                />
                {processing.has(item.id) && (
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                    <div className="text-white text-center">
                      <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                      <p className="text-sm">Processing...</p>
                    </div>
                  </div>
                )}
              </div>
              
              <div className="p-4">
                <h3 className="font-medium text-sm mb-2 truncate">
                  {item.title || 'Untitled'}
                </h3>
                
                <div className="flex flex-wrap gap-1 mb-2">
                  {item.category && (
                    <Badge variant="secondary" className="text-xs">
                      {item.category}
                    </Badge>
                  )}
                  {item.color_name && (
                    <Badge 
                      variant="outline" 
                      className="text-xs"
                      style={{ 
                        borderColor: item.color_hex,
                        color: item.color_hex 
                      }}
                    >
                      {item.color_name}
                    </Badge>
                  )}
                </div>
                
                {item.notes && (
                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {item.notes}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
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