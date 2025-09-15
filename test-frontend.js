const http = require('http');

// Test if frontend is running
const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/',
  method: 'GET'
};

const req = http.request(options, (res) => {
  console.log(`Status: ${res.statusCode}`);
  console.log(`Headers: ${JSON.stringify(res.headers)}`);
  
  res.setEncoding('utf8');
  let body = '';
  res.on('data', (chunk) => {
    body += chunk;
  });
  
  res.on('end', () => {
    console.log(`Body length: ${body.length} characters`);
    console.log('Frontend is running!');
    process.exit(0);
  });
});

req.on('error', (e) => {
  console.error(`Problem with request: ${e.message}`);
  process.exit(1);
});

req.setTimeout(5000, () => {
  console.error('Request timeout');
  req.destroy();
  process.exit(1);
});

req.end();
