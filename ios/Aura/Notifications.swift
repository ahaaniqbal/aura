// Notifications.swift, native local notifications with the manners of a good
// messaging app: banners even while you're inside aura, action buttons on the
// notification itself, a truthful badge, and time-sensitive delivery for
// exact-time reminders. ios fires everything with the app closed, no server.

import Foundation
import UserNotifications

// taps and action buttons land here
final class NotificationDelegate: NSObject, UNUserNotificationCenterDelegate {
    static let shared = NotificationDelegate()

    // a reminder that fires while you're looking at aura still shows as a banner
    func userNotificationCenter(_ center: UNUserNotificationCenter,
                                willPresent notification: UNNotification,
                                withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([.banner, .list, .sound, .badge])
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter,
                                didReceive response: UNNotificationResponse,
                                withCompletionHandler completionHandler: @escaping () -> Void) {
        let info = response.notification.request.content.userInfo
        let refId = info["refId"] as? String
        let action = response.actionIdentifier
        DispatchQueue.main.async {
            let store = Store.shared
            switch action {
            case "REM_DONE":
                if let refId { store.reminderDone(refId) }
            case "REM_SNOOZE":
                if let refId { store.snoozeReminder(refId, minutes: 10) }
            default:
                // a plain tap opens aura on today, where the card is waiting
                store.requestedTab = "today"
                _ = CardEngine.decide(&store.data)
                store.save()
            }
            completionHandler()
        }
    }
}

