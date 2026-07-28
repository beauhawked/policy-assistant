# Mobile Release Log — iOS Wrap, TestFlight, and App Store Submission

Dated July 27, 2026. This document is the system of record for how the Policy to Action iOS app was built, hardened on a physical device, distributed through TestFlight, and submitted to the App Store. It pairs with `App-Store-Listing-Kit.md` (the listing copy and privacy answers) and `Policy-to-Action-iOS-Deployment-Guide.pdf` in this folder.

## Architecture

The iOS app is a Capacitor 8 shell (`ios/` in this repository) around the production web platform. `capacitor.config.ts` points the shell at `https://policytoaction.beauhawked.com/policy-assistant` with navigation allowed only on that domain, so the app always runs the currently deployed web code. Consequences that matter operationally:

- Web-side changes reach the app with a `vercel --prod` deploy and an app relaunch. No App Store update, no rebuild.
- Only changes inside `ios/` (Swift, Info.plist, Capacitor config, app icons) require an Xcode rebuild, and only those require a new build upload for TestFlight and App Store users.
- Data parity with the web platform is automatic because all state is server-side; conversations, pins, sources, and settings stay in sync across web and app sign-ins.

Key native details: appId `com.scarletfire.policytoaction`, Swift Package Manager (no CocoaPods), `contentInset: "never"` with the CSS owning safe areas via `env(safe-area-inset-*)`, background color `#0f2c46`, and `allowsBackForwardNavigationGestures` enabled in `AppDelegate.swift` so the standard iOS edge swipe works.

## Device shakedown: defects found and fixed

Testing on a physical iPhone 16 Pro Max surfaced and resolved, in order:

1. Status bar overlap and double insets: fixed by `contentInset: "never"` plus CSS safe-area padding (commit 975ec56 and e83e912).
2. Bottom navigation dead band: the phone bottom bar inherited a top safe-area inset; mobile override added (dea5b42).
3. Pinned answers not tappable: cards wrapped in a button that opens the source conversation (342bdd9).
4. Layout zoom on composer focus: iOS auto-zooms sub-16px inputs; mobile form controls set to 16px (4c2ba61). The `maximumScale: 1` viewport ceiling added at the same time was later removed (94d2ab3) because it blocked pinch-to-zoom; the 16px rule alone prevents the focus zoom.
5. Double-tap of the Assistant tab shoved the header under the Dynamic Island: the second tap starts a new question and had programmatically focused the composer, summoning the keyboard. Auto-focus now skips coarse-pointer devices, and the shell resets scroll after the keyboard dismisses (09fa858).
6. PDFs trapped or externally presented: resolved by the in-app reader (below).
7. No back gesture: every page change now pushes a real history entry, so edge swipes walk backward and forward through visited pages, and the browser Back button works on the web too (efbf3a7). After returning from a document, the app reopens the page the user was on rather than defaulting to the Assistant (94d2ab3).

## The in-app document reader

WKWebView cannot reliably pinch-zoom inline PDFs, and the system browser sheet felt external. The solution is `/reader` (`src/app/reader/page.tsx`): a branded document screen that renders same-origin PDFs page by page with PDF.js (worker served from `public/pdfjs/`), lazy page rendering to bound memory, and zoom owned by the reader itself: two-finger pinch anchored at the gesture center, double-tap to toggle 220 percent, and header zoom buttons, clamped 100 to 400 percent (0b76ff0, f9e0ff1). The native shell routes PDF taps to the reader; the web keeps opening PDFs in a new tab.

## Distribution state as of this writing

- Apple Developer Program: individual membership active under Beau's Apple ID (beau.scott@me.com); Xcode signing uses the paid team, so device builds no longer expire weekly. Seller name is the legal name; conversion to a Scarlet Fire LLC organization account (D-U-N-S required) is deliberately deferred.
- TestFlight: internal group "Core Team" with automatic distribution; Build 1.0 (1) installed over the air on the development phone. Future uploads flow to the group automatically.
- App Store submission: version 1.0 submitted and standing at Waiting for Review. Release is set to MANUAL, so approval arms a Release button and nothing publishes until pressed.
- Listing: name Policy to Action, subtitle "School Board Policy Answers", categories Education then Productivity, age rating 4+, Free, availability United States only (which keeps the EU Digital Services Act setup unnecessary), Apple Silicon Mac and Vision Pro availability switched OFF for launch.
- Privacy: public policy at https://policytoaction.beauhawked.com/privacy; App Privacy label published as Data Linked to You with exactly four types (Name, Email Address, Other User-Generated Content, User ID), all app-functionality only, no tracking.
- Export compliance: declared in `Info.plist` (`ITSAppUsesNonExemptEncryption` false), so no per-upload questions.
- Reviewer access: a dedicated demo workspace preloaded with the Sarasota policy corpus; credentials live in the App Review Information section of App Store Connect and are intentionally not recorded in this repository.
- App Store Connect Apple ID for the app record: 6795251070. Screenshots: six iPhone 6.5 inch (converted to 1284x2778) and iPad 13 inch captures.

## Runbooks

Shipping a web change (the common case): deploy with `vercel --prod` from the project folder; users get it on next app launch. Nothing else.

Shipping a native change: `npm install` if dependencies changed, `npx cap sync ios`, open Xcode, select the destination, Stop then Play to install to a device. For distribution: raise the build number, select Any iOS Device (arm64), Product then Archive, Distribute App, App Store Connect, Upload. TestFlight receives it automatically; an App Store release additionally needs a new version created and submitted in App Store Connect.

## Known notes, deliberately unresolved

- Apple's UIScene lifecycle notice appears at launch; today a warning. A future Capacitor update adopts it; pick that up before it becomes an SDK requirement.
- Xcode Cloud was inadvertently configured once from the Organizer; harmless and unused. Local archive remains the build path.
- Console noise on device runs ("Couldn't open <private>", sandbox extension messages, slow process launch under the debugger) is normal WebKit chatter and not actionable.

## Open items

Awaiting Apple's review verdict (manual release thereafter, timed to the dissertation study). Then, in no fixed order: Android wrap via Capacitor and the Play Store, the walkthrough video (script in `docs/onboarding/`), enabling the iPhone and iPad app on Apple Silicon Macs once iOS is stable, the Scarlet Fire LLC organization conversion to change the public seller name, an optional zero-data-retention request to OpenAI support, and an App Preview video for a future version's listing.
