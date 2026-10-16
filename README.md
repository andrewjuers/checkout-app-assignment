# Gametime Checkout Demo

This project is a React Native + Expo checkout screen that demonstrates platform-aware payment eligibility, real card validation, one-tap express flows, and resilient lifecycle recovery for interrupted payments.

## React Native New Architecture

This project is configured for Expo's React Native New Architecture, which enables the modern Fabric renderer and the JSI/TurboModule native bridge model.

- Fabric: the new UI renderer that improves interop, concurrency, and native rendering performance.
- TurboModules: native modules are loaded on demand and exposed to JavaScript without the older bridge overhead.
- JSI: the JavaScript Interface layer that lets JavaScript communicate directly with C++/native code, reducing serialization costs and enabling synchronous, low-latency calls.
- Expo compatibility: the app remains JavaScript-first while explicitly opting into the modern React Native architecture for mobile builds.

## What is built

- Payment method eligibility based on platform and device capability:
  - Apple Pay only on iOS and only when a wallet card is provisioned
  - Google Pay only on Android and only when Google Pay is configured
  - Affirm only when the order total exceeds $100
  - Credit card remains available as the universal fallback
- Card form validation with:
  - card number formatting
  - card brand detection
  - Luhn validation
  - expiry validation in the future
  - CVC validation matching the card type
- Express payment methods that complete the purchase in a single tap without a second submit action.
- A mock payment API with a real request/response boundary and persisted in-flight payment state stored in AsyncStorage.
- A simulator to force iOS/Android and wallet capabilities for review without needing multiple devices.

## Run it

From the project root, install dependencies and start Expo using the project’s local LAN setup:

```bash
npm install
npm run start
```

On Windows PowerShell, the equivalent command is often written as:

```powershell
npm.cmd run start
```

This is the same as `npm run start`, but it is useful in Windows shells where the `npm` command may not resolve without the `.cmd` shim. In this project, the script starts Expo with the LAN configuration used for local development:

```bash
expo start --lan --port 19000 --clear
```

This avoids the slower tunnel startup path that caused load delays earlier.

Then choose one of the following:

- Expo Go on a device: scan the QR code shown in the terminal
- iOS simulator: `npm run ios`
- Android emulator: `npm run android`
- Web preview: `npm run web`

If you want to start it manually instead of using the npm script, use:

```bash
npx expo start --lan --port 19000 --clear
```

### Platforms tested

- Expo Go: Android Studio
- Android Studio: Medium Phone (Android 17.0)
- Xcode: iPhone 17
- Web bundle validation via Expo tooling
- TypeScript and ESLint validation

These are the platforms this project was tested on during review. The app was validated against the Android and iOS simulator/device targets listed above, in addition to the local development checks noted above.

## Eligibility logic

Eligibility is computed in the app from a single source of truth:

```ts
const effectivePlatform = settings.forcePlatform === 'auto' ? Platform.OS : settings.forcePlatform;
const appleEligible = effectivePlatform === 'ios' && settings.appleWalletProvisioned;
const googleEligible = effectivePlatform === 'android' && settings.googleWalletConfigured;
const affirmEligible = orderTotal > 100;
```

Important behavior: Affirm is eligible only when the order total is strictly greater than $100. If the total is exactly $100, the `affirmEligible` condition is false and the Affirm option is hidden. This matches the requirement that the threshold is a strict greater-than check.

The environment simulator in the app lets reviewers override these values without changing the real detection logic. Changes are applied immediately because the component recalculates the derived `appleEligible`, `googleEligible`, and `affirmEligible` values from the current `settings` state and re-renders the payment method list. The simulator is a test harness for review and debugging; it does not connect to the real Apple Pay or Google Pay native SDKs or perform actual wallet transactions.

## Environment simulator

Tap the `Env` button in the header to open the simulator:

- choose `auto`, `ios`, or `android`
- toggle Apple Pay wallet provisioning
- toggle Google Pay configuration
- simulate card declines and cancelled wallet sheets

This allows a reviewer to verify the logic even when they don’t have multiple devices or OS states available. The simulated wallet eligibility is meant for local QA and demo review only; it does not mean the app has a production Apple Pay or Google Pay integration enabled.

## Mock API contract

The mock payment API is implemented in `src/utils/paymentApi.ts` and intentionally models a real payment boundary instead of a pure in-memory state machine. The boundary exists so the checkout UI does not directly mutate the authoritative payment state; instead, it creates a request, asks the “backend” to resolve status, and then reads the result back. This mirrors how a real payment stack separates frontend actions from server-side charge authorization and retry logic.

