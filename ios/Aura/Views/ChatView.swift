// ChatView.swift, the thread. talk or dictate, aura files what matters.
// the consent sheet gates the first ai message, voice is a pro feature, and
// the free floor never stops answering.

import SwiftUI
import UIKit

struct ChatView: View {
    @Bindable var store: Store
    @State private var draft = ""
    @State private var listener = Listener()
    @State private var showPaywall = false
    @State private var showConsent = false
    @State private var pendingText: String?
    private var manager: SubscriptionManager { SubscriptionManager.shared }

    // String(localized:) so a hindi user sees hindi suggestions and tapping one
    // inserts hindi into the draft, teaching them to talk to aura in their language
    static var starters: [String] {
        [String(localized: "sam's birthday is june 28th, he's obsessed with chocolate cake"),
         String(localized: "remind me to call mom tomorrow"),
         String(localized: "i owe jake a coffee by friday"),
         String(localized: "remind me to get medicines when i'm at the pharmacy")]
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                ScrollViewReader { proxy in
                    ScrollView {
                        VStack(alignment: .leading, spacing: 12) {
                            if store.data.messages.isEmpty { startersView }
                            ForEach(store.data.messages) { m in
                                MessageRow(message: m)
                            }
                            if store.thinking {
                                HStack(spacing: 8) {
                                    ProgressView().controlSize(.small)
                                    Text("aura is thinking…")
                                        .font(.footnote).foregroundStyle(.secondary)
                                }
                                .id("thinking")
                            }
                            if let card = store.pendingCard {
                                CardView(card: card, store: store)
                            }
                        }
                        .padding()
                        .animation(.snappy, value: store.data.messages.count)
                    }
                    .scrollDismissesKeyboard(.interactively)
                    .onChange(of: store.data.messages.count) {
                        if let last = store.data.messages.last { withAnimation { proxy.scrollTo(last.id, anchor: .bottom) } }
                    }
                }
                if manager.tier == .free { upsellBanner }
                inputBar
            }
            .background(Theme.bg)
            .navigationTitle("aura")
            .navigationBarTitleDisplayMode(.inline)
        }
        .onChange(of: listener.transcript) { _, t in
            if !t.isEmpty { draft = t }
        }
        // the one-time free-month offer, right after the first "locked:" moment,
        // when the product has just proven itself
        .onChange(of: store.trialMoment) { _, show in
            guard show else { return }
            store.trialMoment = false
            store.settings.trialOfferShown = true
            store.saveSettings()
            Task {
                try? await Task.sleep(for: .seconds(1.2))
                showPaywall = true
            }
        }
        .sheet(isPresented: $showPaywall) { PaywallView() }
        .sheet(isPresented: $showConsent, onDismiss: {
            // swiped away without deciding: hand the message back, never lose it
            if let text = pendingText {
                pendingText = nil
                draft = text
            }
        }) {
            ConsentView { agreed in
                store.settings.aiConsent = agreed
                store.settings.aiConsentAsked = true // a decline is remembered, not re-nagged
                store.saveSettings()
                if let text = pendingText {
                    pendingText = nil
                    Task { await store.send(text) } // ai brain if agreed, offline floor if not
                }
            }
        }
    }

    var startersView: some View {
        VStack(alignment: .leading, spacing: 8) {
            Circle()
                .fill(Theme.orbGradient)
                .frame(width: 44, height: 44)
                .frame(maxWidth: .infinity)
                .padding(.top, 24)
                .accessibilityHidden(true)
            Text("this is our thread. i remember everything you tell me here, in english ya hindi.")
                .foregroundStyle(.secondary).frame(maxWidth: .infinity)
                .multilineTextAlignment(.center)
            Text("Try saying")
                .font(.footnote.weight(.semibold))
                .foregroundStyle(Theme.violet)
                .textCase(.uppercase)
                .padding(.top, 12)
            ForEach(Self.starters, id: \.self) { s in
                Button {
                    draft = s
                } label: {
                    HStack(alignment: .top, spacing: 8) {
                        Image(systemName: "arrow.turn.down.right")
                            .font(.caption)
                            .foregroundStyle(Theme.violet)
                            .padding(.top, 3)
                        Text(s).multilineTextAlignment(.leading)
                    }
                    .font(.subheadline)
                    .padding(12)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Theme.surface, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                }
                .foregroundStyle(.primary)
            }
        }
    }

    var upsellBanner: some View {
        Button {
            showPaywall = true
        } label: {
            HStack(spacing: 6) {
                Image(systemName: "sparkles")
                Text("Your first month of the full brain is free. Switch it on")
                Image(systemName: "chevron.right").font(.caption2)
            }
            .font(.footnote.weight(.medium))
            .foregroundStyle(Theme.violet)
            .padding(.horizontal, 12).padding(.vertical, 7)
            .background(Theme.softViolet, in: Capsule())
        }
        .padding(.bottom, 4)
        .accessibilityLabel(Text("Unlock Aura Plus"))
    }

    var inputBar: some View {
        HStack(spacing: 10) {
            Button {
                if manager.canUseVoice() {
                    listener.toggle()
                } else {
                    showPaywall = true
                }
            } label: {
                Image(systemName: listener.isRecording ? "mic.fill" : "mic")
                    .symbolEffect(.pulse, isActive: listener.isRecording)
                    .foregroundStyle(listener.isRecording ? Theme.pink : Color.secondary)
                    .frame(width: 38, height: 38)
                    .background(Theme.surface, in: Circle())
                    .overlay(alignment: .bottomTrailing) {
                        if !manager.canUseVoice() {
                            Image(systemName: "lock.fill")
                                .font(.system(size: 9))
                                .foregroundStyle(.secondary)
                                .padding(3)
                                .background(Theme.bg, in: Circle())
                        }
                    }
            }
            .accessibilityLabel(listener.isRecording ? Text("Stop dictation") : Text("Dictate"))

            TextField("tell me anything…", text: $draft, axis: .vertical)
                .lineLimit(1...4)
                .padding(.horizontal, 14).padding(.vertical, 9)
                .background(Theme.surface, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
                .onSubmit(sendNow)

            Button(action: sendNow) {
                Image(systemName: "arrow.up.circle.fill")
                    .font(.system(size: 32))
                    .foregroundStyle(draft.isEmpty ? Color.secondary.opacity(0.5) : Theme.violet)
            }
            .disabled(draft.isEmpty)
            .accessibilityLabel(Text("Send"))
        }
        .padding(.horizontal).padding(.vertical, 8)
        .background(.bar)
    }

    func sendNow() {
        guard !draft.isEmpty else { return }
        if listener.isRecording { listener.stop() }
        listener.transcript = "" // a late recognition callback must not refill the field
        let text = draft
        draft = ""
        // the first ai message asks for the named-provider consent, exactly once.
        // a remembered decline means offline sends with no nagging; settings can
        // switch ai chat on later.
        if manager.tier >= .plus, !store.settings.aiConsent, !store.settings.aiConsentAsked {
            pendingText = text
            showConsent = true
            return
        }
        Task { await store.send(text) }
    }
}

