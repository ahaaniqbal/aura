// Config.swift, the few knobs that define this build.
// the model itself is chosen server-side in the relay, so it can be swapped
// without an app update. the app only ever names the provider to the user.

import Foundation

#warning("Config.relayURL and Config.privacyPolicyURL are placeholders. Deploy the relay (server/relay/README.md), host the privacy policy, and replace both before any TestFlight or App Store build.")

enum Config {
    // TODO(danish): replace with your deployed relay url before TestFlight.
    // deploy steps live in server/relay/README.md
    static let relayURL = URL(string: "https://aura-relay.example.workers.dev")!

    // where "report this response" and support mails go
    static let supportEmail = "daanishmotivate@gmail.com"

    // hosted privacy policy, required by app review. the page to host is
    // docs/privacy-policy.md, see SHIP_CHECKLIST.md
    static let privacyPolicyURL = URL(string: "https://aura.example.com/privacy")!
    static let termsURL = URL(string: "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/")!

    // subscription products, must match App Store Connect and Aura.storekit
    static let plusYearlyID = "aura.plus.yearly"
    static let proYearlyID = "aura.pro.yearly"

    // the provider named in the consent screen, per app review guideline 5.1.2(i)
    static let aiProviderName = "Google Gemini"
}
