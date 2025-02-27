const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Get the Git commit SHA
let gitCommitSha = '';
try {
  gitCommitSha = execSync('git rev-parse --short HEAD').toString().trim();
} catch (error) {
  console.error('Error getting Git commit SHA:', error.message);
  gitCommitSha = 'unknown';
}

// Create version info file
const versionInfo = {
  gitCommitSha
};

// Write to file
const outputPath = path.resolve(__dirname, '../src/env/version-info.js');
const fileContent = `// Auto-generated file. Do not edit.
export default ${JSON.stringify(versionInfo, null, 2)};
`;

fs.writeFileSync(outputPath, fileContent);
console.log(`Version info generated: ${outputPath}`);