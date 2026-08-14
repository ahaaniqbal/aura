// MoreView.swift, settings: your plan, your voice, your data. calm controls,
// no dark patterns, and the whole privacy story in plain words.

import SwiftUI
import UIKit
import UniformTypeIdentifiers

struct MoreView: View {
    @Environment(\.openURL) private var openURL
    @Bindable var store: Store
    private var manager: SubscriptionManager { SubscriptionManager.shared }

    @State private var importing = false
    @State private var importResult = ""
    @State private var confirmWipe = false
    @State private var exportURL: URL?
    @State private var showPaywall = false
    @State private var showConsent = false
    @State private var manageSubs = false
    #if DEBUG
    @State private var devKeyDraft = ""
    #endif

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    HStack {
                        Circle().fill(Theme.orbGradient).frame(width: 34, height: 34)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(manager.tier.label).font(.headline)
                            Text(planCaption).font(.caption).foregroundStyle(.secondary)
                        }
                        Spacer()
                        if manager.tier < .pro {
                            Button("Upgrade") { showPaywall = true }
                                .buttonStyle(.borderedProminent)
                                .controlSize(.small)
                        }
                    }
                    if manager.tier > .free {
                        Button("Manage subscription") { manageSubs = true }
                    }
                } header: { Text("Your plan") } footer: {
                    Text("Free always includes reminders, birthdays, place nudges and the offline brain. Paid plans start with a free month and add the full AI brain and voice; Unlimited removes the daily cap.")
                }

                Section("You") {
                    TextField("Your name, for the greeting", text: $store.settings.userName)
                        .onChange(of: store.settings.userName) { store.saveSettings() }
                    Picker("Voice language", selection: $store.settings.speechLang) {
                        Text("Automatic").tag("auto")
                        Text("English (India)").tag("en-IN")
                        Text("हिन्दी").tag("hi-IN")
                    }
                    .onChange(of: store.settings.speechLang) { store.saveSettings() }
                    if manager.canUseVoice() {
                        Toggle("Spoken replies", isOn: $store.settings.voiceReplies)
                            .onChange(of: store.settings.voiceReplies) { _, on in
                                store.saveSettings()
                                if on { Speech.speak(String(localized: "voice replies are on")) }
                            }
                    } else {
                        Button {
                            showPaywall = true
                        } label: {
                            HStack {
                                Text("Spoken replies").foregroundStyle(.primary)
                                Spacer()
                                Image(systemName: "lock.fill").foregroundStyle(.secondary)
                            }
                        }
                    }
                }

                Section {
                    if store.settings.aiConsent {
                        Label("AI chat is on, via \(Config.aiProviderName)", systemImage: "checkmark.circle.fill")
                            .foregroundStyle(Theme.mint)
                            .font(.subheadline)
                        Button("Turn AI chat off") {
                            store.settings.aiConsent = false
                            store.saveSettings()
                        }
                    } else {
                        Button("Switch on AI chat") {
                            if manager.tier >= .plus { showConsent = true } else { showPaywall = true }
                        }
                    }
                    Link("Privacy policy", destination: Config.privacyPolicyURL)
                    Button("Report a problem") {
                        var comp = URLComponents()
                        comp.scheme = "mailto"
                        comp.path = Config.supportEmail
                        comp.queryItems = [URLQueryItem(name: "subject", value: "aura: problem report")]
                        if let url = comp.url {
                            openURL(url) { accepted in
                                if !accepted { UIPasteboard.general.string = Config.supportEmail }
                            }
                        }
                    }
                } header: { Text("AI & privacy") } footer: {
                    Text("With AI chat on, your message and the relevant parts of your memory are sent to \(Config.aiProviderName) to write replies. Your memory itself stays in one file on this phone. Aura's relay keeps nothing.")
                }

                Section {
                    Toggle("Show calendar in Today", isOn: $store.settings.calendarConnected)
                        .onChange(of: store.settings.calendarConnected) { _, on in
                            store.saveSettings()
                            if on, !CalendarKit.hasAccess {
                                Task {
                                    if await CalendarKit.requestAccess() == false {
                                        store.settings.calendarConnected = false
                                        store.saveSettings()
                                    }
                                }
                            }
                        }
                    if store.settings.calendarConnected, CalendarKit.denied {
                        Button {
                            if let url = URL(string: UIApplication.openSettingsURLString) { openURL(url) }
                        } label: {
                            Label("Calendar access is off for Aura. Open Settings", systemImage: "exclamationmark.triangle")
                                .font(.footnote).foregroundStyle(.orange)
                        }
                    }
                    Button(importResult.isEmpty ? String(localized: "Import birthdays from Contacts") : importResult) {
                        Task {
                            let n = await ContactsImport.run(into: store)
                            importResult = n < 0 ? String(localized: "Contacts access is off for Aura")
                                : String(localized: "Imported \(max(n, 0)) people with birthdays")
                        }
                    }
                } header: { Text("Connections") } footer: {
                    Text("Calendar and contacts are read on this phone and never leave it. iPhone gives no app access to SMS or WhatsApp, so Aura does not ask.")
                }

                Section {
                    Button("Allow notifications") { Task { _ = await Notifier.requestPermission() } }
                    Toggle("Location nudges", isOn: $store.settings.locationNudges)
                        .onChange(of: store.settings.locationNudges) { _, on in
                            store.saveSettings()
                            on ? LocationKit.shared.start() : LocationKit.shared.stop()
                        }
                    if store.settings.locationNudges, locationHint != nil {
                        Button {
                            if let url = URL(string: UIApplication.openSettingsURLString) { openURL(url) }
                        } label: {
                            Label(locationHint ?? "", systemImage: "exclamationmark.triangle")
                                .font(.footnote)
                                .foregroundStyle(.orange)
                        }
                    }
                } header: { Text("Notifications & location") } footer: {
                    Text("Timed reminders and birthdays fire as real notifications, app closed, scheduled by iOS itself. Place nudges work best with location set to Always, so iOS can wake Aura when you're out.")
                }

                Section {
                    if let url = exportURL {
                        ShareLink(item: url) { Text("Export everything") }
                    }
                    Button("Import an Aura backup") { importing = true }
                    Button("Forget everything", role: .destructive) { confirmWipe = true }
                } header: { Text("Your data") } footer: {
                    Text("Everything Aura knows lives in one file on this phone. Export it any time, take it anywhere. That is the deal, in one line.")
                }

                #if DEBUG
                Section {
                    SecureField("Gemini API key (dev only)", text: $devKeyDraft)
                    Button("Save dev key") {
                        Keychain.set(devKeyDraft.trimmingCharacters(in: .whitespaces), for: "dev-gemini-key")
                        devKeyDraft = ""
                        Task { await manager.refresh() }
                    }
                    .disabled(devKeyDraft.isEmpty)
                    TextField("Relay URL override", text: $store.settings.relayOverride)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .onChange(of: store.settings.relayOverride) { store.saveSettings() }
                } header: { Text("Developer") } footer: {
                    Text("Debug builds only. A dev key unlocks Pro locally and talks to Gemini directly, no relay needed.")
                }
                #endif

                Section {
                    Text("aura remembers your people, your promises and your plans, then surfaces one calm card when something matters. nothing happens without you.")
                        .font(.footnote).foregroundStyle(.secondary)
                    Text("Version \(Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "2.0")")
                        .font(.footnote).foregroundStyle(.secondary)
                }
            }
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .onAppear { exportURL = store.exportJSON() }
            .sheet(isPresented: $showPaywall) { PaywallView() }
            .sheet(isPresented: $showConsent) {
                ConsentView { agreed in
                    store.settings.aiConsent = agreed
                    store.settings.aiConsentAsked = true
                    store.saveSettings()
                }
            }
            .manageSubscriptionsSheet(isPresented: $manageSubs)
            .fileImporter(isPresented: $importing, allowedContentTypes: [.json]) { result in
                if case .success(let url) = result { _ = store.importJSON(url) }
            }
            .confirmationDialog("Aura will forget everything: people, promises, chat, notes. A backup file stays in the app's documents, your settings stay. Sure?",
                                isPresented: $confirmWipe, titleVisibility: .visible) {
                Button("Forget everything", role: .destructive) { store.wipe() }
            }
        }
    }

    var planCaption: String {
        switch manager.tier {
        case .free: return String(localized: "Reminders, birthdays, offline brain")
        case .plus: return String(localized: "Full AI brain + voice, generous daily use")
        case .pro: return String(localized: "Everything, no daily limit")
        }
    }

    var locationHint: String? {
        switch LocationKit.shared.status {
        case .denied, .restricted:
            return String(localized: "Location is off for Aura. Open Settings")
        case .authorizedWhenInUse:
            return String(localized: "Set location to Always for nudges with the app closed")
        default:
            return nil
        }
    }
}
