import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import SmartCropImg from './SmartCropImg';
import DetectionsOverlay from './DetectionsOverlay';
import { Badge } from './ui/badge';
import { Card, CardContent } from './ui/card';
import { Square, CheckSquare } from 'lucide-react';

type YolosBox = { xmin: number; ymin: number; xmax: number; ymax: number };
type YolosPred = { label: string; score: number; box: YolosBox };

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
  };
  imageUrl: string;
  isSelectionMode?: boolean;
  isSelected?: boolean;
  onToggleSelection?: () => void;
  debugDetections?: boolean;
  detectionPreds?: YolosPred[];
}

export default function ItemCard({ 
  item, 
  imageUrl, 
  isSelectionMode, 
  isSelected, 
  onToggleSelection,
  debugDetections,
  detectionPreds
}: ItemCardProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({
    naturalWidth: 0,
    naturalHeight: 0,
    renderedWidth: 0,
    renderedHeight: 0
  });

  useEffect(() => {
    const img = imgRef.current;
    const container = containerRef.current;
    if (!img || !container) {
      console.log('[DEBUG ItemCard] Missing refs for item:', item.id, { hasImg: !!img, hasContainer: !!container });
      return;
    }

    const updateDimensions = () => {
      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        console.log('[DEBUG ItemCard] Updating dimensions for item:', item.id, {
          natural: `${img.naturalWidth}x${img.naturalHeight}`,
          rendered: `${container.clientWidth}x${container.clientHeight}`
        });
        setDimensions({
          naturalWidth: img.naturalWidth,
          naturalHeight: img.naturalHeight,
          renderedWidth: container.clientWidth,
          renderedHeight: container.clientHeight
        });
      } else {
        console.log('[DEBUG ItemCard] Image not ready for dimensions:', item.id, {
          naturalWidth: img.naturalWidth,
          naturalHeight: img.naturalHeight,
          complete: img.complete
        });
      }
    };

    const handleLoad = () => {
      console.log('[DEBUG ItemCard] Image load event for item:', item.id);
      // Add a small delay to ensure container has rendered
      setTimeout(updateDimensions, 50);
    };
    
    const handleResize = () => updateDimensions();
    
    img.addEventListener('load', handleLoad);
    window.addEventListener('resize', handleResize);
    
    if (img.complete && img.naturalWidth > 0) {
      console.log('[DEBUG ItemCard] Image already loaded for item:', item.id);
      handleLoad();
    }
    
    return () => {
      img.removeEventListener('load', handleLoad);
      window.removeEventListener('resize', handleResize);
    };
  }, [imageUrl, item.id]);

  const isUploading = item.isUploading;
  // Only show overlay when explicitly requested (debug mode) or during upload
  // For completed items, only show when debug mode is on
  const showOverlay = detectionPreds && detectionPreds.length > 0 && (
    debugDetections || (isUploading && item.status === 'analyzing')
  );
  
  console.log('[DEBUG ItemCard] Item:', item.id, 'debugDetections:', debugDetections, 'isUploading:', isUploading, 'status:', item.status, 'detectionPreds:', detectionPreds, 'showOverlay:', showOverlay);

  const cardContent = (
    <Card className={`overflow-hidden transition-all ${
      isSelectionMode 
        ? isSelected 
          ? 'ring-2 ring-primary shadow-lg cursor-pointer' 
          : 'hover:shadow-lg cursor-pointer'
        : 'hover:shadow-lg'
    }`} 
    onClick={isSelectionMode ? onToggleSelection : undefined}>
      <div ref={containerRef} className="aspect-square relative">
        <SmartCropImg 
          ref={imgRef}
          src={imageUrl}
          bbox={item.bbox as any}
          alt={item.title || 'Closet item'}
          className="aspect-square rounded-xl"
          paddingPct={0.1}
        />
        
        {showOverlay && (
          <DetectionsOverlay
            preds={detectionPreds}
            naturalWidth={dimensions.naturalWidth}
            naturalHeight={dimensions.naturalHeight}
            renderedWidth={dimensions.renderedWidth}
            renderedHeight={dimensions.renderedHeight}
          />
        )}
        
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
        </div>
        <div className="text-xs text-muted-foreground">
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