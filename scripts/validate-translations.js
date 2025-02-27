/**
 * Validates that all translation files contain the same keys as the primary English file
 * 
 * Usage: node validate-translations.js
 */

const fs = require('fs');
const path = require('path');

// Paths to localization files
const PRIMARY_FILE = path.join(__dirname, '../src/locales/en-US.json');
const TRANSLATION_FILES = [
  path.join(__dirname, '../src/locales/ru-RU.json'),
  path.join(__dirname, '../src/locales/zh-CN.json')
];

// Load the files
const primaryTranslations = JSON.parse(fs.readFileSync(PRIMARY_FILE, 'utf8'));

// Recursively collect all keys from an object
function collectKeys(obj, prefix = '') {
  let keys = [];
  
  for (const key in obj) {
    const currentKey = prefix ? `${prefix}.${key}` : key;
    
    if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
      // For nested objects, recursively collect keys
      keys = [...keys, ...collectKeys(obj[key], currentKey)];
    } else {
      // For leaf nodes (actual translations), add the key
      keys.push(currentKey);
    }
  }
  
  return keys;
}

// Check if a key exists in an object (handling nested paths)
function keyExists(obj, path) {
  const parts = path.split('.');
  let current = obj;
  
  for (const part of parts) {
    if (!current || typeof current !== 'object') {
      return false;
    }
    if (!(part in current)) {
      return false;
    }
    current = current[part];
  }
  
  return true;
}

// Validate a translation file against the primary file
function validateTranslationFile(filePath) {
  console.log(`Validating ${path.basename(filePath)}...`);
  
  try {
    const translations = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const primaryKeys = collectKeys(primaryTranslations);
    const missingKeys = [];
    
    // Check each key from the primary file
    for (const key of primaryKeys) {
      if (!keyExists(translations, key)) {
        missingKeys.push(key);
      }
    }
    
    if (missingKeys.length === 0) {
      console.log(`✅ All ${primaryKeys.length} keys are present in ${path.basename(filePath)}`);
      return true;
    } else {
      console.error(`❌ Found ${missingKeys.length} missing keys in ${path.basename(filePath)}:`);
      missingKeys.forEach(key => console.error(`  - ${key}`));
      return false;
    }
  } catch (error) {
    console.error(`Error validating ${path.basename(filePath)}: ${error.message}`);
    return false;
  }
}

// Validate all translation files
function validateAllTranslations() {
  let success = true;
  
  for (const file of TRANSLATION_FILES) {
    if (!validateTranslationFile(file)) {
      success = false;
    }
  }
  
  return success;
}

// Run validation
const result = validateAllTranslations();
process.exit(result ? 0 : 1);