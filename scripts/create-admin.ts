import * as dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(__dirname, '../.env') });

import admin from 'firebase-admin';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import { UserRole } from '../src/models/types';

// Initialize Firebase Admin SDK for Firestore
if (!admin.apps.length) {
  const serviceAccount: admin.ServiceAccount = {
    projectId: process.env.FIREBASE_PROJECT_ID!,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n') || '',
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
  };

  // Try to load from service account file if env vars not available
  if (!serviceAccount.privateKey || !serviceAccount.clientEmail) {
    try {
      const serviceAccountFile = require('../firebase-service-account.json');
      Object.assign(serviceAccount, serviceAccountFile);
    } catch (error) {
      console.error('❌ Error: Firebase service account configuration not found.');
      console.error('   Please provide either environment variables or firebase-service-account.json file.');
      process.exit(1);
    }
  }

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: process.env.FIREBASE_PROJECT_ID,
  });
}

const db = admin.firestore();

async function createFirstAdmin() {
  try {
    console.log('🚀 Creating first admin user with Better Auth...\n');
    
    // Admin user details
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@farmmanagement.com';
    const adminPassword = process.env.ADMIN_PASSWORD || 'Admin123!';
    const adminName = process.env.ADMIN_NAME || 'System Administrator';
    const farmId = process.env.ADMIN_FARM_ID || uuidv4();
     
    console.log(`📧 Email:    ${adminEmail}`);
    console.log(`👤 Name:     ${adminName}`);
    console.log(`🏢 Farm ID:  ${farmId}\n`);
    
    // Check if admin already exists in Firestore
    const usersSnapshot = await db.collection('users')
      .where('email', '==', adminEmail)
      .limit(1)
      .get();
    
    if (!usersSnapshot.empty) {
      const existingUser = usersSnapshot.docs[0].data();
      console.log('⚠️  User with this email already exists!');
      console.log(`   User ID: ${existingUser.id}`);
      console.log(`   Role: ${existingUser.role}`);
      console.log('\n✅ User is already set up. No action needed.');
      return;
    }
    
    // Generate user ID
    const userId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Hash password
    const passwordHash = await bcrypt.hash(adminPassword, 10);
    
    // Create user document in Firestore
    const userData = {
      id: userId,
      email: adminEmail,
      name: adminName,
      role: UserRole.ADMIN, // Use ADMIN role (maps to 'admin')
      farmId: farmId,
      passwordHash: passwordHash,
      emailVerified: true,
      isActive: true,
      createdAt: admin.firestore.Timestamp.now(),
      updatedAt: admin.firestore.Timestamp.now()
    };
    
    await db.collection('users').doc(userId).set(userData);
    
    console.log('✅ First admin user created successfully!\n');
    console.log('📋 Login Credentials:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📧 Email:    ${adminEmail}`);
    console.log(`🔑 Password: ${adminPassword}`);
    console.log(`👤 Role:     ${UserRole.ADMIN}`);
    console.log(`🏢 Farm ID:  ${farmId}`);
    console.log(`🆔 User ID:  ${userId}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('\n⚠️  SECURITY WARNING:');
    console.log('   Please change the password after first login!');
    console.log('   Store these credentials securely.');
    
  } catch (error: any) {
    console.error('❌ Error creating admin user:', error.message || error);
    console.error(error);
    process.exit(1);
  }
}

// Run the script
createFirstAdmin()
  .then(() => {
    console.log('\n✅ Script completed successfully.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });

