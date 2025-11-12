# Frontend Authentication Guide

## Problem
The following API endpoints are returning 401 Unauthorized errors:
- `GET /api/birds/stats`
- `GET /api/feed/stats` 
- `GET /api/eggs/stats`
- `GET /api/reports/dashboard`

## Root Cause
These endpoints require authentication, but the frontend `dataService.ts` is not sending the required authentication headers.

## Solution

### 1. Authentication Flow

#### Step 1: Login to get a token
```javascript
// Login request
const loginResponse = await fetch('http://localhost:3000/api/auth/login', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    email: 'user@example.com',
    password: 'password'
  })
});

const { token, user } = await loginResponse.json();

// Store the token for future requests
localStorage.setItem('authToken', token);
```

#### Step 2: Include token in API requests
```javascript
// Get stored token
const token = localStorage.getItem('authToken');

// Make authenticated requests
const response = await fetch('http://localhost:3000/api/birds/stats', {
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
});
```

### 2. Update dataService.ts

Your `dataService.ts` file should be updated to include authentication headers:

```javascript
class DataService {
  private getAuthHeaders() {
    const token = localStorage.getItem('authToken');
    return {
      'Content-Type': 'application/json',
      ...(token && { 'Authorization': `Bearer ${token}` })
    };
  }

  async getBirdsStats() {
    const response = await fetch('http://localhost:3000/api/birds/stats', {
      method: 'GET',
      headers: this.getAuthHeaders()
    });
    
    if (!response.ok) {
      if (response.status === 401) {
        // Token expired or invalid - redirect to login
        this.handleAuthError();
        return;
      }
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    return response.json();
  }

  async getFeedStats() {
    const response = await fetch('http://localhost:3000/api/feed/stats', {
      method: 'GET',
      headers: this.getAuthHeaders()
    });
    
    if (!response.ok) {
      if (response.status === 401) {
        this.handleAuthError();
        return;
      }
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    return response.json();
  }

  async getEggsStats() {
    const response = await fetch('http://localhost:3000/api/eggs/stats', {
      method: 'GET',
      headers: this.getAuthHeaders()
    });
    
    if (!response.ok) {
      if (response.status === 401) {
        this.handleAuthError();
        return;
      }
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    return response.json();
  }

  async getReportsDashboard() {
    const response = await fetch('http://localhost:3000/api/reports/dashboard', {
      method: 'GET',
      headers: this.getAuthHeaders()
    });
    
    if (!response.ok) {
      if (response.status === 401) {
        this.handleAuthError();
        return;
      }
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    return response.json();
  }

  private handleAuthError() {
    // Clear invalid token
    localStorage.removeItem('authToken');
    // Redirect to login page
    window.location.href = '/login';
  }
}
```

### 3. Token Verification

You can verify if a token is still valid using:

```javascript
async function verifyToken(token) {
  try {
    const response = await fetch(`http://localhost:3000/api/auth/verify-token?token=${token}`);
    return response.ok;
  } catch (error) {
    return false;
  }
}
```

### 4. Error Handling

Always handle 401 errors properly:
- Clear the stored token
- Redirect user to login page
- Show appropriate error message

## Testing

After implementing these changes:
1. Login through your frontend
2. Verify the token is stored in localStorage
3. Make API calls to the stats endpoints
4. Confirm they return data instead of 401 errors

## Backend Endpoints Status

✅ All authentication endpoints are working correctly:
- `/api/auth/login` - Returns JWT token
- `/api/auth/verify-token` - Validates tokens
- Protected endpoints require `Authorization: Bearer <token>` header

✅ All stats endpoints are properly protected:
- `/api/birds/stats` - Returns 401 without auth
- `/api/feed/stats` - Returns 401 without auth  
- `/api/eggs/stats` - Returns 401 without auth
- `/api/reports/dashboard` - Returns 401 without auth

The backend is working correctly. The frontend needs to be updated to include authentication headers.