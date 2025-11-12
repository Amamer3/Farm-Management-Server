const admin = require('firebase-admin');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
  const serviceAccount = {
    type: "service_account",
    project_id: process.env.FIREBASE_PROJECT_ID,
    private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
    private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    client_email: process.env.FIREBASE_CLIENT_EMAIL,
    client_id: process.env.FIREBASE_CLIENT_ID,
    auth_uri: "https://accounts.google.com/o/oauth2/auth",
    token_uri: "https://oauth2.googleapis.com/token",
    auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
    client_x509_cert_url: `https://www.googleapis.com/robot/v1/metadata/x509/${process.env.FIREBASE_CLIENT_EMAIL}`
  };

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: `https://${process.env.FIREBASE_PROJECT_ID}.firebaseio.com`
  });
}

const db = admin.firestore();
const auth = admin.auth();

async function createFirstAdmin() {
  try {
    console.log('Creating first admin user...');
    
    // Admin user details
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@farmmanagement.com';
    const adminPassword = process.env.ADMIN_PASSWORD || 'Admin123!';
    const adminName = process.env.ADMIN_NAME || 'System Administrator';
    const farmId = process.env.ADMIN_FARM_ID || uuidv4();
    
    console.log(`Email: ${adminEmail}`);
    console.log(`Name: ${adminName}`);
    console.log(`Farm ID: ${farmId}`);
    
    // Check if admin already exists in Firebase Auth
    let existingUser = null;
    try {
      existingUser = await auth.getUserByEmail(adminEmail);
      console.log('⚠️  User with this email already exists in Firebase Auth with UID:', existingUser.uid);
      
      // Check if user document exists in Firestore
      const userDoc = await db.collection('users').doc(existingUser.uid).get();
      if (userDoc.exists) {
        const userData = userDoc.data();
        console.log('✅ User document already exists in Firestore with role:', userData.role);
        console.log('User is already set up. No action needed.');
        return;
      } else {
        console.log('⚠️  User exists in Firebase Auth but not in Firestore. Creating Firestore document...');
        // Create Firestore document for existing Firebase user
        const userData = {
          id: existingUser.uid,
          email: adminEmail,
          name: adminName,
          role: 'super_admin',
          farmId: farmId,
          isActive: true,
          createdAt: admin.firestore.Timestamp.now(),
          updatedAt: admin.firestore.Timestamp.now()
        };
        await db.collection('users').doc(existingUser.uid).set(userData);
        console.log('✅ Firestore document created for existing user!');
        console.log('Login credentials:');
        console.log(`Email: ${adminEmail}`);
        console.log(`Password: [Use existing password or reset via Firebase Console]`);
        return;
      }
    } catch (error) {
      // User doesn't exist, continue with creation
      if (error.code !== 'auth/user-not-found') {
        throw error;
      }
    }
    
    // Create user in Firebase Auth
    const firebaseUser = await auth.createUser({
      email: adminEmail,
      password: adminPassword,
      displayName: adminName,
      emailVerified: true
    });
    
    console.log('Firebase Auth user created with UID:', firebaseUser.uid);
    
    // Create user document in Firestore
    const userData = {
      id: firebaseUser.uid,
      email: adminEmail,
      name: adminName,
      role: 'super_admin', // Use lowercase with underscore to match UserRole enum
      farmId: farmId,
      isActive: true,
      createdAt: admin.firestore.Timestamp.now(),
      updatedAt: admin.firestore.Timestamp.now()
    };
    
    await db.collection('users').doc(firebaseUser.uid).set(userData);
    
    console.log('\n✅ First admin user created successfully!');
    console.log('\n📋 Login Credentials:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📧 Email:    ${adminEmail}`);
    console.log(`🔑 Password: ${adminPassword}`);
    console.log(`👤 Role:     super_admin`);
    console.log(`🏢 Farm ID:  ${farmId}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('\n⚠️  SECURITY WARNING:');
    console.log('   Please change the password after first login!');
    console.log('   Store these credentials securely.');
    
  } catch (error) {
    console.error('❌ Error creating admin user:', error);
    process.exit(1);
  }
}

// Run the script
createFirstAdmin()
  .then(() => {
    console.log('\nScript completed successfully.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Script failed:', error);
    process.exit(1);
  });