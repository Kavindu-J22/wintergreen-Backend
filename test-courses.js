const http = require('http');

// Test courses endpoint without authentication (should return 401)
const options = {
  hostname: 'localhost',
  port: 5000,
  path: '/api/courses',
  method: 'GET'
};

const req = http.request(options, (res) => {
  console.log(`Status: ${res.statusCode}`);
  console.log(`Headers: ${JSON.stringify(res.headers)}`);
  
  res.setEncoding('utf8');
  res.on('data', (chunk) => {
    console.log(`Body: ${chunk}`);
  });
  
  res.on('end', () => {
    console.log('Response ended');
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
