# <img src="assets/icon.png" alt="Siply icon" width="24" height="24" style="vertical-align:middle; margin-right:6px;" /> Siply

Siply is a local-first hydration tracker built with React Native, Expo 54, and expo-router. It stores hydration settings and history on the device, schedules local reminders, and does not require an account or backend.

## Current features

- Daily hydration target, active reminder window, sip size, gentle-goal threshold, and light/dark/system appearance.
- Three-tab interface: Today, History, and You, with a separate Settings route.
- Quick logging with named drink presets, custom preset amounts, manual reordering, and recent time-of-day ordering.
- Per-entry logs with exact timestamps and amounts for the most recent seven days; 120 days of daily summaries are retained.
- Undo of the latest log on Today and swipe-to-delete for retained entries in History.
- Display and custom-entry conversion for millilitres, US fluid ounces, and cups. Stored values remain millilitres.
- A 28-day calendar heatmap, day-detail sheet, hourly activity, streaks, best hours by estimated/exact volume, 90-day line/bar trends, average intake, goal-hit rate, and local heuristic insights.
- Shareable progress images in a native development/production build.
- JSON backup export/import with validation, confirmation, history merging, `.siply.json` file associations, and validated handling of generic file-provider URIs.
- Two read-only Android home-screen widgets (circular and linear). Tapping a widget opens Siply.
- Milestone celebrations when a log completes a 7-, 30-, or 100-day streak.

## Notifications

Siply calculates reminder amounts from the remaining daily target and the remaining active window. It schedules a rolling 24-hour set of local notifications, up to 48 scheduled items, and can add nudges 5 and 10 minutes after a reminder.

Reminder notifications provide these actions:

- **I drank** logs the amount encoded in the notification and opens the app.
- **Snooze 30 min** schedules one replacement reminder.
- **Skip** dismisses the notification without logging.

The app also schedules an end-of-window summary using the progress known when the schedule is created. Reminder copy can be encouraging, minimal, or playful. Android uses separate sound and silent notification channels.

Siply reschedules after hydration, on relevant state changes, when returning to the foreground, after a restore, and through a best-effort Expo background task. The background path reads and normalizes the same persisted Zustand snapshot as the foreground app. The operating system still controls whether and when background work runs, so device-level timing is not guaranteed.

## Privacy and offline behavior

There are no accounts, backend calls, analytics SDKs, crash-reporting SDKs, or cloud sync. Hydration data stays in AsyncStorage unless the user explicitly exports or shares it. AsyncStorage is app-private but is not an encrypted-at-rest vault, and uninstalling the app removes its local data unless the user has saved a backup.

## Architecture

The app uses expo-router for file-based navigation and a feature-vertical source layout:

```text
app/                                  routes and application wiring
src/core/                             constants, time/unit helpers, storage normalization
src/features/hydration/domain/        calculations, schedule, history, domain types
src/features/hydration/state/         Zustand store and persistence
src/features/hydration/notifications/ scheduling, actions, background task, diagnostics
src/features/hydration/backup/        export, import, validation, merge
src/features/hydration/widgets/       Android widget renderer and task handler
src/features/hydration/ui/            hydration-specific UI
src/shared/                            reusable components, hooks, theme, haptics
scripts/                               icon generation
```

State is managed by Zustand selectors. Zustand's persistence middleware stores the app state as one JSON value under `siply:hydration_store:v1`, with schema version 3. Older Zustand schema versions are normalized through the same migration path; the retired six-key persistence model is no longer present. Separate AsyncStorage keys hold notification-action deduplication, diagnostics, first-launch time, and last-export time; those operational values are not included in backups.

History days may contain `entries` (`id`, ISO timestamp, and `amountMl`). Entry arrays are retained for seven days; daily totals, goals, hourly counts, and other summaries are retained for 120 days. Backup merging unions retained entries by ID where possible and otherwise keeps the higher known daily total.

## Setup

Requirements:

- Node.js and npm
- Expo/EAS tooling available through `npx`
- Android Studio or Xcode for local native builds, as applicable
- An Expo account for EAS builds

Install dependencies:

```bash
npm install
```

Generate PNG icons from the source SVG when the icon source changes:

```bash
npm run generate:icons
```

Start Metro for a custom development client:

```bash
npm start
```

The `start` script runs `expo start --dev-client`. `npm run android`, `npm run ios`, and `npm run web` start the corresponding Expo targets, but native-only behavior cannot be fully verified in Expo Go or on web. Android widgets, notification channels/actions, bundled notification sound, background tasks, and file associations require a native development or release build.

## Builds

Create EAS development clients:

```bash
npm run dev:android
npm run dev:ios
```

Create internal preview builds:

```bash
npm run build:android:preview
npm run build:ios:preview
```

Create production builds for both platforms:

```bash
npm run build:all:production
```

Android is configured with package `com.yourstruggle11.siply`, ProGuard, and resource shrinking. The repository does not currently declare an iOS `bundleIdentifier`; configure one before relying on iOS distribution. Internal iOS distribution also requires an Apple Developer account and registered devices (`npm run eas:devices`).
