// Subscriptions.swift, the two yearly plans, each starting with one free month.
// both include the full ai brain and voice; unlimited lifts the daily usage cap.
// india pays rupee prices (3000/5000 a year), everywhere else dollar prices
// (149/199), set per storefront in app store connect. the free floor (pattern
// brain, reminders, birthdays) is never gated. storekit 2, verified on device
// by apple, and the signed proof doubles as the relay's auth token.

import Foundation
import StoreKit
import Observation

enum Tier: Int, Comparable, Sendable {
    case free = 0, plus = 1, pro = 2
    static func < (a: Tier, b: Tier) -> Bool { a.rawValue < b.rawValue }

    var label: String {
        switch self {
        case .free: return "free"
        case .plus: return "aura member"
        case .pro: return "aura unlimited"
        }
    }
}

@Observable
final class SubscriptionManager {
    static let shared = SubscriptionManager()

    var tier: Tier = .free
    // the jws proof of the active subscription, sent to the relay as auth.
    // apple signs it; the relay verifies it against apple's chain.
    var authJWS: String?

    private var updatesTask: Task<Void, Never>?

    func start() {
        guard updatesTask == nil else { return }
        updatesTask = Task { [weak self] in
            for await update in Transaction.updates {
                if case .verified(let t) = update { await t.finish() }
                await self?.refresh()
            }
        }
        Task { await refresh() }
    }

    @MainActor
    func refresh() async {
        var best: Tier = .free
        var jws: String?
        for await result in Transaction.currentEntitlements {
            guard case .verified(let t) = result, t.revocationDate == nil else { continue }
            let candidate: Tier? = t.productID == Config.proYearlyID ? .pro
                : t.productID == Config.plusYearlyID ? .plus : nil
            if let candidate, candidate > best {
                best = candidate
                jws = result.jwsRepresentation
            }
        }
        #if DEBUG
        // a dev key (env var or keychain) unlocks everything locally, so the
        // app is fully testable before the relay or app store connect exist
        if best == .free, Brain.devKey != nil {
            best = .pro
            jws = "dev"
        }
        #endif
        tier = best
        authJWS = jws
        // the free month starts the first time a paid tier appears; the day-25
        // "was this worth it?" card counts from this stamp
        if best > .free, Store.shared.data.nudged["trial:start"] == nil {
            Store.shared.data.nudged["trial:start"] = nowMs()
            Store.shared.save()
        }
    }

    // auth for the relay: only when the plan covers ai chat and the user consented
    func relayAuth(settings: Store.Settings) -> String? {
        guard tier >= .plus, settings.aiConsent else { return nil }
        return authJWS
    }

    // both paid tiers carry every feature; unlimited only lifts the daily cap
    func canUseVoice() -> Bool { tier >= .plus }
}
