// The Firebase project that signs people in and keeps their progress (Firebase console → Project settings →
// Your apps → Web). These values aren't secret: who may read what is decided by the Firestore rules.
// While this is null, Nekko has no login and keeps progress on each device only.

import type { FirebaseOptions } from "firebase/app";

export const firebaseConfig: FirebaseOptions | null = {
  apiKey: "AIzaSyCQS6V5Fuv37J6xmX79aIE8UJw0d67PeQY",
  authDomain: "nekko-76274.firebaseapp.com",
  projectId: "nekko-76274",
  storageBucket: "nekko-76274.firebasestorage.app",
  messagingSenderId: "440840488826",
  appId: "1:440840488826:web:537cae509612ddc028b8c3",
};
