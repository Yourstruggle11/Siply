# <img src="assets/icon.png" alt="Siply icon" width="24" height="24" style="vertical-align:middle; margin-right:6px;" /> Siply

drink water, on time.

## Setup
1) Install dependencies
   - `npm install`
2) Generate icons
   - `npm run generate:icons`
3) Start the app
   - `npx expo start`

## Notification strategy
- Local notifications are scheduled in a rolling 24 hour window within the active hours.
- On app launch, settings changes, progress updates, and when returning to foreground, existing schedules are canceled and rebuilt.
- Reminder spacing is computed automatically based on remaining target and remaining window time.
- Optional nudges are scheduled at +5 and +10 minutes for each reminder when enabled.
- Sound is enabled per notification when the setting is on; silent or DND may still mute.
- Notifications include an “I drank” action to log a dose without opening the app.

## Key features
- Quick Log presets (editable cup sizes) with optional last-used highlight and haptics.
- Gentle goals and streaks (current/best, 7d/30d hits).
- Insights screen with weekly summary and best hours.
- Shareable Siply Card image from Insights.
- Optional goal calculator in Settings.

## Builds (shareable test builds)
Android (APK, easiest to share):
- `npm run build:android:preview`

iOS (IPA, internal distribution):
- Register devices once: `npm run eas:devices`
- Build: `npm run build:ios:preview`

Production (both platforms):
- `npm run build:all:production`

Notes:
- Preview Android builds output an APK for direct sharing.
- iOS internal builds require an Apple Developer account and registered device UDIDs.
- Android release size is optimized with Proguard/resource shrinking (see `app.json`).

## Limitations
- Notifications cannot override Silent mode or Do Not Disturb.
- Android may delay or coalesce reminders under battery optimization.
- Expo Go warns about remote push notifications being unsupported. Siply uses local scheduled notifications, which still work in Expo Go.

## Share card
- Uses `react-native-view-shot` for image capture and `expo-sharing` to open the share sheet.

## Icons
- Source SVG: `assets/icon/siply-icon.svg`
- Generator: `scripts/generate-icons.mjs` (uses `sharp`)
- Outputs: `assets/icon.png`, `assets/adaptive-icon.png`
