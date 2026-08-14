# aura ship checklist

every step from here to the App Store, in order. items marked **[BLOCKS SUBMISSION]** must be done before you can press submit; the rest can happen in parallel or after.

## a. account and agreements

1. **[BLOCKS SUBMISSION]** enroll in the Apple Developer Program ($99 a year) at developer.apple.com with the apple id you will ship under. enrollment review can take a day or two, start here.
2. **[BLOCKS SUBMISSION]** in App Store Connect > Business, accept the Paid Apps agreement. subscriptions cannot go live without it.
3. **[BLOCKS SUBMISSION]** complete banking (an indian bank account for INR payouts) and tax forms in the same section. apple withholds sales until these clear, and subscription products cannot reach "Ready to Submit" before they do.

## b. app record

4. **[BLOCKS SUBMISSION]** create the app record in App Store Connect. the plain name "Aura" is taken on the store, so use a unique form such as **"Aura: remember your people"** (fits the 30 character limit). before committing, search the store and a trademark database for conflicts with the exact name you pick.
5. **[BLOCKS SUBMISSION]** bundle id: register `com.danish.aura` in the developer portal (Certificates, Identifiers and Profiles) and attach it to the app record. enable the **Time Sensitive Notifications** capability on this App ID, it must match `Aura.entitlements`.
6. set primary language (English (India) if offered, otherwise English (U.S.)) and add a Hindi localization for the store listing if you want one. category: Productivity or Lifestyle.

## c. subscriptions

7. **[BLOCKS SUBMISSION]** create a subscription group named **Aura** (reference name; keep the group reference consistent with `Config.subscriptionGroupID`).
8. **[BLOCKS SUBMISSION]** in that group create two auto-renewable yearly subscriptions matching `Aura.storekit` exactly:
   - product id `aura.plus.yearly`, display name "Aura", description "Full AI brain and voice, generous daily use".
   - product id `aura.pro.yearly`, display name "Aura Unlimited", description "Everything, with no daily limit".
9. **[BLOCKS SUBMISSION]** pricing is split by region, set it manually:
   - United States (and all storefronts outside India): $149 a year (Aura) and $199 a year (Aura Unlimited). set the USD price as the base and let apple derive other non-India currencies.
   - India: override to Rs 3000 (Aura) and Rs 5000 (Aura Unlimited).
   - add a **1 month free introductory offer** on BOTH subscriptions (new subscribers only, all storefronts). this is the "free for every user for 1 month" promise, enforced by apple itself.
10. **[BLOCKS SUBMISSION]** each subscription needs its own review screenshot (the paywall showing that product) and a localization for every listing language. subscriptions are submitted for review together with the first app version, attach them on the version page.

## d. privacy and rating

11. **[BLOCKS SUBMISSION]** App Privacy questionnaire: answer to match `Aura/PrivacyInfo.xcprivacy`. data collected: **none** (nothing is retained off device; the relay is stateless and keeps nothing). in the app description and review notes, still disclose plainly that chat messages are processed by Google Gemini when the user subscribes and consents. no tracking, no third-party analytics.
12. **[BLOCKS SUBMISSION]** age rating questionnaire: answer the AI chat questions honestly (the app contains generative AI chat where output is not fully predictable). expect a **13+** style rating; do not understate it to get 4+.
13. **[BLOCKS SUBMISSION]** privacy policy url: host `docs/privacy-policy.md` on a public page (github pages works), put the url in the app record, and set the same url in `Config.privacyPolicyURL` so the in-app link matches.
14. **[BLOCKS SUBMISSION]** support url and contact: a simple page or the repo readme, with support email **daanishmotivate@gmail.com**. this email is already `Config.supportEmail`.

## e. store listing assets

15. **[BLOCKS SUBMISSION]** screenshots, two required sizes: 6.9 inch (iPhone 16 Pro Max class) and 6.5 inch (iPhone 11 Pro Max / Xs Max class). shoot the same five screens for each set:
    1. Today with a card showing (approve / snooze visible)
    2. Chat in English
    3. Chat in Hindi
    4. People
    5. Paywall (both tiers and prices visible)
16. app description, promo text, keywords. keep claims honest: free tier is offline reminders, birthdays and the pattern brain; AI chat and voice are paid.

## f. review notes

17. **[BLOCKS SUBMISSION]** write review notes on the version page explaining, in plain words:
    - the AI consent screen: AI chat is off until the user subscribes and explicitly consents; the consent text names Google Gemini per guideline 5.1.2(i).
    - the relay: the app talks to a stateless relay operated by the developer, which forwards to Google Gemini and stores nothing; no api key ships in the binary.
    - a demo path on the free tier so the reviewer can exercise the app without paying: add a person, say "remind me to call amma tomorrow at 6pm", watch the reminder schedule, add a birthday, see the Today card. mention that purchases can be tested with a sandbox account.

## g. testflight first

18. upload a build and run an internal TestFlight round before submitting for review. verify on a real device: purchases in sandbox, consent flow, notifications firing with the app closed, hindi chat, voice on pro.
19. optional external TestFlight (needs its own light review) for a handful of real users. fix what they hit.

## h. pre-submit technical checks

20. **[BLOCKS SUBMISSION]** deploy the relay and set the real url in `Config.relayURL` (it is a placeholder today). confirm a round trip from a device build with no dev key.
21. **[BLOCKS SUBMISSION]** confirm `Config.privacyPolicyURL` points at the hosted policy (see item 13), not the example.com placeholder.
22. **[BLOCKS SUBMISSION]** bump the build number (and version if needed) in the project settings.
23. **[BLOCKS SUBMISSION]** archive with distribution signing (Product > Archive, then Distribute App > App Store Connect). do not ship a debug build; the DEBUG developer section (dev key, relay override) compiles out of release builds, verify it is absent.
24. **[BLOCKS SUBMISSION]** in the organizer or on the uploaded build, verify the distribution provisioning profile carries `com.apple.developer.usernotifications.time-sensitive`. if it is missing, regenerate the profile after item 5.
25. final pass: run the AuraTests target green, test the export and delete flows, and confirm the app behaves sanely with no network (free floor intact).
26. submit the version with both subscriptions attached, and answer any reviewer questions from the notes in item 17.
