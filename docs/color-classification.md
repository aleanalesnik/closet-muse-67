# Color Classification System

## Overview

The color classification system automatically identifies and categorizes clothing items by their dominant color. This system is used throughout the app for:

- Item tagging and organization in the closet
- Color-based filtering and search
- Outfit coordination suggestions
- Visual consistency in the UI

## Palette Design

The system uses a fixed palette of 14 colors designed to represent the most common clothing colors:

| Color Name | Hex Code | RGB Values | Use Case |
|------------|----------|------------|----------|
| Black | #1A1A1A | (26, 26, 26) | Dark colors, formal wear |
| Grey | #808080 | (128, 128, 128) | Mid-tone neutrals, desaturated colors |
| White | #F8F8F8 | (248, 248, 248) | Light colors, shirts, undergarments |
| Beige | #D2B48C | (210, 180, 140) | Tan, khaki, nude tones |
| Brown | #8B4513 | (139, 69, 19) | Leather, earth tones |
| Purple | #8A2BE2 | (138, 43, 226) | Violet, lavender, plum |
| Blue | #4169E1 | (65, 105, 225) | Bright blues, royal blue |
| Navy | #2C3E50 | (44, 62, 80) | Dark blues, denim |
| Green | #228B22 | (34, 139, 34) | Forest green, emerald |
| Yellow | #FFD700 | (255, 215, 0) | Bright yellows, gold tones |
| Orange | #FF8C00 | (255, 140, 0) | Orange, amber |
| Pink | #FF69B4 | (255, 105, 180) | Pink, rose, magenta |
| Red | #DC143C | (220, 20, 60) | Bright reds, scarlet |
| Maroon | #800000 | (128, 0, 0) | Dark reds, burgundy |

### Palette Rationale

Each color in the palette represents a **mid-tone centroid** rather than an extreme value. This design choice ensures:

1. **Better coverage**: Mid-tone centroids capture a wider range of similar colors
2. **Reduced misclassification**: Avoids pulling garments toward neighboring categories
3. **Real-world accuracy**: Represents actual garment colors rather than pure digital colors

## Classification Logic

### Primary Algorithm

The classification process follows this hierarchy:

1. **Lightness extremes**: Very light (L > 95%) → White, Very dark (L < 5%) → Black
2. **Saturation analysis**: Low saturation (S < 10%) with moderate lightness → Grey
3. **Hue-based mapping**: For saturated colors, map by hue ranges
4. **LAB distance fallback**: Use perceptual color distance for edge cases

### HSL Heuristics

The system converts RGB values to HSL (Hue, Saturation, Lightness) to apply intelligent rules with improved thresholds:

```typescript
// Extreme lightness handling
if (hsl.l > COLOR_THRESHOLDS.lightnessWhite) return "White";    // 0.95
if (hsl.l < COLOR_THRESHOLDS.lightnessBlack) return "Black";    // 0.05

// Low saturation (achromatic) handling with improved boundaries
if (hsl.s < COLOR_THRESHOLDS.saturationGrey) {                  // 0.1
  if (hsl.l < COLOR_THRESHOLDS.lightnessGreyBlack) return "Black";  // 0.2
  if (hsl.l > COLOR_THRESHOLDS.lightnessGreyWhite) return "White";  // 0.9 (raised from 0.8)
  
  // Dark desaturated hue handling (NEW)
  const h = hsl.h;
  // Dark desaturated reds → Maroon
  if (redInRange && hsl.l <= COLOR_THRESHOLDS.lightnessMaroonMax) return "Maroon";
  // Dark desaturated blues → Navy  
  if (blueInRange && hsl.l <= COLOR_THRESHOLDS.lightnessNavyMax) return "Navy";
  // Warm mid-tone desaturated colors → Brown
  if (warmInRange && hsl.l > 0.2 && hsl.l < 0.9) return "Brown";
  
  return "Grey";
}

// Beige heuristic (NEW): Warm, light, low-to-moderate saturation
if (beigeInRange && hsl.l >= COLOR_THRESHOLDS.lightnessBeigeMin && 
    hsl.s < COLOR_THRESHOLDS.saturationHueMap) {
  return "Beige";
}
```

### Hue Range Mapping

For colors with sufficient saturation (S > 15%, lowered from 30%), the system uses hue ranges:

| Color | Hue Range (degrees) | Notes |
|-------|-------------------|-------|
| Red | 345-15 | Wraps around 0°, lightness < 30% → Maroon |  
| Orange | 15-45 | |
| Yellow | 45-75 | |
| Beige | 30-60 | Special case: warm + light + low saturation |
| Green | 75-165 | Wide range for various greens |
| Blue | 165-240 | Lightness < 30% → Navy |
| Purple | 240-290 | |
| Pink | 290-345 | Magentas and hot pinks |

### Dark Variant Detection

For red and blue hues, the system checks lightness to distinguish variants:

- **Red vs Maroon**: Red with L < 30% becomes Maroon
- **Blue vs Navy**: Blue with L < 30% becomes Navy

### LAB Distance Fallback

When hue-based mapping fails or for ambiguous cases, the system uses CIE LAB color space for perceptual distance calculation. This ensures colors are matched based on human visual perception rather than mathematical RGB distance.

## Configurable Constants

The color classification system uses centralized thresholds defined in `COLOR_THRESHOLDS`:

