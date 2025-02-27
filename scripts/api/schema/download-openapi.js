const https = require('https');
const fs = require('fs');
const path = require('path');

const url = 'https://raw.githubusercontent.com/DMTF/Redfish-Publications/refs/heads/main/openapi/openapi.yaml';
const outputPath = path.join(__dirname, 'openapi.yaml');

// Create directory if it doesn't exist
const dir = path.dirname(outputPath);
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

// Download the file
https.get(url, (response) => {
  if (response.statusCode !== 200) {
    console.error(`Failed to download schema: ${response.statusCode} ${response.statusMessage}`);
    process.exit(1);
  }

  const file = fs.createWriteStream(outputPath);
  response.pipe(file);

  file.on('finish', () => {
    file.close();
    console.log('OpenAPI schema downloaded successfully');
  });
}).on('error', (err) => {
  console.error('Error downloading schema:', err.message);
  process.exit(1);
}); 