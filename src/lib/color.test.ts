// src/lib/color.test.ts
// Simple test runner without external dependencies
import { snapToPalette, getDominantColor, PALETTE } from './color.js';

// Simple test cases - run with: node -e "import('./color.test.js')"
const tests = [
  // Basic color tests
  { name: 'Pure white', input: { r: 255, g: 255, b: 255 }, expected: 'White' },
  { name: 'Pure black', input: { r: 0, g: 0, b: 0 }, expected: 'Black' },
  { name: 'Mid-tone grey', input: { r: 128, g: 128, b: 128 }, expected: 'Grey' },
  
  // Problematic classifications
  { name: 'Bright yellow (not beige/white)', input: { r: 255, g: 255, b: 0 }, expected: 'Yellow' },
  { name: 'Pale yellow (not white)', input: { r: 255, g: 255, b: 200 }, expected: 'Yellow' },
  { name: 'Bright red', input: { r: 255, g: 0, b: 0 }, expected: 'Red' },
  { name: 'Dark red (maroon)', input: { r: 80, g: 0, b: 0 }, expected: 'Maroon' },
  { name: 'Bright pink (not grey)', input: { r: 255, g: 105, b: 180 }, expected: 'Pink' },
  { name: 'Purple (not grey/brown)', input: { r: 128, g: 0, b: 128 }, expected: 'Purple' },
  { name: 'Bright blue', input: { r: 0, g: 0, b: 255 }, expected: 'Blue' },
  { name: 'Dark blue (navy)', input: { r: 0, g: 0, b: 80 }, expected: 'Navy' },
  { name: 'Bright green (not brown/yellow/grey)', input: { r: 0, g: 255, b: 0 }, expected: 'Green' },
  { name: 'Orange', input: { r: 255, g: 165, b: 0 }, expected: 'Orange' },
  { name: 'Brown', input: { r: 139, g: 69, b: 19 }, expected: 'Brown' },
  { name: 'Beige', input: { r: 210, g: 180, b: 140 }, expected: 'Beige' },
  
  // Edge cases
  { name: 'Low saturation -> grey', input: { r: 100, g: 105, b: 110 }, expected: 'Grey' },
  { name: 'Very light -> white', input: { r: 250, g: 250, b: 250 }, expected: 'White' },
  { name: 'Very dark -> black', input: { r: 10, g: 10, b: 10 }, expected: 'Black' },
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