```typescript
export const COLOR_THRESHOLDS = {
  // Lightness boundaries
  lightnessWhite: 0.95,      // Above this = White
  lightnessBlack: 0.05,      // Below this = Black
  lightnessGreyWhite: 0.9,   // Grey vs White cutoff (raised from 0.8)
  lightnessGreyBlack: 0.2,   // Grey vs Black cutoff
  lightnessBeigeMin: 0.7,    // Minimum lightness for Beige
  lightnessMaroonMax: 0.3,   // Maximum lightness for Maroon
  lightnessNavyMax: 0.3,     // Maximum lightness for Navy
  
  // Saturation boundaries
  saturationGrey: 0.1,       // Below this = achromatic (grey/black/white)
  saturationHueMap: 0.15,    // Below this = no hue mapping (lowered from 0.3)
  
  // Hue ranges (in degrees)
  hueRanges: {
    Red: [345, 15],
    Orange: [15, 45], 
    Yellow: [45, 75],
    Beige: [30, 60],         // Warm low-sat tones
    Green: [75, 165],
    Blue: [165, 240],
    Purple: [240, 290],
    Pink: [290, 345],
  },
  
  // Special hue ranges for low-saturation handling
  lowSatHueRanges: {
    Red: [345, 15],          // For Maroon detection
    Blue: [165, 240],        // For Navy detection
    Warm: [20, 80],          // For Brown detection (orange/yellow/beige range)
  }
} as const;
```

### Key Improvements Made:

1. **Fixed Grey vs White Boundary**: Raised `lightnessGreyWhite` from 0.8 to 0.9 to prevent light grey items from being classified as White
2. **Improved Muted Color Detection**: Lowered `saturationHueMap` from 0.3 to 0.15 to capture denim blues, olive greens, and dusty pinks
3. **Added Beige Heuristic**: Warm, light colors (hue 30°-60°, lightness > 0.7) are now properly classified as Beige
4. **Enhanced Dark Desaturated Handling**: Low-saturation colors now use hue information to distinguish Maroon, Navy, and Brown from Grey
5. **Removed Redundant Hue Ranges**: Maroon and Navy are now derived from Red/Blue + lightness rather than separate hue ranges

## Implementation Details

### File Structure

- **`src/lib/color.ts`**: Primary color classification logic
- **`src/lib/aiMapping.ts`**: Imports and uses color functions for item processing
- **`src/lib/color.test.ts`**: Comprehensive unit tests

### Key Functions

1. **`getDominantColor(src: string, size: number): Promise<RGB>`**
   - Extracts dominant color from image
   - Ignores background and transparent pixels
   - Returns RGB object

2. **`snapToPalette(rgb: RGB): { name: string; hex: string }`**
   - Main classification function
   - Applies HSL heuristics and hue mapping
   - Returns palette entry with name and hex

3. **`rgbToHsl(rgb: RGB): { h: number; s: number; l: number }`**
   - Converts RGB to HSL color space
   - Used for saturation and lightness analysis

## Test Coverage

The test suite covers:

### Core Classifications
- Pure colors (red, blue, green, etc.)
- Neutral colors (black, white, grey)
- Dark variants (navy, maroon)

### Edge Cases
- Very light colors → White
- Very dark colors → Black
- Low saturation colors → Grey
- Pastel colors → Correct hue classification
- Boundary hues (red/pink, blue/purple)

### Regression Protection
- Yellow vs Beige/White misclassification
- Grey vs Brown confusion
- Pink vs Grey distinction
- Purple vs Grey/Brown issues

### Running Tests

```bash
npm test src/lib/color.test.ts
```

## Common Troubleshooting

### "Yellow items tagged as Beige"
- **Cause**: Original palette had very light Yellow (#FCD759)
- **Fix**: Updated to mid-tone gold (#FFD700) with better saturation detection

### "Grey items tagged as Brown"
- **Cause**: Original Grey was too light (#D9D9D9), pulling mid-greys toward Brown
- **Fix**: Updated to true mid-tone Grey (#808080)

### "Pink items appear as Grey"
- **Cause**: Low saturation pink falls below saturation threshold
- **Solution**: Adjust `saturationColorMinimum` or improve saturation calculation

## Updating the System

### Adding New Colors

1. Add entry to `PALETTE` array in `src/lib/color.ts`
2. Add hue range to `hueRanges` object in `snapToPalette`
3. Add test cases in `src/lib/color.test.ts`
4. Update this documentation

### Adjusting Thresholds

1. Modify constants in `snapToPalette` function
2. Run test suite to verify no regressions
3. Test with sample images to validate changes
4. Update documentation with new values

### Validation Checklist

Before deploying color system changes:

- [ ] All unit tests pass
- [ ] Manual testing with diverse clothing images
- [ ] No regressions in existing classifications
- [ ] Edge cases still handled correctly
- [ ] Performance impact assessed (if significant changes)

## Future Considerations

### Potential Improvements

1. **Data-driven palette refinement**: Use actual user image data to optimize palette centroids
2. **Machine learning classification**: Train model on labeled clothing color data
3. **Seasonal color adjustments**: Different palettes for fashion seasons
4. **User customization**: Allow users to override color classifications
5. **Multi-color detection**: Identify patterns, stripes, or dominant + accent colors

### Performance Optimization

- Cache dominant color results for uploaded images
- Optimize image analysis resolution based on image size
- Consider WebAssembly for color space conversions

### Integration Enhancements

- Color harmony suggestions for outfit building
- Brand-specific color mapping (e.g., "Navy" vs "Royal Blue")
- Accessibility considerations for color-blind users