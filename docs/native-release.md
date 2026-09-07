# Native iOS/Android release

The repository contains Capacitor projects in `ios/` and `android/`. Both apps
load only the HTTPS production origin configured in `capacitor.config.ts`.

## Firebase Cloud Messaging

1. Create the iOS and Android apps in the MediBridge Firebase project using
   bundle/application id `de.medibridge.careers`.
2. Place `google-services.json` at `android/app/google-services.json` in the
   protected build environment. Do not commit production credentials.
3. Add `GoogleService-Info.plist` to the iOS App target in the protected build
   environment and enable Push Notifications plus Background Modes → Remote
   notifications in Xcode.
4. Store the Firebase service-account JSON as the Supabase Edge Function secret
   `FIREBASE_SERVICE_ACCOUNT_JSON`.
5. Run `npm ci && npm run native:sync`, then build/sign in Android Studio or
   Xcode. Push permission is requested only after the candidate activates it in
   Profile → Settings.

The database migration creates owner-scoped device-token records. Backoffice
status changes create an in-app notification transactionally and invoke the
`send-push-notification` Edge Function. Invalid FCM tokens are disabled.

## Release checks

- Confirm the production HTTPS origin and Supabase redirect URLs.
- Verify registration, password reset, profile, document upload, job interest,
  status update and push receipt on one physical Android and one physical iOS
  device.
- Build signed AAB/IPA artifacts only in a protected CI environment with signing
  keys and Firebase configuration supplied as secrets.
