# CapitalForge Mobile

React Native (Expo) mobile app for CapitalForge advisors and clients. Provides KPI dashboards, client management, application pipeline management, push alerts, and document capture (KYB/receipt).

## Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| Node.js | 18+ | LTS recommended |
| npm | 9+ | Or use yarn/pnpm |
| Expo CLI | Latest | `npm install -g expo-cli` |
| Expo Go app | Latest | iOS/Android device for dev |
| iOS Simulator | Xcode 15+ | macOS only |
| Android Emulator | Android Studio | Any OS |

> **No native build tool required for development.** Expo Go handles all native modules during development.

---

## Setup

```bash
cd mobile
npm install
```

Copy the environment config:

```bash
# Create a local env file (do not commit)
echo "EXPO_PUBLIC_API_URL=http://localhost:3000/api/v1" > .env.local
```

For device testing, replace `localhost` with your machine's LAN IP (e.g., `http://192.168.1.x:3000/api/v1`).

---

## Running the App

### Start Expo development server

```bash
npm start
# or
npx expo start
```

This opens the Expo dev tools in your browser. From there:

- Press **`i`** — open in iOS Simulator (macOS only)
- Press **`a`** — open in Android Emulator
- Scan the QR code with **Expo Go** on a physical device

### Run directly on a platform

```bash
npm run ios       # iOS Simulator (macOS only)
npm run android   # Android Emulator
npm run web       # Web browser (limited native features)
```

---

## Project Structure

```
mobile/
├── app.json              # Expo configuration (name, bundle IDs, permissions)
├── package.json          # Dependencies
├── tsconfig.json         # TypeScript config
└── src/
    ├── navigation/
    │   └── AppNavigator.tsx    # Root stack + bottom tab navigator
    ├── screens/
    │   ├── LoginScreen.tsx         # Email/password + biometric placeholder
    │   ├── DashboardScreen.tsx     # KPI cards, activity feed, quick actions
    │   ├── ClientsScreen.tsx       # Client list with search + filters
    │   ├── PipelineScreen.tsx      # Application pipeline + approve/decline
    │   ├── AlertsScreen.tsx        # Push-style alerts with mark-read
    │   └── DocumentCaptureScreen.tsx  # Camera capture for KYB docs
    └── lib/
        ├── api-client.ts   # Typed API client with auto token refresh
        └── theme.ts        # Navy/gold brand constants
```

---

## Building for Production

### EAS Build (recommended)

```bash
npm install -g eas-cli
eas login
eas build:configure
```

**iOS:**
```bash
eas build --platform ios
```

**Android:**
```bash
eas build --platform android
```

**Both:**
```bash
eas build --platform all
```

### Local Build (advanced)

```bash
npx expo run:ios      # Requires Xcode + Apple Developer account
npx expo run:android  # Requires Android Studio + connected device/emulator
```

---

## Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `EXPO_PUBLIC_API_URL` | Backend API base URL | `https://api.capitalforge.com/api/v1` |

Prefix all client-accessible env vars with `EXPO_PUBLIC_`. These are inlined at build time.

---

## Authentication Flow

1. User enters email/password on `LoginScreen`
2. On success, `accessToken` and `refreshToken` are stored in **Expo SecureStore** (encrypted device keychain)
3. `api-client.ts` automatically attaches `Authorization: Bearer <token>` to all requests
4. On 401 responses, the client silently refreshes the access token and retries
5. On refresh failure, tokens are cleared and the user is redirected to login
6. Biometric auth (Face ID / fingerprint) is stubbed — wire `expo-local-authentication` to complete

---

## Key Dependencies

| Package | Purpose |
|---------|---------|
| `expo` | Managed workflow runtime |
| `@react-navigation/native` | Navigation container |
| `@react-navigation/bottom-tabs` | Bottom tab bar |
| `@react-navigation/native-stack` | Native stack navigation |
| `@tanstack/react-query` | Server state, caching, background refetch |
| `zustand` | Client-side global state |
| `expo-secure-store` | Encrypted token storage (device keychain) |
| `expo-camera` | Document/receipt camera capture |
| `expo-local-authentication` | Biometric auth (Face ID / fingerprint) |

---

## TypeScript

Type checking only (no emit):

```bash
npm run type-check
```

Path alias `@/*` maps to `src/*` for clean imports:

```ts
import { Colors } from '@/lib/theme';
```

---

## Notes for Developers

- **Mock data** is included in every screen as `placeholderData` for `useQuery`. This allows the UI to render immediately while the real API loads, and allows development without a live backend.
- **Approve/Decline** actions in `PipelineScreen` use `Alert.prompt` which is iOS-only. On Android, replace with a custom modal input.
- **Camera permissions** are declared in `app.json` and auto-handled by `expo-camera`. No manual `PermissionsAndroid` calls needed.
- **SecureStore** is not available in Expo web — use `localStorage` fallback for web builds.
