import React from 'react';
import { Link } from 'react-router-dom';
import SmartCropImg from './SmartCropImg';
import { Badge } from './ui/badge';
import { Card, CardContent } from './ui/card';
import { Square, CheckSquare } from 'lucide-react';

// Helper function to determine text color based on background
function getContrastColor(hexColor: string): string {
  const hex = hexColor.replace('#', '');
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);  
  const b = parseInt(hex.substr(4, 2), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? '#000000' : '#ffffff';
}


interface ItemCardProps {
  item: {
    id: string;
    title?: string;
    category?: string;
    subcategory?: string;
    bbox?: number[] | null;
    created_at: string;
    isUploading?: boolean;
    status?: 'uploading' | 'analyzing';
    color_name?: string;
    color_hex?: string;
  };
  imageUrl: string;
  isSelectionMode?: boolean;
  isSelected?: boolean;
  onToggleSelection?: () => void;
}

export default function ItemCard({ 
  item, 
  imageUrl, 
  isSelectionMode, 
  isSelected, 
  onToggleSelection
}: ItemCardProps) {
  const isUploading = item.isUploading;
  
  
  
  const cardContent = (
    <Card className={`overflow-hidden transition-all ${
      isSelectionMode 
        ? isSelected 
          ? 'ring-2 ring-primary shadow-lg cursor-pointer' 
          : 'hover:shadow-lg cursor-pointer'
        : 'hover:shadow-lg'
    }`} 
    onClick={isSelectionMode ? onToggleSelection : undefined}>
      <div
        className="relative overflow-hidden rounded-xl bg-white border"
        style={{ aspectRatio: "4 / 3" }}
      >
        <SmartCropImg
          src={imageUrl}
          bbox={item.bbox as any}
          className="w-full h-full rounded-xl bg-white"
          mode="fit"
          paddingPct={0.08}
        />
        
        {isSelectionMode && (
          <div className="absolute top-2 right-2 bg-background/80 rounded-full p-1">
            {isSelected ? (
              <CheckSquare className="w-5 h-5 text-primary" />
            ) : (
              <Square className="w-5 h-5 text-muted-foreground" />
            )}
          </div>
        )}
      </div>
      
      <CardContent className="p-3 sm:p-4">
        <h3 className="font-medium text-xs sm:text-sm mb-2 line-clamp-2 leading-tight break-words">{item.title || 'Untitled'}</h3>
        <div className="flex flex-wrap gap-1 mb-2">
          {item.color_name && item.color_hex && (
            <Badge 
              variant="outline" 
              className="text-xs px-1.5 py-0.5 h-auto leading-none border"
              style={{ 
                backgroundColor: item.color_hex,
                color: getContrastColor(item.color_hex),
                borderColor: item.color_hex
              }}
            >
              {item.color_name}
            </Badge>
          )}
          {item.category && (
            <Badge variant="secondary" className="text-xs px-1.5 py-0.5 h-auto leading-none">
              {item.category}
            </Badge>
          )}
          {item.subcategory && (
            <Badge variant="outline" className="text-xs px-1.5 py-0.5 h-auto leading-none">
              {item.subcategory}
            </Badge>
          )}
        </div>
        <div className="text-xs text-muted-foreground truncate">
          Added {new Date(item.created_at).toLocaleDateString()}
        </div>
      </CardContent>
    </Card>
  );

  return isSelectionMode || isUploading ? (
    cardContent
  ) : (
    <Link to={`/item/${item.id}`} className="block">
      {cardContent}
    </Link>
  );
}