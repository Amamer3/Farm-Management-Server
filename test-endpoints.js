const axios = require('axios');

// Test the endpoints that are failing with 401 errors
async function testEndpoints() {
  const baseURL = 'http://localhost:3000/api';
  
  console.log('Testing endpoints without authentication...');
  
  const endpoints = [
    '/birds/stats',
    '/feed/stats', 
    '/eggs/stats',
    '/reports/dashboard'
  ];
  
  for (const endpoint of endpoints) {
    try {
      const response = await axios.get(`${baseURL}${endpoint}`);
      console.log(`✅ ${endpoint}: ${response.status} - ${response.statusText}`);
    } catch (error) {
      if (error.response) {
        console.log(`❌ ${endpoint}: ${error.response.status} - ${error.response.data.message || error.response.statusText}`);
      } else {
        console.log(`❌ ${endpoint}: ${error.message}`);
      }
    }
  }
  
  console.log('\nThese endpoints require authentication. The 401 errors are expected.');
  console.log('Frontend applications need to:');
  console.log('1. Login via /api/auth/login to get a token');
  console.log('2. Include Authorization: Bearer <token> header in requests');
  console.log('3. Handle token refresh when tokens expire');
}

testEndpoints().catch(console.error);