The contract is:

- `createPaymentRequest(method, total, settings)` creates a `PaymentRecord` with `requestId`, `idempotencyKey`, `method`, `total`, `status`, `message`, timestamps, and optional failure metadata.
- `syncPaymentStatus(requestId, settings)` resolves the next state of a pending request and returns the final or intermediate status.
- `loadPendingRequest()` restores the active request when the app resumes from a lifecycle interruption.
- `writeActiveRequest()` persists the active request key so a payment can survive app backgrounding and relaunches.

The purpose of each identifier is different:

- `requestId`: the unique identifier for one payment attempt; it is the record key in storage and the value the app uses to look up or reconcile a specific attempt.
- `idempotencyKey`: a stable key for a given payment intent; it allows the mock backend to recognize retries of the same operation and return the same prior result instead of creating a second payment.

The API returns explicit states for each major outcome:

- `pending`: request created, but the final outcome is still unknown
- `succeeded`: payment confirmed and completed
- `declined`: card rejected or other failure outcome
- `cancelled`: wallet flow was cancelled by the user or simulated environment
- `unknown`: no authoritative record could be found or the request was interrupted and cannot be confirmed

The mock backend intentionally includes failure conditions:

- card decline
- cancelled Apple Pay flow
- cancelled Google Pay flow

These are not treated as “success” responses and the UI recovers gracefully by showing the failure state and allowing retry without double charging. The important limitation is that this is still a front-end mock and locally persisted storage; it is not a real server-enforced duplicate-charge protection layer. The idempotency logic is designed to model best practices, but it is not equivalent to a production gateway that enforces uniqueness at the server boundary.

## Payment state flow

The app models a small, explicit payment lifecycle:

- `idle`: no payment in flight
- `validating`: when a form is being checked before submission
- `processing`: payment request is in flight or authorization is being confirmed
- `failed`: failure from the API or the wallet flow
- `succeeded`: final confirmation received

Express payment flow:

1. User taps Apple Pay / Google Pay / Affirm.
2. The app immediately creates a pending payment request through the mock API.
3. The request is written to AsyncStorage and the active request is remembered so it can be restored if the app moves to the background.
4. When the app returns to the foreground, `AppState` triggers a resume check and `loadPendingRequest()` looks up the saved request.
5. If the request is still `pending`, `syncPaymentStatus()` runs and decides whether the payment should become `succeeded`, `declined`, or `cancelled`.
6. The UI updates automatically to the final outcome without requiring another user tap.

Card flow:

1. User fills in the card form with native inputs.
2. Validation runs as the user types and on blur.
3. The Pay button is disabled until the card is valid.
4. A valid card submits one direct payment request.
5. A declined card shows a clear error and the user can change the card details without risking duplicate charge attempts.

For app interruption and relaunch behavior:

- If the OS backgrounds the app while a payment is in progress, the current request ID is persisted in AsyncStorage.
- If the OS kills the app or the app is closed mid-flow, the next launch calls `loadPendingRequest()` and reads the active request from storage.
- If the stored request is still pending, the app immediately calls `syncPaymentStatus()` to reconcile the payment before showing the final result.
- If the request is already resolved, it is restored and displayed as either `succeeded` or `failed` without extra user input.
- If no stored request is found, the app does nothing and leaves the UI in its current state.
- A second payment submission is blocked while a request is unresolved because the payment buttons and method cards are disabled during `processing`.

This is the key lifecycle guarantee the app is designed to demonstrate: the checkout is resilient to backgrounding and relaunches without creating duplicate charges in the mock backend.

## Tradeoffs

- I used AsyncStorage and a persisted payment request to simulate app lifecycle durability in a way that is realistic for a mobile checkout flow.
- The SDK interactions are intentionally stubbed rather than using real Apple Pay/Google Pay/Affirm integration, because the exercise is focused on flow behavior and correct state handling.
- I kept the design intentionally functional and readable rather than highly visual, since the core assignment is around eligibility, lifecycle recovery, and the quality of payment-state logic.

## What I would do differently with more time

- Add a full suite of unit tests for Luhn, expiry logic, and state transitions.
- Split the checkout into reusable components and hooks for cleaner separation of concerns.
- Add an end-to-end test harness that simulates app-background and relaunch transitions.
- Replace AsyncStorage with a true backend session flow and idempotency enforcement for stronger production realism.
