# POS Terminal — Android (Kotlin Compose)

A single-screen Android app that connects to the F&B API over WebSocket,
listens for payment requests from the customer kiosk, displays the order
with a Stripe-Terminal-style "Reading card…" animation, and reports the
result back. Sits on a counter next to the kiosk during demos.

## Wire protocol

Mirrors `apps/api/src/pos-terminal/protocol.ts` exactly — see `ws/Protocol.kt`.
The endpoint is `wss://<api>/pos-terminal?tenantSlug=…&locationSlug=…`.

## First-time setup

This folder has all the source plus `build.gradle.kts`, `settings.gradle.kts`,
`gradle.properties`, and `gradle/wrapper/gradle-wrapper.properties`. The
Gradle wrapper jar + `gradlew` scripts are not committed (see `.gitignore`);
generate them once locally with either:

```bash
# Option A — if you have Gradle 8.x installed
gradle wrapper --gradle-version 8.10.2
```

```bash
# Option B — open the folder in Android Studio
# (File → Open → apps/android)
# Android Studio will sync and create the wrapper automatically.
```

After the wrapper exists you can drive everything from the CLI:

```bash
./gradlew :app:assembleDebug                 # build debug APK
./gradlew :app:installDebug                  # install to a connected device
./gradlew :app:assembleRelease               # unsigned release APK (signed
                                             #   with the debug keystore for
                                             #   demo distribution)
```

The debug APK lands at `app/build/outputs/apk/debug/app-debug.apk`.

## Running on a device

1. Enable USB debugging on the Android device.
2. `./gradlew :app:installDebug` (or sideload the APK).
3. Launch "POS Terminal".
4. On the first screen, enter:
   - **Server URL** — e.g. `https://fnb-api.onrender.com` (the app rewrites
     `http(s)://` to `ws(s)://` automatically)
   - **Tenant slug** — e.g. `acme`
   - **Location slug** — e.g. `mission-st`
5. Tap **Connect**. The idle screen should show **Connected · Acme · Mission St**.
6. From the customer kiosk in a browser:
   `https://<your-web>/order/acme/mission-st?kiosk=1&table=patio-3`
7. Build a cart, tap **Pay**. The terminal screen jumps to the payment view.

## Smoke-testing without the APK

You can drive the WebSocket from your laptop with `wscat`:

```bash
npm i -g wscat
wscat -c 'wss://fnb-api.onrender.com/pos-terminal?tenantSlug=acme&locationSlug=mission-st'
# server replies: {"type":"ready","locationName":"Mission St","tenantName":"Acme"}
# kiosk submits → server pushes a payment_request payload
# reply with:
> {"type":"payment_result","intentId":"<paste-the-id>","status":"APPROVED"}
```

## Project layout

```
app/src/main/
├── AndroidManifest.xml
├── kotlin/com/fnb/posterminal/
│   ├── MainActivity.kt            ← single activity, routes between screens
│   ├── state/
│   │   ├── Settings.kt            ← DataStore-Preferences persistence
│   │   └── TerminalViewModel.kt   ← UI state + WS lifecycle
│   ├── ui/
│   │   ├── Theme.kt               ← Material3 colour scheme
│   │   ├── SettingsScreen.kt      ← first-launch pairing form
│   │   ├── IdleScreen.kt          ← "Ready" with connection pill
│   │   └── PaymentScreen.kt       ← Reading-card animation + Approve/Decline
│   └── ws/
│       ├── Protocol.kt            ← serialisable wire messages
│       └── TerminalSocket.kt      ← OkHttp WebSocket with reconnect backoff
└── res/
    ├── values/colors.xml
    ├── values/strings.xml
    ├── values/themes.xml
    ├── drawable/ic_launcher_foreground.xml
    └── mipmap-anydpi-v26/ic_launcher{,_round}.xml
```
