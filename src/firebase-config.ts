// The Firebase project that signs people in and keeps their progress (Firebase console → Project settings →
// Your apps → Web). These values aren't secret: who may read what is decided by the Firestore rules.
// While this is null, Nekko has no login and keeps progress on each device only.

import type { FirebaseOptions } from "firebase/app";

export const firebaseConfig: FirebaseOptions | null = null;
