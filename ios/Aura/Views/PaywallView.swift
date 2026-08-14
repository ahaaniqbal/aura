// PaywallView.swift, apple's own subscription store view carries the design.
// two yearly plans, both with the full brain and voice; unlimited lifts the
// daily cap. every new subscriber's first month is free.

import SwiftUI
import StoreKit

struct PaywallView: View {
    @Environment(\.dismiss) private var dismiss
    var manager = SubscriptionManager.shared
    @State private var storeAvailable: Bool?

    var body: some View {
        Group {
            if storeAvailable == false {
                storeFallback
            } else {
                storeView
            }
        }
        .task {
            let products = (try? await Product.products(for: [Config.plusYearlyID, Config.proYearlyID])) ?? []
            storeAvailable = !products.isEmpty
        }
    }

    // the store can fail to load (no network, app store hiccup). never show a
    // blank wall: at least say what the plans are and that the month is free.
    var storeFallback: some View {
        VStack(spacing: 16) {
            Circle().fill(Theme.orbGradient).frame(width: 56, height: 56)
                .padding(.top, 40)
                .accessibilityHidden(true)
            Text("Aura, at full strength").font(.title2.bold())
            VStack(alignment: .leading, spacing: 10) {
                Label("Aura: ₹3,000 a year in India, $149 outside", systemImage: "sparkles")
                Label("Aura Unlimited: ₹5,000 or $199, no daily limit", systemImage: "infinity")
                Label("Every new member's first month is free", systemImage: "gift")
            }
            .font(.subheadline)
            Text("Plans didn't load from the App Store. Check your connection and come back, everything here will be waiting.")
                .font(.footnote)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal)
            Button("Close") { dismiss() }
                .buttonStyle(.bordered)
            Spacer()
        }
        .padding()
        .tint(Theme.violet)
    }

    var storeView: some View {
        SubscriptionStoreView(productIDs: [Config.plusYearlyID, Config.proYearlyID]) {
            VStack(spacing: 12) {
                Circle()
                    .fill(Theme.orbGradient)
                    .frame(width: 56, height: 56)
                    .accessibilityHidden(true)
                Text("Aura, at full strength")
                    .font(.title2.bold())
                Text("Your first month is free. Both plans include Aura's full AI brain and voice, in English and Hindi. Unlimited removes the daily usage cap. The free version always keeps reminders, birthdays and your data on this phone.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal)
            }
            .padding(.vertical)
        }
        .subscriptionStoreButtonLabel(.multiline)
        .storeButton(.visible, for: .restorePurchases)
        .subscriptionStorePolicyDestination(url: Config.privacyPolicyURL, for: .privacyPolicy)
        .subscriptionStorePolicyDestination(url: Config.termsURL, for: .termsOfService)
        .onInAppPurchaseCompletion { _, result in
            if case .success(.success) = result {
                await manager.refresh()
                dismiss()
            }
        }
        .tint(Theme.violet)
    }
}

// the consent moment app review requires: before the first ai message, name the
// provider, say exactly what travels, and get a clear yes. guideline 5.1.2(i).
struct ConsentView: View {
    @Environment(\.dismiss) private var dismiss
    let onDecision: (Bool) -> Void

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 20) {
                Label("Before Aura's AI switches on", systemImage: "sparkles")
                    .font(.title3.bold())
                    .padding(.top, 8)

                VStack(alignment: .leading, spacing: 14) {
                    row("paperplane", "When you chat, your message and the relevant parts of your Aura memory are sent to \(Config.aiProviderName) to write the reply.")
                    row("iphone", "Your memory itself stays in one file on this phone. Aura's relay server keeps nothing.")
                    row("hand.raised", "Decline and Aura still works: reminders, birthdays and the simpler offline brain, with nothing sent anywhere.")
                }
                .font(.subheadline)

                Link("Read the privacy policy", destination: Config.privacyPolicyURL)
                    .font(.footnote)

                Spacer()

                Button {
                    onDecision(true)
                    dismiss()
                } label: {
                    Text("Agree and switch on")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)

                Button("Not now, stay offline") {
                    onDecision(false)
                    dismiss()
                }
                .frame(maxWidth: .infinity)
                .foregroundStyle(.secondary)
            }
            .padding()
            .presentationDetents([.medium, .large])
        }
        .tint(Theme.violet)
    }

    // LocalizedStringKey, not String: the three disclosure bullets have finished
    // hindi translations and must actually reach them
    func row(_ icon: String, _ text: LocalizedStringKey) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: icon)
                .foregroundStyle(Theme.violet)
                .frame(width: 24)
            Text(text)
        }
    }
}
