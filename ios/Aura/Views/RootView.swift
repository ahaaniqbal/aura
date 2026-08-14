// RootView.swift, the shell: five tabs, one calm surface.

import SwiftUI

struct RootView: View {
    @Environment(\.scenePhase) private var scenePhase
    @State private var store = Store.shared
    @State private var tab = "today"
    @State private var showPaywall = false

    var body: some View {
        TabView(selection: $tab) {
            TodayView(store: store)
                .tabItem { Label("Today", systemImage: "sun.max.fill") }.tag("today")
            ChatView(store: store)
                .tabItem { Label("Chat", systemImage: "bubble.left.and.bubble.right.fill") }.tag("chat")
            PeopleView(store: store)
                .tabItem { Label("People", systemImage: "person.2.fill") }.tag("people")
            NotesView(store: store)
                .tabItem { Label("Notes", systemImage: "note.text") }.tag("notes")
            MoreView(store: store)
                .tabItem { Label("Settings", systemImage: "gearshape.fill") }.tag("more")
        }
        .tint(Theme.violet)
        // a notification tap lands on the right tab
        .onChange(of: store.requestedTab) { _, requested in
            if let requested { tab = requested; store.requestedTab = nil }
        }
        // deep links, also usable from apple shortcuts:
        // aura://say?text=…  aura://note?text=…  aura://card?action=approve|dismiss  aura://tab?name=people
        .onOpenURL { url in
            guard url.scheme == "aura" else { return }
            let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems
            let text = items?.first { $0.name == "text" }?.value ?? ""
            switch url.host {
            case "say": if !text.isEmpty { tab = "chat"; Task { await store.send(text) } }
            case "note": if !text.isEmpty { Task { await store.addNote(text) } }
            case "card":
                let action = items?.first { $0.name == "action" }?.value ?? "approve"
                if let card = store.pendingCard { _ = store.resolveCard(card.id, approve: action == "approve") }
            case "tab":
                let name = items?.first { $0.name == "name" }?.value ?? "today"
                if ["today", "chat", "people", "notes", "more"].contains(name) { tab = name }
            case "paywall":
                showPaywall = true
            default: break
            }
        }
        .sheet(isPresented: $showPaywall) { PaywallView() }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active {
                _ = CardEngine.decide(&store.data)
                store.save()
                if store.settings.locationNudges { LocationKit.shared.start() }
                Task { await SubscriptionManager.shared.refresh() }
            }
        }
        // the in-app heartbeat: a timed reminder that comes due while you're looking
        // at aura becomes the card within half a minute (ios notifications cover closed)
        .onReceive(Timer.publish(every: 30, on: .main, in: .common).autoconnect()) { _ in
            if store.pendingCard == nil, CardEngine.decide(&store.data) != nil {
                store.save()
            }
        }
    }
}

struct ChipRow: View {
    let chips: [Chip]
    var body: some View {
        HStack(spacing: 5) {
            ForEach(chips.indices, id: \.self) { i in
                let chip = chips[i]
                Text(chip.label)
                    .font(.caption2.weight(.semibold))
                    .padding(.horizontal, 8).padding(.vertical, 3)
                    .background(Theme.toneColor(chip.tone).opacity(0.14), in: Capsule())
                    .foregroundStyle(Theme.toneColor(chip.tone))
            }
        }
        .accessibilityElement(children: .combine)
    }
}

// the draft share sheet: birthday and check-in notes go where your people
// actually are (whatsapp, messages), not into an email app nobody configured
struct ShareItem: Identifiable {
    let id = UUID()
    let text: String
}

struct ActivityView: UIViewControllerRepresentable {
    let text: String
    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: [text], applicationActivities: nil)
    }
    func updateUIViewController(_ vc: UIActivityViewController, context: Context) {}
}

struct CardView: View {
    let card: Card
    let store: Store
    @State private var resolved = false
    @State private var shareItem: ShareItem?

    var kindLabel: LocalizedStringKey {
        switch card.type {
        case "birthday": return "Birthday"
        case "promise": return "Promise"
        case "drift": return "Gone quiet"
        case "place": return "You're nearby"
        case "trial": return "Checking in"
        default: return "Reminder"
        }
    }
    var kindTone: String {
        card.type == "birthday" ? "gift" : card.type == "place" ? "place" : card.type == "trial" ? "person" : "date"
    }
    var approveLabel: LocalizedStringKey {
        if card.draft != nil {
            switch card.type {
            case "birthday": return "Draft the note"
            case "drift": return "Say hi"
            default: return "Draft a message"
            }
        }
        return "Done"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text(kindLabel)
                    .font(.caption.weight(.semibold))
                    .padding(.horizontal, 10).padding(.vertical, 4)
                    .background(Theme.toneColor(kindTone).opacity(0.14), in: Capsule())
                    .foregroundStyle(Theme.toneColor(kindTone))
                Spacer()
                Image(systemName: "sparkle")
                    .font(.caption)
                    .foregroundStyle(Theme.violet)
                    .accessibilityHidden(true)
            }
            Text(card.title)
                .font(.title3.weight(.semibold))
                .fixedSize(horizontal: false, vertical: true)
            Text(card.body)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
            if let draft = card.draft {
                HStack(spacing: 10) {
                    RoundedRectangle(cornerRadius: 2)
                        .fill(Theme.violet.opacity(0.5))
                        .frame(width: 3)
                    Text(draft.body)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
                .padding(12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Theme.softViolet, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            }
            HStack(spacing: 12) {
                Button {
                    if let d = card.draft {
                        // share first; the card resolves when the sheet closes,
                        // so it stays visibly underneath instead of vanishing
                        shareItem = ShareItem(text: d.body)
                    } else {
                        resolved = true
                        _ = store.resolveCard(card.id, approve: true)
                    }
                } label: {
                    Text(approveLabel).frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.regular)

                Button("Not now") {
                    resolved = true
                    _ = store.resolveCard(card.id, approve: false)
                }
                .buttonStyle(.bordered)
                .foregroundStyle(.secondary)
            }
            .font(.subheadline.weight(.semibold))
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.surface, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        .shadow(color: Theme.violet.opacity(0.10), radius: 14, y: 6)
        .sensoryFeedback(.success, trigger: resolved)
        .transition(.scale(scale: 0.97).combined(with: .opacity))
        .sheet(item: $shareItem, onDismiss: {
            resolved = true
            _ = store.resolveCard(card.id, approve: true)
        }) { item in
            ActivityView(text: item.text)
                .presentationDetents([.medium])
        }
    }
}
