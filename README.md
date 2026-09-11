# <img src="assets/icon.png" alt="Siply icon" width="24" height="24" style="vertical-align:middle; margin-right:6px;" /> Siply

**Drink water, on time.**
Siply is a highly polished, premium hydration tracking app built with React Native and Expo. It goes beyond simple buttons by offering intelligent, personality-driven reminders, deep data insights, and seamless OS integrations.

## 🚀 Key Features

### 💧 Smart Hydration Engine
- **Customizable Targets:** Set daily goals, custom active hours (e.g. 07:00 to 23:00), and custom sip sizes.
- **Quick Logging:** Fluid, haptic-enabled UI for quickly logging presets.
- **Dynamic Theming:** Premium dark and light mode designs featuring glassmorphic accents and rich gradients.

### 🔔 Intelligent Notification System
- **Adaptive Scheduling:** Local notifications are scheduled dynamically based on your progress and remaining active window time. If you hit your target early, reminders stop automatically.
- **Interactive Actions:** Users can log a drink ("I drank"), "Snooze" for later, or "Skip" entirely—right from the lock screen without opening the app!
- **Notification Tones:** Reminders are tailored with distinct personalities (Minimal, Friendly, or Playful) that adapt to context (e.g., morning check-ins vs. late-night catch-ups).
- **Background Sync:** Reliable background tasks keep notification schedules and badges perfectly synced even if the app was force-killed.

### 📊 History & Smart Insights
- **Rich Analytics:** Visual 7-day and 30-day progress charts, best streaks, and average intake metrics.
- **Smart Insights Engine:** Siply analyzes your history to generate meaningful, contextual insights (e.g., "You consistently hit your goals early!", "You struggle on weekends, keep pushing!").
- **Shareable Cards:** Users can export beautiful, custom-rendered images of their progress via `react-native-view-shot` and the native OS share sheet.

### 📱 Android Home Screen Widgets
- **Premium Glassmorphic Design:** Two stunning widgets (Circular and Linear) featuring deep gradient backgrounds and simulated neon glows.
- **Interactive:** Tapping the widgets instantly deep-links back into the app.
- **Background Updates:** Widgets automatically refresh in the background via Expo Task Manager.

### 💾 Data Portability & Deep Linking
- **JSON Backups:** Export entire app state (settings, history, logs) as a `.siply.json` backup file.
- **Seamless Restore:** Native Android and iOS file association allows users to tap a `.siply.json` file in an email or file manager to instantly open Siply and begin the import flow.

---

## 🛠 Setup & Development

### 1) Install dependencies
```bash
npm install
```

### 2) Generate icons
```bash
npm run generate:icons
```

### 3) Start the app
```bash
npm start
```
*Note: Due to custom native Android widget code and deep linking intent filters in `app.json`, a custom development client (`expo start --dev-client`) or a native rebuild (`npx expo run:android`) is recommended to test all features.*

---

## 🏗 Architecture Notes

### File Association & Deep Links
- iOS utilizes `CFBundleDocumentTypes` and Android utilizes `intentFilters` in `app.json` to map `.siply.json` to Siply.
- Deep links are intercepted in `app/_layout.tsx` using `expo-linking`, heavily fortified with `expo-file-system/legacy` caching to securely read Android `content://` URIs natively.

### Notification Deduplication
- Interactive actions ("Log", "Snooze") are instantly de-duplicated utilizing an internal `AsyncStorage` map with TTLs to prevent rapid double-taps from polluting the hydration store.

### Diagnostics Panel (Feature Flag)
- Disabled by default. Enable with `EXPO_PUBLIC_SIPLY_DIAGNOSTICS=1` (or `true`).
- When enabled, Settings shows a Notification diagnostics panel with raw scheduling data export.

---

## 📦 Builds (Shareable Test Builds)

**Android (APK, easiest to share):**
```bash
npm run build:android:preview
```
*Android release size is optimized with Proguard/resource shrinking (see `app.json`).*

**iOS (IPA, internal distribution):**
- Register devices once: `npm run eas:devices`
- Build: `npm run build:ios:preview`
*(Requires an Apple Developer account and registered device UDIDs).*

**Production (both platforms):**
```bash
npm run build:all:production
```
