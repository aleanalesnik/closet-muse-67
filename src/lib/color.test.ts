// src/lib/color.test.ts
// Simple test runner without external dependencies
import { snapToPalette, getDominantColor, PALETTE } from './color.js';

// Simple test cases - run with: node -e "import('./color.test.js')"
const tests = [
  // Basic color tests
  { name: 'Pure white', input: { r: 255, g: 255, b: 255 }, expected: 'White' },
  { name: 'Pure black', input: { r: 0, g: 0, b: 0 }, expected: 'Black' },
  { name: 'Mid-tone grey', input: { r: 128, g: 128, b: 128 }, expected: 'Grey' },
  
  // Issue 2: Light greys vs White boundary (raised from 0.8 to 0.9)
  { name: 'Light grey (not white)', input: { r: 211, g: 211, b: 211 }, expected: 'Grey' }, // #D3D3D3
  { name: 'Very light grey (borderline)', input: { r: 230, g: 230, b: 230 }, expected: 'Grey' },
  { name: 'Nearly white', input: { r: 248, g: 248, b: 248 }, expected: 'White' },
  
  // Problematic classifications (original tests)
  { name: 'Bright yellow (not beige/white)', input: { r: 255, g: 255, b: 0 }, expected: 'Yellow' },
  { name: 'Pale yellow (not white)', input: { r: 255, g: 255, b: 200 }, expected: 'Yellow' },
  { name: 'Bright red', input: { r: 255, g: 0, b: 0 }, expected: 'Red' },
  { name: 'Dark red (maroon)', input: { r: 80, g: 0, b: 0 }, expected: 'Maroon' },
  { name: 'Bright pink (not grey)', input: { r: 255, g: 105, b: 180 }, expected: 'Pink' },
  { name: 'Purple (not grey/brown)', input: { r: 128, g: 0, b: 128 }, expected: 'Purple' },
  { name: 'Bright blue', input: { r: 0, g: 0, b: 255 }, expected: 'Blue' },
  { name: 'Dark blue (navy)', input: { r: 0, g: 0, b: 80 }, expected: 'Navy' },
  
  // Issue 1: Muted colors (lowered saturation threshold to 0.15)
  { name: 'Denim blue (muted)', input: { r: 93, g: 109, b: 126 }, expected: 'Blue' },
  { name: 'Olive green (muted)', input: { r: 138, g: 154, b: 91 }, expected: 'Green' },
  { name: 'Dusty pink (muted)', input: { r: 197, g: 179, b: 188 }, expected: 'Pink' },
  { name: 'Sage green (muted)', input: { r: 156, g: 175, b: 136 }, expected: 'Green' },
  { name: 'Muted purple', input: { r: 128, g: 118, b: 135 }, expected: 'Purple' },
  
  // Issue 3: Beige heuristic (warm, light, low-to-moderate saturation)
  { name: 'Light beige', input: { r: 245, g: 222, b: 179 }, expected: 'Beige' }, // #F5DEB3
  { name: 'Warm beige', input: { r: 210, g: 180, b: 140 }, expected: 'Beige' },
  { name: 'Tan/beige', input: { r: 222, g: 184, b: 135 }, expected: 'Beige' },
  
  // Issue 4: Dark desaturated hues (Maroon, Navy, Brown)
  { name: 'Burgundy (desaturated maroon)', input: { r: 80, g: 60, b: 60 }, expected: 'Maroon' },
  { name: 'Dark navy (desaturated)', input: { r: 40, g: 45, b: 60 }, expected: 'Navy' },
  { name: 'Dark brown (desaturated warm)', input: { r: 80, g: 70, b: 50 }, expected: 'Brown' },
  { name: 'Charcoal grey (very dark, no hue)', input: { r: 50, g: 50, b: 50 }, expected: 'Grey' },
  
  // Existing tests (maintained for regression)
  { name: 'Bright green (not brown/yellow/grey)', input: { r: 0, g: 255, b: 0 }, expected: 'Green' },
  { name: 'Orange', input: { r: 255, g: 165, b: 0 }, expected: 'Orange' },
  { name: 'Brown', input: { r: 139, g: 69, b: 19 }, expected: 'Brown' },
  
  // Edge cases - saturation and lightness boundaries
  { name: 'Low saturation -> grey', input: { r: 100, g: 105, b: 110 }, expected: 'Grey' },
  { name: 'Very light -> white', input: { r: 250, g: 250, b: 250 }, expected: 'White' },
  { name: 'Very dark -> black', input: { r: 10, g: 10, b: 10 }, expected: 'Black' },
  
  // Additional edge cases for comprehensive coverage
  { name: 'Medium saturation orange', input: { r: 200, g: 150, b: 100 }, expected: 'Orange' },
  { name: 'Desaturated pink (not grey)', input: { r: 180, g: 160, b: 170 }, expected: 'Pink' },
  { name: 'Khaki (warm brown-beige)', input: { r: 160, g: 144, b: 120 }, expected: 'Brown' },
];

function runTests() {
  console.log('🎨 Running Color Classification Tests\n');
  
  let passed = 0;
  let failed = 0;
  
  tests.forEach((test, i) => {
    try {
      const result = snapToPalette(test.input);
      const success = result.name === test.expected;
      
      if (success) {
        console.log(`✅ ${test.name}: ${result.name}`);
        passed++;
      } else {
        console.log(`❌ ${test.name}: Expected ${test.expected}, got ${result.name}`);
        failed++;
      }
    } catch (error) {
      console.log(`💥 ${test.name}: Error - ${error.message}`);
      failed++;
    }
  });
  
  // Palette integrity check
  console.log('\n🔍 Checking Palette Integrity:');
  const expectedColors = [
    'Black', 'Grey', 'White', 'Beige', 'Brown', 
    'Purple', 'Blue', 'Navy', 'Green', 'Yellow', 
    'Orange', 'Pink', 'Red', 'Maroon'
  ];
  
  const actualColors = PALETTE.map(p => p.name);
  const missingColors = expectedColors.filter(c => !actualColors.includes(c));
  const extraColors = actualColors.filter(c => !expectedColors.includes(c));
  
  if (missingColors.length === 0 && extraColors.length === 0) {
    console.log('✅ All expected colors present');
    passed++;
  } else {
    console.log(`❌ Missing: ${missingColors.join(', ')}, Extra: ${extraColors.join(', ')}`);
    failed++;
  }
  
  // Hex format check
  const invalidHex = PALETTE.filter(c => !/^#[0-9A-F]{6}$/i.test(c.hex));
  if (invalidHex.length === 0) {
    console.log('✅ All hex colors valid');
    passed++;
  } else {
    console.log(`❌ Invalid hex colors: ${invalidHex.map(c => c.name).join(', ')}`);
    failed++;
  }
  
  console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);
  return failed === 0;
}

// Auto-run if imported
if (typeof window === 'undefined') {
  runTests();
}

export { runTests };