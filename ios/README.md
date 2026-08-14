# aura for iphone

**the ambient assistant that remembers your people and follows through. your memory lives in one file on your phone, and only leaves it when you say so.**

aura remembers people, birthdays, promises and reminders, then surfaces one calm card at a time. you approve or snooze. it speaks english and hindi (and hinglish), because it is built for india first.

## architecture, honestly

- **the palace**: everything aura knows lives in a single json file inside the app's own container. no accounts, no sync, no server-side copy. export it or delete it any time from the settings tab.
- **the ai brain**: when you subscribe and consent, chat messages plus the relevant slice of your memory go through a small stateless relay to Google Gemini (gemini-3.1-flash-lite today, chosen server-side so the model can change without an app update). the relay keeps nothing. the app never ships with an api key.
- **the free floor**: without a subscription, aura still works offline. the pattern brain (`Extraction.swift`) parses dates, people, promises and reminders with no model at all, and timed reminders, birthdays and place nudges are all local ios notifications.
- **two tiers, StoreKit 2, first month free**: `aura.plus.yearly` ("Aura": Rs 3000 a year in india, $149 outside) and `aura.pro.yearly` ("Aura Unlimited": Rs 5000 in india, $199 outside). both include the full ai brain and voice; unlimited lifts the daily usage cap. defined in `Aura.storekit` for local testing and mirrored in App Store Connect for real sales.
- **languages**: english and hindi are first-class in chat, extraction prompts, and voice. the ui strings live in `Localizable.xcstrings`.

## build and run

1. open `Aura.xcodeproj` in xcode 26 or newer. deployment target is ios 17.
2. pick your team under signing and capabilities. bundle id is `com.danish.aura`, change it if xcode complains.
3. select the **Aura** scheme and run on a simulator or device.
4. purchases in development: the scheme uses `Aura.storekit` as its storekit configuration, so you can buy plus or pro locally with fake money. edit scheme > run > options > storekit configuration if it ever comes unset.
5. running without a relay (DEBUG builds only): go to the more tab > developer, paste a Gemini api key and save. a dev key unlocks pro locally and talks to Gemini directly, no relay needed. there is also a relay url override field there for pointing at a staging relay.

## tests

run the **AuraTests** target with cmd-U in xcode, or from the terminal:

```
xcodebuild test -scheme Aura -destination 'platform=iOS Simulator,name=iPhone 17'
```

113 tests cover date parsing, the extraction pattern brain, the card engine, brain json parsing, and schema compatibility (including settings files written by older builds).

## the loop

```
capture -> remember -> recall -> notice -> one card -> you approve -> act -> learn
```

## honest caveats

- **the relay is not deployed yet.** `Config.relayURL` is a placeholder. until you deploy a relay and set the real url, ai chat only works via the DEBUG dev-key path above. see `SHIP_CHECKLIST.md`.
- **place nudges need Always location.** ios can only wake aura near a saved place if you grant Always access. with while-using access, place reminders only surface while the app is open.
- **the offline pattern brain is english-regex only.** hindi and hinglish extraction work through the ai brain, so on the free tier hindi messages are stored but not deeply parsed.
- **speech is on-device only where the locale supports it.** indian english and hindi recognition quality and on-device availability vary by ios version and device; when on-device recognition is unavailable, apple's speech service handles it.

no em dashes anywhere in this application either.
