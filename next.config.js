/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    NEXT_PUBLIC_FIREBASE_API_KEY: 'AIzaSyC8qkbCONQFowxeS67_3RzTqxKDrzm6LHQ',
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: 'ilpea-hr-system.firebaseapp.com',
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'ilpea-hr-system',
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: 'ilpea-hr-system.firebasestorage.app',
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: '536387147308',
    NEXT_PUBLIC_FIREBASE_APP_ID: '1:536387147308:web:04e9fa73b694a11e212389',
    FIREBASE_PROJECT_ID: 'ilpea-hr-system',
    FIREBASE_CLIENT_EMAIL:
      'firebase-adminsdk-fbsvc@ilpea-hr-system.iam.gserviceaccount.com',
  },
};

module.exports = nextConfig;