enum Notifier {
    static func requestPermission() async -> Bool {
        (try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge])) ?? false
    }

    // the action buttons that ride on the notifications themselves
    static func registerCategories() {
        let done = UNNotificationAction(identifier: "REM_DONE",
                                        title: String(localized: "Done"),
                                        options: [])
        let snooze = UNNotificationAction(identifier: "REM_SNOOZE",
                                          title: String(localized: "Snooze 10 min"),
                                          options: [])
        let reminder = UNNotificationCategory(identifier: "REMINDER", actions: [done, snooze],
                                              intentIdentifiers: [], options: [])
        let birthday = UNNotificationCategory(identifier: "BIRTHDAY", actions: [],
                                              intentIdentifiers: [], options: [])
        UNUserNotificationCenter.current().setNotificationCategories([reminder, birthday])
    }

    // ask only when there is something worth notifying about, and only once
    static func maybeAsk() {
        guard ProcessInfo.processInfo.environment["AURA_NO_NOTIF_PROMPT"] == nil else { return }
        UNUserNotificationCenter.current().getNotificationSettings { s in
            guard s.authorizationStatus == .notDetermined else { return }
            UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { _, _ in
                DispatchQueue.main.async { Notifier.sync(Store.shared.data) }
            }
        }
    }

    private struct Planned {
        let fireAt: Date
        let id: String
        let content: UNMutableNotificationContent
        let trigger: UNNotificationTrigger
        // quarter-point nudges remind about something not yet due, so they
        // never inflate the badge; only real due-moments count
        let countsTowardBadge: Bool
    }

    // keep ios's schedule in step with the palace. ios silently keeps only the
    // 64 soonest pending notifications per app, so the schedule is sorted by
    // fire time and capped at 60, and re-synced on every save and foreground.
    static func sync(_ d: AppData) {
        let center = UNUserNotificationCenter.current()
        center.removeAllPendingNotificationRequests()
        var planned: [Planned] = []
        let cal = Calendar.current

        for r in d.reminders where r.status == "open" {
            if let at = r.at, at > nowMs() {
                // the four-nudge plan: quarter points of the span from creation
                // to deadline, the last one exactly at the deadline
                for (idx, point) in DateKit.quarterPoints(created: r.createdAt, deadline: at, now: nowMs()).enumerated() {
                    let isFinal = point == at
                    let content = UNMutableNotificationContent()
                    content.title = r.text
                    if isFinal {
                        content.body = String(localized: "It's time. You asked me to bring this back right now.")
                        content.interruptionLevel = .timeSensitive
                    } else {
                        content.body = String(localized: "about \(DateKit.durationLabel(at - point)) left for this")
                        content.interruptionLevel = .active
                    }
                    content.sound = .default
                    content.categoryIdentifier = "REMINDER"
                    content.userInfo = ["refId": r.id, "type": "reminder"]
                    let trigger = UNTimeIntervalNotificationTrigger(timeInterval: max(1, Double(point - nowMs()) / 1000), repeats: false)
                    planned.append(Planned(fireAt: Date(timeIntervalSince1970: Double(point) / 1000),
                                           id: "rem-\(r.id)-q\(idx)", content: content, trigger: trigger,
                                           countsTowardBadge: isFinal))
                }
            } else if let when = r.when, when >= DateKit.todayString(), let date = DateKit.dateFrom(when) {
                var c = cal.dateComponents([.year, .month, .day], from: date)
                c.hour = 9; c.minute = 0
                let content = UNMutableNotificationContent()
                content.title = r.text
                content.body = String(localized: "You asked me to bring this back today.")
                content.sound = .default
                content.categoryIdentifier = "REMINDER"
                content.userInfo = ["refId": r.id, "type": "reminder"]
                let trigger = UNCalendarNotificationTrigger(dateMatching: c, repeats: false)
                let fire = cal.date(from: c) ?? date
                planned.append(Planned(fireAt: fire, id: "rem-\(r.id)", content: content, trigger: trigger,
                                       countsTowardBadge: true))
            }
        }

        for p in d.people {
            guard let bd = p.birthday else { continue }
            let parts = bd.split(separator: "-").compactMap { Int($0) }
            guard parts.count == 2, let daysAway = DateKit.daysUntilBirthday(bd) else { continue }
            var c = DateComponents()
            c.month = parts[0]; c.day = parts[1]; c.hour = 9
            let content = UNMutableNotificationContent()
            content.title = String(localized: "\(p.name)'s birthday is today 🎂")
            content.body = p.wants.first.map { String(localized: "They're obsessed with \($0).") }
                ?? String(localized: "A little note goes a long way.")
            content.sound = .default
            content.categoryIdentifier = "BIRTHDAY"
            content.userInfo = ["refId": p.id, "type": "birthday"]
            let trigger = UNCalendarNotificationTrigger(dateMatching: c, repeats: true)
            let fire = cal.date(byAdding: .day, value: daysAway, to: cal.startOfDay(for: Date())) ?? Date()
            planned.append(Planned(fireAt: fire, id: "bday-\(p.id)", content: content, trigger: trigger,
                                   countsTowardBadge: true))
        }

        // soonest first, capped under ios's 64 pending limit. real due-moments
        // stamp the badge with the running count of things due by then, so the
        // icon tells the truth even with the app closed for days.
        var dueSoFar = 0
        for item in planned.sorted(by: { $0.fireAt < $1.fireAt }).prefix(60) {
            if item.countsTowardBadge {
                dueSoFar += 1
                item.content.badge = NSNumber(value: dueSoFar)
            }
            center.add(UNNotificationRequest(identifier: item.id, content: item.content, trigger: item.trigger))
        }

        syncBadge(d)
    }

    // the badge tells the truth: how many things are due right now
    static func syncBadge(_ d: AppData) {
        let today = DateKit.todayString()
        var due = d.reminders.filter { r in
            guard r.status == "open" else { return false }
            if let at = r.at { return at <= nowMs() }
            if let when = r.when { return when <= today }
            return false
        }.count
        due += d.people.filter { DateKit.daysUntilBirthday($0.birthday) == 0 }.count
        UNUserNotificationCenter.current().setBadgeCount(due)
    }

    // an immediate nudge, used when a place reminder matches where you are
    static func nudgeNow(title: String, body: String, refId: String? = nil) {
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.sound = .default
        content.categoryIdentifier = "REMINDER"
        content.interruptionLevel = .timeSensitive
        if let refId { content.userInfo = ["refId": refId, "type": "place"] }
        UNUserNotificationCenter.current().add(
            UNNotificationRequest(identifier: "now-\(uid())", content: content, trigger: nil))
    }
}
