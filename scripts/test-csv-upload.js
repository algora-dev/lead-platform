// Test CSV upload against local dev server (with auth)
const fs = require('fs');

async function test() {
  // Login first
  const loginRes = await fetch('http://localhost:3001/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'info@t3play.com', password: 'admintest' }),
  });
  
  if (!loginRes.ok) {
    console.error('Login failed:', loginRes.status, await loginRes.text());
    return;
  }
  
  const setCookie = loginRes.headers.get('set-cookie');
  if (!setCookie) {
    console.error('No cookie returned');
    return;
  }
  
  // Extract cookie
  const cookie = setCookie.split(';')[0];
  console.log('Auth cookie:', cookie.substring(0, 30) + '...');
  
  // Read CSV
  const csvContent = fs.readFileSync('test-upload.csv', 'utf-8');
  
  // Upload
  const formData = new FormData();
  const blob = new Blob([csvContent], { type: 'text/csv' });
  formData.append('file', blob, 'test-upload.csv');
  formData.append('profileId', '2');
  formData.append('batchName', 'CSV Test - Construction July');
  
  const r = await fetch('http://localhost:3001/api/csv-upload', {
    method: 'POST',
    body: formData,
    headers: { Cookie: cookie },
  });
  
  const d = await r.json();
  console.log(JSON.stringify(d, null, 2));
}

test().catch(e => console.error(e));
