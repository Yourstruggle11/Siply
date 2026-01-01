# <img src="assets/icon.png" alt="Siply icon" width="24" height="24" style="vertical-align:middle; margin-right:6px;" /> Siply

drink water, on time.

## Setup
1) Install dependencies
   - `npm install`
2) Generate icons
   - `npm run generate:icons`
3) Start the app
   - `npm start`

## Notification strategy
- Local notifications are scheduled in a rolling 24 hour window within the active hours.
- On app launch, settings changes, progress updates, and when returning to foreground, existing schedules are canceled and rebuilt.
- Reminder spacing is computed automatically based on remaining target and remaining window time.
- Optional nudges are scheduled at +5 and +10 minutes for each reminder when enabled.
- Sound is enabled per notification when the setting is on; silent or DND may still mute.
- Notifications include an "I drank" action to log a dose without opening the app.
- The action is de-duplicated per notification and dismisses the alert immediately.

## System behavior (what to expect)
- Reminders are scheduled only within the active window and are recalculated on launch/foreground and after settings or progress changes.
- Reminder size is automatic: the remaining target is divided across remaining reminders, sips are derived from your sip size.
- If the daily target is already met, no reminders are scheduled for that day.
- If notifications are disabled, the app shows a warning and reminders will not fire.
- If nudges are enabled, they are sent at +5 and +10 minutes after each reminder.
- If actual behavior differs from this section, treat it as a bug and report it.

Example:
- Target 3.0 L, window 07:00-23:00, sip size 15 ml. If you open the app at 10:10 with 0 ml consumed, the next reminder will be the next scheduled slot in the window and will display roughly 200 ml (about 13 sips). If you log 300 ml at 14:00, later reminders adjust so the remaining amount is spread across the rest of the window.

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

## Diagnostics panel (feature flag)
- Disabled by default. Enable with `EXPO_PUBLIC_SIPLY_DIAGNOSTICS=1` (or `true`).
- Local dev: set the env var (for example in `.env`) and restart `npm start`.
- EAS Build: set it in the EAS dashboard or under `env` in `eas.json`.
- Env changes do not affect already-installed builds; rebuild or publish an EAS Update to apply.
- When enabled, Settings shows a Notification diagnostics panel with export.

## Limitations
- Notifications cannot override Silent mode or Do Not Disturb.
- Android may delay or coalesce reminders under battery optimization.
- Expo Go warns about remote push notifications being unsupported. Siply uses local scheduled notifications, which still work in Expo Go.

## Share card
- Uses `react-native-view-shot` for image capture and `expo-sharing` to open the share sheet.

## Notification sound
- Custom sound: `assets/sounds/siply_reminder.wav`
- Android uses notification channels, uninstall/reinstall or reset the channel to apply sound changes.

## Icons
- Source SVG: `assets/icon/siply-icon.svg`
- Generator: `scripts/generate-icons.mjs` (uses `sharp`)
- Outputs: `assets/icon.png`, `assets/adaptive-icon.png`