struct MessageRow: View {
    @Environment(\.openURL) private var openURL
    let message: Message

    var isYou: Bool { message.role == "you" }

    var body: some View {
        VStack(alignment: isYou ? .trailing : .leading, spacing: 4) {
            Text(message.text)
                .padding(.horizontal, 14).padding(.vertical, 9)
                .background {
                    if isYou {
                        RoundedRectangle(cornerRadius: 18, style: .continuous).fill(Theme.bubbleGradient)
                    } else {
                        RoundedRectangle(cornerRadius: 18, style: .continuous).fill(Theme.surface)
                    }
                }
                .foregroundStyle(isYou ? .white : .primary)
                .contextMenu {
                    Button {
                        UIPasteboard.general.string = message.text
                    } label: { Label("Copy", systemImage: "doc.on.doc") }
                    if !isYou {
                        Button(role: .destructive) {
                            // URLComponents escapes '&' and friends correctly; if no
                            // mail app answers, the report lands on the pasteboard
                            var comp = URLComponents()
                            comp.scheme = "mailto"
                            comp.path = Config.supportEmail
                            comp.queryItems = [
                                URLQueryItem(name: "subject", value: "aura: reported response"),
                                URLQueryItem(name: "body", value: message.text),
                            ]
                            if let url = comp.url {
                                openURL(url) { accepted in
                                    if !accepted {
                                        UIPasteboard.general.string =
                                            "to: \(Config.supportEmail)\nsubject: aura: reported response\n\n\(message.text)"
                                    }
                                }
                            }
                        } label: { Label("Report this response", systemImage: "flag") }
                    }
                }
            if let chips = message.chips, !chips.isEmpty { ChipRow(chips: chips) }
        }
        .frame(maxWidth: .infinity, alignment: isYou ? .trailing : .leading)
        .id(message.id)
    }
}
