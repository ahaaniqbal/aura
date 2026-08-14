// ConnectKit.swift, the two doors apple leaves open: calendar and contacts.
// both are read on this device and never leave it. there is no api for mail,
// sms or whatsapp on ios, and aura does not pretend otherwise.

import Foundation
import EventKit
import Contacts

struct CalendarEvent: Identifiable, Hashable {
    let id: String
    let title: String
    let start: Date
    let allDay: Bool
}

@MainActor
enum CalendarKit {
    static let store = EKEventStore()

    static var hasAccess: Bool {
        EKEventStore.authorizationStatus(for: .event) == .fullAccess
    }
    static var denied: Bool {
        let s = EKEventStore.authorizationStatus(for: .event)
        return s == .denied || s == .restricted
    }

    static func requestAccess() async -> Bool {
        (try? await store.requestFullAccessToEvents()) ?? false
    }

    // today's remaining schedule, soonest first, capped so the today screen
    // stays calm even on a meeting-heavy day
    static func todayEvents(limit: Int = 6) -> [CalendarEvent] {
        guard hasAccess else { return [] }
        let cal = Calendar.current
        let start = Date()
        guard let end = cal.date(bySettingHour: 23, minute: 59, second: 59, of: Date()) else { return [] }
        let predicate = store.predicateForEvents(withStart: cal.startOfDay(for: start), end: end, calendars: nil)
        return store.events(matching: predicate)
            .filter { !$0.isAllDay || cal.isDateInToday($0.startDate) }
            .filter { $0.isAllDay || $0.endDate > start } // finished meetings drop off
            .sorted { $0.startDate < $1.startDate }
            .prefix(limit)
            .map { CalendarEvent(id: $0.eventIdentifier ?? uid(),
                                 title: $0.title ?? String(localized: "busy"),
                                 start: $0.startDate,
                                 allDay: $0.isAllDay) }
    }

    // a compact line for the ai brain, so chat can answer "how's my day?"
    static func snapshotLine() -> String? {
        let events = todayEvents(limit: 5)
        guard !events.isEmpty else { return nil }
        let f = DateFormatter()
        f.dateFormat = "H:mm"
        let bits = events.map { $0.allDay ? $0.title : "\(f.string(from: $0.start)) \($0.title)" }
        return "today's calendar: " + bits.joined(separator: "; ")
    }
}

enum ContactsImport {
    // brings in everyone whose birthday the phone already knows. names and
    // birthdays only, merged case-insensitively, nothing else is read.
    static func run(into store: Store) async -> Int {
        let granted = (try? await CNContactStore().requestAccess(for: .contacts)) ?? false
        guard granted else { return -1 }

        var imported = 0

        // enumerate off the main thread; CNContactStore is thread-safe for reads
        let found: [(name: String, mmdd: String)] = await Task.detached(priority: .userInitiated) {
            let keys = [CNContactGivenNameKey, CNContactFamilyNameKey, CNContactNicknameKey, CNContactBirthdayKey] as [CNKeyDescriptor]
            let request = CNContactFetchRequest(keysToFetch: keys)
            var results: [(String, String)] = []
            try? CNContactStore().enumerateContacts(with: request) { contact, _ in
                guard let bday = contact.birthday, let m = bday.month, let d = bday.day else { return }
                let mmdd = String(format: "%02d-%02d", m, d)
                guard DateKit.validMonthDay(mmdd) else { return }
                let name = !contact.nickname.isEmpty ? contact.nickname
                    : [contact.givenName, contact.familyName].filter { !$0.isEmpty }.joined(separator: " ")
                guard !name.isEmpty else { return }
                results.append((name, mmdd))
            }
            return results
        }.value

        await MainActor.run {
            for (name, mmdd) in found {
                if let i = store.data.people.firstIndex(where: { $0.name.lowercased() == name.lowercased() }) {
                    if store.data.people[i].birthday == nil {
                        store.data.people[i].birthday = mmdd
                        imported += 1
                    }
                } else {
                    var p = Person(name: name)
                    p.birthday = mmdd
                    store.data.people.append(p)
                    imported += 1
                }
            }
            if imported > 0 { store.save() } // save() also schedules the birthday notifications
        }
        return imported
    }
}
