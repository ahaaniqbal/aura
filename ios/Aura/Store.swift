// Store.swift, the palace lives on the phone. one JSON file in the app's
// documents folder. no server, no cloud, yours.

import Foundation
import Observation

@Observable
final class Store {
    static let shared = Store()

    var data = AppData()
    var thinking = false
    var settings = Settings()
    var requestedTab: String?   // set by a notification tap, consumed by RootView
    var trialMoment = false     // a free user just felt the "locked:" magic; offer the free month once

    struct Settings: Codable {
        var userName: String = ""
        var voiceReplies: Bool = false
        var locationNudges: Bool = false
        var aiConsent: Bool = false        // named-provider consent, guideline 5.1.2(i)
        var aiConsentAsked: Bool = false   // a decline is remembered, never re-nagged per send
        var speechLang: String = "auto"    // auto | en-IN | hi-IN
        var relayOverride: String = ""     // DEBUG only: point at a local relay
        var pendingDeadlineReminderId: String = "" // reminder waiting for its end time
        var calendarConnected: Bool = false        // user opted in to the Today calendar
        var trialOfferShown: Bool = false          // the one-time paywall at the first "locked:" moment
        var nameNudged: Bool = false               // the one-time "tell me your name" tip

        init() {}

        // settings files written by older builds miss the newer keys; decode
        // what exists and default the rest, so an update never resets anyone
        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            userName = try c.decodeIfPresent(String.self, forKey: .userName) ?? ""
            voiceReplies = try c.decodeIfPresent(Bool.self, forKey: .voiceReplies) ?? false
            locationNudges = try c.decodeIfPresent(Bool.self, forKey: .locationNudges) ?? false
            aiConsent = try c.decodeIfPresent(Bool.self, forKey: .aiConsent) ?? false
            aiConsentAsked = try c.decodeIfPresent(Bool.self, forKey: .aiConsentAsked) ?? false
            speechLang = try c.decodeIfPresent(String.self, forKey: .speechLang) ?? "auto"
            relayOverride = try c.decodeIfPresent(String.self, forKey: .relayOverride) ?? ""
            pendingDeadlineReminderId = try c.decodeIfPresent(String.self, forKey: .pendingDeadlineReminderId) ?? ""
            calendarConnected = try c.decodeIfPresent(Bool.self, forKey: .calendarConnected) ?? false
            trialOfferShown = try c.decodeIfPresent(Bool.self, forKey: .trialOfferShown) ?? false
            nameNudged = try c.decodeIfPresent(Bool.self, forKey: .nameNudged) ?? false
        }
    }

    private var fileURL: URL {
        FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("aura.json")
    }
    private var settingsURL: URL {
        FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("settings.json")
    }

    init() {
        if let raw = try? Data(contentsOf: fileURL), let d = try? JSONDecoder().decode(AppData.self, from: raw) {
            data = d
        }
        if let raw = try? Data(contentsOf: settingsURL), let s = try? JSONDecoder().decode(Settings.self, from: raw) {
            settings = s
        }
        #if DEBUG
        // headless test runs preset the gemini consent, so automated drives can
        // exercise the real ai path without tapping the consent sheet
        if ProcessInfo.processInfo.environment["AURA_DEV_CONSENT"] != nil {
            settings.aiConsent = true
            settings.aiConsentAsked = true
        }
        #endif
    }

    func save() {
        if let raw = try? JSONEncoder().encode(data) { try? raw.write(to: fileURL, options: .atomic) }
        Notifier.sync(data)
    }

    func saveSettings() {
        if let raw = try? JSONEncoder().encode(settings) { try? raw.write(to: settingsURL, options: .atomic) }
    }

    // read-only for views: never mutate state during a render pass.
    // decide() runs at mutation points (send, notes, foreground) instead.
    var pendingCard: Card? {
        data.cards.first { $0.status == "pending" }
    }

    // ---- chat ----

    private var sendQueue: [String] = []

    @MainActor
    func send(_ text: String) async {
        let msg = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !msg.isEmpty else { return }
        if thinking { sendQueue.append(msg); return } // never drop a message, answer it next
        data.messages.append(Message(role: "you", text: msg))
        thinking = true
        save()

        // a reminder is waiting for its end time: try this message as the answer
        // first, before spending a model call on it
        if let confirmation = tryAttachDeadline(msg) {
            data.messages.append(confirmation)
            thinking = false
            save()
            Notifier.maybeAsk()
            if settings.voiceReplies, SubscriptionManager.shared.canUseVoice() { Speech.speak(confirmation.text) }
            if !sendQueue.isEmpty {
                let next = sendQueue.removeFirst()
                await send(next)
            }
            return
        }

        let auth = SubscriptionManager.shared.relayAuth(settings: settings)
        let out = await Brain.think(msg, data: data, settings: settings, auth: auth)
        let remindersBefore = data.reminders.count
        let chips = Extractor.apply(out.extraction, to: &data)
        _ = CardEngine.decide(&data)
        var reply = scrub(out.reply)
        // aura asked "till when?" and this answer wasn't understood: say so
        // plainly and re-ask, never shrug with a generic line
        if out.mode == "offline", chips.isEmpty, !settings.pendingDeadlineReminderId.isEmpty,
           data.reminders.contains(where: { $0.id == settings.pendingDeadlineReminderId && $0.status == "open" && $0.at == nil }) {
            reply = String(localized: "didn't catch a time in that. say something like 6pm, in 2 hours, kal subah, or tomorrow morning.")
        }
        data.messages.append(Message(role: "aura", text: reply, chips: chips))
        // every task needs an end. a fresh reminder without one gets the question,
        // and the next message can answer it.
        if let ask = deadlineAsk(newSince: remindersBefore) {
            data.messages.append(ask)
        } else if !chips.isEmpty, settings.userName.isEmpty, !settings.nameNudged {
            // one-time warmth tip, never in the same breath as a question
            settings.nameNudged = true
            saveSettings()
            data.messages.append(Message(role: "aura",
                text: String(localized: "btw, tell me your name in settings and the today screen will greet you properly.")))
        }
        thinking = false
        save()
        if !out.extraction.reminders.isEmpty || out.extraction.people.contains(where: { $0.birthday != nil }) {
            Notifier.maybeAsk() // first reminder or birthday: now the permission ask has context
        }
        if settings.voiceReplies, SubscriptionManager.shared.canUseVoice() { Speech.speak(out.reply) }
        if !sendQueue.isEmpty {
            let next = sendQueue.removeFirst()
            await send(next)
        }
    }

    // the message answers "till when?": attach the deadline and confirm the
    // four-nudge plan. nil means it wasn't an answer and normal thinking runs.
    private func tryAttachDeadline(_ msg: String) -> Message? {
        guard !settings.pendingDeadlineReminderId.isEmpty else { return nil }
        guard let i = data.reminders.firstIndex(where: { $0.id == settings.pendingDeadlineReminderId && $0.status == "open" }) else {
            settings.pendingDeadlineReminderId = ""
            saveSettings()
            return nil
        }
        guard data.reminders[i].at == nil else {
            settings.pendingDeadlineReminderId = ""
            saveSettings()
            return nil
        }
        guard let at = DateKit.parseDeadline(msg, anchorDay: data.reminders[i].when), at > nowMs() else { return nil }
        data.reminders[i].at = at
        data.reminders[i].when = nil
        settings.pendingDeadlineReminderId = ""
        saveSettings()
        // the "locked:" moment is peak trust: the right second to offer the free
        // month, exactly once, to free users
        if SubscriptionManager.shared.tier == .free, !settings.trialOfferShown {
            trialMoment = true
        }
        let label = DateKit.timeLabel(at)
        return Message(role: "aura",
                       text: String(localized: "locked: \(label). i'll nudge you four times between now and then."),
                       chips: [Chip(label: label, tone: "date")])
    }

    // a new reminder with no end time triggers the question. place reminders are
    // exempt: they end when you reach the place.
    private func deadlineAsk(newSince count: Int) -> Message? {
        guard data.reminders.count > count else { return nil }
        guard let r = data.reminders[count...].first(where: { $0.at == nil && $0.place == nil && $0.status == "open" }) else { return nil }
        settings.pendingDeadlineReminderId = r.id
        saveSettings()
        return Message(role: "aura",
                       text: String(localized: "till when do you want this done? say a time like 6pm, or in 2 hours."))
    }

    @MainActor
    func addNote(_ text: String) async {
        let msg = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !msg.isEmpty else { return }
        let ex = await Brain.extractOnly(msg, settings: settings,
                                         auth: SubscriptionManager.shared.relayAuth(settings: settings))
        let chips = Extractor.apply(ex, to: &data)
        data.notes.append(NoteItem(text: msg, chips: chips))
        _ = CardEngine.decide(&data)
        save()
    }

    // ---- cards ----

    func resolveCard(_ id: String, approve: Bool) -> Card? {
        let card = CardEngine.resolve(&data, id: id, approve: approve)
        _ = CardEngine.decide(&data) // the next card in line surfaces immediately, like the web version
        save()
        return card
    }

    // ---- people crud ----

    func updatePerson(_ id: String, relation: String? = nil, birthday: String? = nil, note: String? = nil, want: String? = nil) {
        guard let i = data.people.firstIndex(where: { $0.id == id }) else { return }
        if let relation { data.people[i].relation = relation.isEmpty ? nil : relation }
        if let birthday, let bd = DateKit.parseMonthDay(birthday) { data.people[i].birthday = bd }
        if let note, !note.isEmpty {
            data.people[i].notes.append(PersonNote(text: scrub(note)))
            data.people[i].mentionedAt = nowMs()
        }
        if let want, !want.isEmpty, !data.people[i].wants.contains(want) { data.people[i].wants.append(scrub(want)) }
        save()
    }

    func deletePerson(_ id: String) { data.people.removeAll { $0.id == id }; save() }
    func deleteReminder(_ id: String) { data.reminders.removeAll { $0.id == id }; save() }
    func deletePromise(_ id: String) { data.promises.removeAll { $0.id == id }; save() }
    func deleteNote(_ id: String) { data.notes.removeAll { $0.id == id }; save() }

    // a reminder finished outside its card (notification action, list row) must
    // also release the card, or the one-card pipeline jams on a done task
    private func releaseCard(for refId: String, approve: Bool) {
        guard let c = data.cards.firstIndex(where: { $0.status == "pending" && $0.refId == refId }) else { return }
        data.cards[c].status = approve ? "approved" : "dismissed"
        data.cards[c].resolvedAt = nowMs()
        _ = CardEngine.decide(&data) // the next card in line surfaces immediately
    }

    func reminderDone(_ id: String) {
        guard let i = data.reminders.firstIndex(where: { $0.id == id }) else { return }
        data.reminders[i].status = "done"
        releaseCard(for: id, approve: true)
        save()
    }
    func snoozeReminder(_ id: String, minutes: Int) {
        guard let i = data.reminders.firstIndex(where: { $0.id == id }) else { return }
        data.reminders[i].at = nowMs() + Int64(minutes) * 60_000
        data.reminders[i].when = nil
        releaseCard(for: id, approve: false)
        save()
    }
    func promiseDone(_ id: String) {
        if let i = data.promises.firstIndex(where: { $0.id == id }) { data.promises[i].status = "done"; data.promises[i].doneAt = nowMs(); save() }
    }

    func logPulse(_ valence: Int, mood: String) {
        data.pulse.append(PulseEntry(valence: valence, mood: mood))
        save()
    }

    // ---- data ----

    func exportJSON() -> URL? {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("aura-export-\(DateKit.todayString()).json")
        guard let raw = try? JSONEncoder().encode(data) else { return nil }
        try? raw.write(to: url)
        return url
    }

    func importJSON(_ url: URL) -> Bool {
        let secured = url.startAccessingSecurityScopedResource()
        defer { if secured { url.stopAccessingSecurityScopedResource() } }
        guard let raw = try? Data(contentsOf: url), var d = try? JSONDecoder().decode(AppData.self, from: raw) else { return false }
        // imported files are untrusted: a malformed birthday must never enter the palace
        for i in d.people.indices where d.people[i].birthday != nil {
            if !DateKit.validMonthDay(d.people[i].birthday!) {
                d.people[i].birthday = DateKit.parseMonthDay(d.people[i].birthday)
            }
        }
        data = d
        save()
        return true
    }

    func wipe() {
        // a wipe always leaves a backup file in documents first
        let stamp = DateKit.todayString() + "-" + String(nowMs())
        let backup = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("backup-\(stamp).json")
        if let raw = try? JSONEncoder().encode(data) { try? raw.write(to: backup) }
        data = AppData()
        save()
    }
}
