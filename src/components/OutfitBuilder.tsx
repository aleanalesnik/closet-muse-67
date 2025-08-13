import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { Shirt, User, Save, Shuffle } from 'lucide-react';

interface Item {
  id: string;
  title?: string;
  category?: string;
  subcategory?: string;
  color_name?: string;
  color_hex?: string;
  image_path: string;
  mask_path?: string;
}

interface OutfitBuilderProps {
  user: any;
}

export default function OutfitBuilder({ user }: OutfitBuilderProps) {
  const [items, setItems] = useState<Item[]>([]);
  const [selectedItems, setSelectedItems] = useState<Item[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const { toast } = useToast();

  useEffect(() => {
    loadItems();
  }, []);

  const loadItems = async () => {
    try {
      const { data, error } = await supabase
        .from('items')
        .select('*')
        .not('category', 'is', null)
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

  const categories = [
    { id: 'all', label: 'All Items', icon: Shirt },
    { id: 'tops', label: 'Tops', icon: Shirt },
    { id: 'bottoms', label: 'Bottoms', icon: Shirt },
    { id: 'dresses', label: 'Dresses', icon: Shirt },
    { id: 'outerwear', label: 'Outerwear', icon: Shirt },
    { id: 'shoes', label: 'Shoes', icon: Shirt },
    { id: 'accessories', label: 'Accessories', icon: Shirt }
  ];

  const filteredItems = activeCategory === 'all' 
    ? items 
    : items.filter(item => 
        item.category?.toLowerCase().includes(activeCategory) ||
        item.subcategory?.toLowerCase().includes(activeCategory)
      );

  const toggleItemSelection = (item: Item) => {
    setSelectedItems(prev => {
      const exists = prev.find(selected => selected.id === item.id);
      if (exists) {
        return prev.filter(selected => selected.id !== item.id);
      } else {
        return [...prev, item];
      }
    });
  };

  const generateRandomOutfit = () => {
    if (items.length < 2) {
      toast({ 
        title: 'Not enough items', 
        description: 'Add more items to your closet to generate outfits',
        variant: 'destructive' 
      });
      return;
    }

    // Simple random selection - in a real app, you'd use ML for better combinations
    const shuffled = [...items].sort(() => 0.5 - Math.random());
    const outfit = shuffled.slice(0, Math.min(3, shuffled.length));
    setSelectedItems(outfit);
    
    toast({ title: 'Random outfit generated!' });
  };

  const saveOutfit = async () => {
    if (selectedItems.length === 0) {
      toast({ 
        title: 'No items selected', 
        description: 'Select items to save an outfit',
        variant: 'destructive' 
      });
      return;
    }

    // In a real app, you'd save to an outfits table
    toast({ 
      title: 'Outfit saved!', 
      description: `Saved outfit with ${selectedItems.length} items` 
    });
  };

  const clearOutfit = () => {
    setSelectedItems([]);
    toast({ title: 'Outfit cleared' });
  };

  const getImageUrl = (path: string) => {
    const { data } = supabase.storage.from('sila').getPublicUrl(path);
    return data.publicUrl;
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Outfit Builder</h1>
          <p className="text-muted-foreground mt-1">
            Create and save outfits from your closet
          </p>
        </div>
        
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            onClick={generateRandomOutfit}
            className="flex items-center gap-2"
          >
            <Shuffle className="w-4 h-4" />
            Random
          </Button>
          <Button 
            onClick={saveOutfit}
            disabled={selectedItems.length === 0}
            className="flex items-center gap-2"
          >
            <Save className="w-4 h-4" />
            Save Outfit
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Current Outfit */}
        <div className="lg:col-span-1 order-2 lg:order-1">
          <Card className="sticky top-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="w-5 h-5" />
                Current Outfit ({selectedItems.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {selectedItems.length > 0 ? (
                <div className="space-y-4">
                  {selectedItems.map((item) => (
                    <div key={item.id} className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-lg overflow-hidden bg-muted">
                        <img
                          src={getImageUrl(item.image_path)}
                          alt={item.title || 'Item'}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {item.title || 'Untitled'}
                        </p>
                        <div className="flex gap-1 mt-1">
                          {item.category && (
                            <Badge variant="secondary" className="text-xs">
                              {item.category}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                  
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="w-full"
                    onClick={clearOutfit}
                  >
                    Clear All
                  </Button>
                </div>
              ) : (
                <div className="text-center py-8">
                  <User className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">
                    Select items to build your outfit
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Item Selection */}
        <div className="lg:col-span-3 order-1 lg:order-2">
          <Tabs value={activeCategory} onValueChange={setActiveCategory}>
            <TabsList className="grid grid-cols-4 lg:grid-cols-7 mb-6">
              {categories.map((category) => (
                <TabsTrigger key={category.id} value={category.id} className="text-xs">
                  {category.label}
                </TabsTrigger>
              ))}
            </TabsList>

            <TabsContent value={activeCategory}>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {filteredItems.map((item) => {
                  const isSelected = selectedItems.some(selected => selected.id === item.id);
                  
                  return (
                    <Card
                      key={item.id}
                      className={`cursor-pointer transition-all ${
                        isSelected 
                          ? 'ring-2 ring-primary shadow-lg' 
                          : 'hover:shadow-md'
                      }`}
                      onClick={() => toggleItemSelection(item)}
                    >
                      <CardContent className="p-0">
                        <div className="aspect-square relative overflow-hidden rounded-t-lg bg-muted">
                          <img
                            src={getImageUrl(item.image_path)}
                            alt={item.title || 'Item'}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                          {isSelected && (
                            <div className="absolute top-2 right-2 w-6 h-6 bg-primary rounded-full flex items-center justify-center">
                              <div className="w-3 h-3 bg-white rounded-full" />
                            </div>
                          )}
                        </div>
                        
                        <div className="p-3">
                          <p className="font-medium text-sm mb-1 truncate">
                            {item.title || 'Untitled'}
                          </p>
                          
                          <div className="flex flex-wrap gap-1">
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
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>

              {filteredItems.length === 0 && (
                <div className="text-center py-12">
                  <Shirt className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium mb-2">
                    {activeCategory === 'all' ? 'No items found' : `No ${activeCategory} found`}
                  </h3>
                  <p className="text-muted-foreground">
                    Add more items to your closet to start building outfits
                  </p>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}