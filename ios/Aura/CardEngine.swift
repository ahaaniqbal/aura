// CardEngine.swift, the one-card rule. aura surfaces at most one pending card,
// in priority order: exact-time reminder, due-today reminder, birthday, promise, drift.

import Foundation

enum CardEngine {

    static func firstName(_ name: String?) -> String {
        (name ?? "").split(separator: " ").first.map(String.init) ?? (name ?? "")
    }

    static func birthdayDraft(_ p: Person) -> Draft {
        let want = p.wants.first
        return Draft(
            subject: "happy birthday, \(firstName(p.name))! 🎂",
            body: "happy birthday \(firstName(p.name))!! hope today is a good one\(want.map { ", and that there's \($0) involved" } ?? ""). thinking of you ❤️"
        )
    }

    static func checkinDraft(_ p: Person) -> Draft {
        Draft(
            subject: "hey \(firstName(p.name)) 👋",
            body: "hey \(firstName(p.name)), you crossed my mind today. it's been a minute, how are you doing?\(p.interests.first.map { " still into \($0)?" } ?? "")"
        )
    }

    static func promiseDraft(_ pr: PromiseItem) -> Draft {
        Draft(
            subject: "haven't forgotten",
            body: "hey\(pr.person.map { " \(firstName($0))" } ?? ""), haven't forgotten about this: \(pr.text). on it\(pr.due.map { ", \(DateKit.dayLabel($0))" } ?? "")."
        )
    }

    // compute (and persist) the one pending card
    @discardableResult
    static func decide(_ d: inout AppData) -> Card? {
        if let pending = d.cards.first(where: { $0.status == "pending" }) { return pending }
        let t = DateKit.todayString()
        let year = Calendar.current.component(.year, from: Date())

        // 1a. an exact-time reminder that just arrived
        for r in d.reminders where r.status == "open" {
            guard let at = r.at, at <= nowMs(), d.nudged["rem:\(r.id):\(at)"] == nil else { continue }
            d.nudged["rem:\(r.id):\(at)"] = nowMs()
            let late = nowMs() - at > 10 * 60_000
            return push(&d, Card(type: "reminder", title: r.text,
                                 body: late ? "this was set for \(DateKit.timeLabel(at))." : "it's time. you asked me to bring this back right now.",
                                 refId: r.id))
        }

        // 1b. a reminder due today
        for r in d.reminders where r.status == "open" {
            guard let when = r.when, when <= t, d.nudged["rem:\(r.id):\(t)"] == nil else { continue }
            return push(&d, Card(type: "reminder", title: r.text,
                                 body: when < t ? "this slipped, it was due \(DateKit.dayLabel(when)). still want to do it today?" : "you asked me to bring this back today.",
                                 refId: r.id))
        }

        // 2. a birthday coming up (once per person per year)
        for p in d.people {
            guard let n = DateKit.daysUntilBirthday(p.birthday), n <= 7, d.nudged["bday:\(p.id):\(year)"] == nil else { continue }
            return push(&d, Card(type: "birthday",
                                 title: "\(p.name.lowercased())'s birthday is \(DateKit.birthdayLabel(p.birthday))",
                                 body: p.wants.first.map { "they're obsessed with \($0). want me to draft them a note?" } ?? "want me to draft them a little note?",
                                 personId: p.id, draft: birthdayDraft(p)))
        }

        // 3. a promise coming due
        for pr in d.promises where pr.status == "open" && pr.direction == "i_owe" {
            guard let due = pr.due, due <= DateKit.addDaysString(2), d.nudged["prom:\(pr.id):\(t)"] == nil else { continue }
            return push(&d, Card(type: "promise",
                                 title: "you promised\(pr.person.map { " \($0.lowercased())" } ?? ""): \(pr.text)",
                                 body: "\(due < t ? "this one's overdue" : "due \(DateKit.dayLabel(due))"). want to close the loop?",
                                 personId: d.people.first { $0.name == pr.person }?.id,
                                 refId: pr.id, draft: pr.person != nil ? promiseDraft(pr) : nil))
        }

        // 4. a friend drifting (max one drift card a week)
        let lastDrift = d.nudged["drift:last"] ?? 0
        if nowMs() - lastDrift > 7 * 86_400_000 {
            let cutoff = nowMs() - 21 * 86_400_000
            let quiet = d.people
                .filter { ["friend", "family", "partner"].contains($0.relation ?? "") && $0.mentionedAt < cutoff }
                .filter { (d.nudged["drift:\($0.id)"] ?? 0) < nowMs() - 30 * 86_400_000 }
                .min { $0.mentionedAt < $1.mentionedAt }
            if let quiet {
                return push(&d, Card(type: "drift",
                                     title: "\(quiet.name.lowercased()) has gone a little quiet",
                                     body: "it's been a few weeks since they came up. a tiny hello goes a long way.",
                                     personId: quiet.id, draft: checkinDraft(quiet)))
            }
        }

        // 5. the free month is ending: ask the honest question, exactly once
        if let start = d.nudged["trial:start"], d.nudged["trial:card"] == nil,
           nowMs() - start > 25 * 86_400_000, nowMs() - start < 45 * 86_400_000 {
            d.nudged["trial:card"] = nowMs()
            return push(&d, Card(type: "trial",
                                 title: String(localized: "was this month worth it?"),
                                 body: String(localized: "your free month is ending soon. if aura earned its place, do nothing, your plan simply continues. if not, cancel anytime in your app store settings, no hard feelings.")))
        }
        return nil
    }

    // a place reminder matched where the user is right now
    static func placeCard(_ d: inout AppData, reminder: Reminder, placeName: String?) -> Card {
        d.nudged["place:\(reminder.id):\(DateKit.todayString())"] = nowMs()
        return push(&d, Card(type: "place", title: reminder.text,
                             body: "you're near \((placeName ?? reminder.place ?? "it").lowercased()). good moment?",
                             refId: reminder.id))
    }

    private static func push(_ d: inout AppData, _ card: Card) -> Card {
        d.cards.append(card)
        return card
    }

    // approve or dismiss the one card. approving acts, dismissing snoozes.
    static func resolve(_ d: inout AppData, id: String, approve: Bool) -> Card? {
        guard let i = d.cards.firstIndex(where: { $0.id == id && $0.status == "pending" }) else { return nil }
        d.cards[i].status = approve ? "approved" : "dismissed"
        d.cards[i].resolvedAt = nowMs()
        let card = d.cards[i]
        let t = DateKit.todayString()

        if card.type == "reminder" || card.type == "place" {
            if let ri = d.reminders.firstIndex(where: { $0.id == card.refId }) {
                if approve { d.reminders[ri].status = "done" }
                else if d.reminders[ri].at != nil { d.reminders[ri].at = nowMs() + 10 * 60_000 } // snooze ten minutes
                else { d.nudged["\(card.type == "place" ? "place" : "rem"):\(d.reminders[ri].id):\(t)"] = nowMs() }
            }
        }
        if card.type == "birthday", let pid = card.personId {
            d.nudged["bday:\(pid):\(Calendar.current.component(.year, from: Date()))"] = nowMs()
        }
        if card.type == "promise", let rid = card.refId {
            d.nudged["prom:\(rid):\(t)"] = nowMs()
        }
        if card.type == "drift", let pid = card.personId {
            d.nudged["drift:\(pid)"] = nowMs()
            d.nudged["drift:last"] = nowMs()
        }
        return card
    }
}
