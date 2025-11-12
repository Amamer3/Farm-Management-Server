# Firebase Service Account Setup Guide

This guide will help you set up Firebase Authentication and Firestore for the Farm Management API.

## Prerequisites

- Google account
- Access to Firebase Console
- Node.js and npm installed

## Step 1: Create a Firebase Project

1. Go to the [Firebase Console](https://console.firebase.google.com/)
2. Click "Add project" or "Create a project"
3. Enter your project name (e.g., "farm-management-system")
4. Choose whether to enable Google Analytics (optional)
5. Click "Create project"

## Step 2: Enable Authentication

1. In your Firebase project, go to "Authentication" in the left sidebar
2. Click "Get started"
3. Go to the "Sign-in method" tab
4. Enable the following sign-in providers:
   - Email/Password
   - Google (optional)
   - Any other providers you want to support

## Step 3: Set up Firestore Database

1. Go to "Firestore Database" in the left sidebar
2. Click "Create database"
3. Choose "Start in test mode" (you can configure security rules later)
4. Select a location for your database (choose the closest to your users)
5. Click "Done"

## Step 4: Create a Service Account

1. Go to "Project settings" (gear icon in the left sidebar)
2. Click on the "Service accounts" tab
3. Click "Generate new private key"
4. A JSON file will be downloaded - **keep this file secure!**

## Step 4.5: Grant Required Permissions to Service Account

**IMPORTANT**: The service account needs specific permissions to use Firebase Authentication APIs.

1. Go to [Google Cloud Console IAM & Admin](https://console.cloud.google.com/iam-admin/iam)
2. Select your project: `farm-management-system-6eb28` (or your project ID)
3. Find your service account (the email from the service account JSON file, e.g., `firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com`)
4. Click the pencil icon (Edit) next to the service account
5. Click "ADD ANOTHER ROLE"
6. Add the following role:
   - **Service Usage Consumer** (`roles/serviceusage.serviceUsageConsumer`)
7. Click "SAVE"

**Alternative**: If you prefer a custom role with minimal permissions:
- Create a custom role with the permission: `serviceusage.services.use`
- Assign this custom role to your service account

**Note**: It may take a few minutes for permissions to propagate after granting them.

## Step 5: Configure Environment Variables

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Open the downloaded service account JSON file and extract the following values:
   - `project_id` → `FIREBASE_PROJECT_ID`
   - `private_key_id` → `FIREBASE_PRIVATE_KEY_ID`
   - `private_key` → `FIREBASE_PRIVATE_KEY`
   - `client_email` → `FIREBASE_CLIENT_EMAIL`
   - `client_id` → `FIREBASE_CLIENT_ID`
   - `auth_uri` → `FIREBASE_AUTH_URI`
   - `token_uri` → `FIREBASE_TOKEN_URI`
   - `auth_provider_x509_cert_url` → `FIREBASE_AUTH_PROVIDER_X509_CERT_URL`
   - `client_x509_cert_url` → `FIREBASE_CLIENT_X509_CERT_URL`

3. Update your `.env` file with these values

## Step 6: Set up Firestore Security Rules

Replace the default Firestore rules with the following:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users can read/write their own user document
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    
    // Authenticated users can read/write collections, birds, feed, medicine
    match /{collection=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

## Step 7: Initialize Sample Data (Optional)

You can create some sample collections in Firestore:

### Collections to create:
- `users` - User profiles
- `birds` - Bird inventory
- `eggCollections` - Daily egg collection records
- `feedInventory` - Feed stock management
- `medicineInventory` - Medicine stock management
- `auditLogs` - System audit trails

### Sample user document structure:
```json
{
  "uid": "user-id-from-auth",
  "email": "user@example.com",
  "firstName": "John",
  "lastName": "Doe",
  "role": "FARM_WORKER",
  "isActive": true,
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:00:00.000Z"
}
```

## Step 8: Test the Connection

1. Start your development server:
   ```bash
   npm run dev
   ```

2. Check the health endpoint:
   ```bash
   curl http://localhost:3000/health
   ```

3. You should see a response indicating the server is running

## Security Best Practices

1. **Never commit your `.env` file** - it's already in `.gitignore`
2. **Keep your service account key secure** - don't share it publicly
3. **Use environment-specific projects** - separate projects for development, staging, and production
4. **Regularly rotate your service account keys**
5. **Configure proper Firestore security rules** for production
6. **Enable Firebase App Check** for additional security

## Troubleshooting

### Common Issues:

1. **"Firebase project not found"**
   - Check your `FIREBASE_PROJECT_ID` in `.env`
   - Ensure the project exists in Firebase Console

2. **"Invalid private key"**
   - Ensure the private key is properly formatted with `\n` for line breaks
   - Make sure the key is wrapped in quotes in the `.env` file

3. **"Permission denied"**
   - Check your Firestore security rules
   - Ensure the user is properly authenticated

4. **"Service account not found"**
   - Verify your service account email and key
   - Ensure the service account has the necessary permissions

5. **"Caller does not have required permission to use project" / "PERMISSION_DENIED"**
   - This error occurs when the service account lacks permission to use the Identity Toolkit API (Firebase Authentication)
   - **Solution**: 
     1. Go to [Google Cloud Console IAM](https://console.cloud.google.com/iam-admin/iam?project=farm-management-system-6eb28)
     2. Find your service account email (from the service account JSON)
     3. Click "Edit" (pencil icon)
     4. Add role: **Service Usage Consumer** (`roles/serviceusage.serviceUsageConsumer`)
     5. Click "Save"
     6. Wait a few minutes for permissions to propagate
     7. Try again
   - **Alternative**: If you have project owner/admin access, you can enable the Identity Toolkit API:
     1. Go to [Google Cloud Console APIs & Services](https://console.cloud.google.com/apis/library)
     2. Search for "Identity Toolkit API"
     3. Click "Enable" if it's not already enabled

## Additional Resources

- [Firebase Documentation](https://firebase.google.com/docs)
- [Firestore Security Rules](https://firebase.google.com/docs/firestore/security/get-started)
- [Firebase Admin SDK](https://firebase.google.com/docs/admin/setup)
- [Firebase Authentication](https://firebase.google.com/docs/auth)