// TodayView.swift, the morning surface: greeting, pulse, the one card, what's due.

import SwiftUI

struct TodayView: View {
    @Bindable var store: Store

    var greeting: String {
        let h = Calendar.current.component(.hour, from: Date())
        let word = h < 5 ? String(localized: "up late")
            : h < 12 ? String(localized: "good morning")
            : h < 18 ? String(localized: "good afternoon")
            : String(localized: "good evening")
        return store.settings.userName.isEmpty ? word : "\(word), \(store.settings.userName.lowercased())"
    }

    var dueReminders: [Reminder] {
        store.data.reminders.filter { r in
            guard r.status == "open" else { return false }
            if let when = r.when, when <= DateKit.todayString() { return true }
            if let at = r.at { return Calendar.current.isDateInToday(Date(timeIntervalSince1970: Double(at) / 1000)) || at < nowMs() }
            return false
        }
    }
    var placeReminders: [Reminder] { store.data.reminders.filter { $0.status == "open" && $0.place != nil } }
    // tomorrow is visible too: "did it save?" should never be a question
    var tomorrowReminders: [Reminder] {
        let tm = DateKit.addDaysString(1)
        return store.data.reminders.filter { r in
            guard r.status == "open" else { return false }
            if r.when == tm { return true }
            if let at = r.at { return Calendar.current.isDateInTomorrow(Date(timeIntervalSince1970: Double(at) / 1000)) }
            return false
        }
    }
    var birthdays: [Person] {
        store.data.people.filter { (DateKit.daysUntilBirthday($0.birthday) ?? 99) <= 14 }
            .sorted { (DateKit.daysUntilBirthday($0.birthday) ?? 99) < (DateKit.daysUntilBirthday($1.birthday) ?? 99) }
    }
    var openPromises: [PromiseItem] { store.data.promises.filter { $0.status == "open" } }
    var quiet: [Person] {
        store.data.people.filter {
            ["friend", "family", "partner"].contains($0.relation ?? "") && $0.mentionedAt < nowMs() - 21 * 86_400_000
        }
    }
    var todayPulse: PulseEntry? {
        store.data.pulse.last { Calendar.current.isDateInToday(Date(timeIntervalSince1970: Double($0.ts) / 1000)) }
    }
    var isEmpty: Bool {
        store.data.people.isEmpty && store.data.reminders.isEmpty && store.data.promises.isEmpty && store.pendingCard == nil
    }

    @State private var calendarEvents: [CalendarEvent] = []

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(greeting).font(.largeTitle.bold())
                        Text(Date().formatted(date: .complete, time: .omitted))
                            .font(.footnote).foregroundStyle(.secondary)
                    }

                    pulseRow

                    if let card = store.pendingCard {
                        CardView(card: card, store: store)
                    }

                    if store.settings.calendarConnected {
                        section("From your calendar") { calendarList }
                    }

                    if isEmpty {
                        emptyState
                    } else {
                        if !dueReminders.isEmpty { section("Today") { remindersList(dueReminders) } }
                        if !birthdays.isEmpty || !openPromises.isEmpty || !tomorrowReminders.isEmpty { section("Coming up") { comingUp } }
                        if !placeReminders.isEmpty { section("When you're out") { remindersList(placeReminders, showPlace: true) } }
                        if !quiet.isEmpty {
                            section("Gone quiet") {
                                HStack(alignment: .top, spacing: 10) {
                                    Image(systemName: "moon.zzz")
                                        .foregroundStyle(.secondary)
                                        .padding(.top, 2)
                                    Text(quiet.map { $0.name.lowercased() }.joined(separator: " · ")
                                         + String(localized: "  · a tiny hello goes a long way"))
                                        .font(.footnote).foregroundStyle(.secondary)
                                }
                                .padding(14)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .background(Theme.surface, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                            }
                        }
                    }
                }
                .padding()
                .animation(.snappy, value: store.pendingCard?.id)
            }
            .background(Theme.bg)
            .navigationTitle("aura")
            .navigationBarTitleDisplayMode(.inline)
            .onAppear {
                if store.settings.calendarConnected, CalendarKit.hasAccess {
                    calendarEvents = CalendarKit.todayEvents()
                }
            }
        }
    }

    var calendarList: some View {
        Group {
            if !CalendarKit.hasAccess {
                Button {
                    Task {
                        if await CalendarKit.requestAccess() {
                            calendarEvents = CalendarKit.todayEvents()
                        }
                    }
                } label: {
                    Label("Connect calendar", systemImage: "calendar.badge.plus")
                        .font(.subheadline.weight(.medium))
                        .padding(14)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Theme.surface, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                }
            } else if calendarEvents.isEmpty {
                Text("Nothing on the calendar today")
                    .font(.footnote).foregroundStyle(.secondary)
                    .padding(14)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Theme.surface, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            } else {
                VStack(spacing: 0) {
                    ForEach(calendarEvents) { e in
                        HStack(spacing: 12) {
                            Image(systemName: "calendar")
                                .foregroundStyle(Theme.blue)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(e.title).font(.subheadline.weight(.medium)).lineLimit(1)
                                Text(e.allDay ? String(localized: "all day")
                                     : e.start.formatted(date: .omitted, time: .shortened))
                                    .font(.caption).foregroundStyle(.secondary)
                            }
                            Spacer()
                        }
                        .padding(.vertical, 11).padding(.horizontal, 14)
                        if e.id != calendarEvents.last?.id { Divider().padding(.leading, 14) }
                    }
                }
                .background(Theme.surface, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            }
        }
    }

    var pulseRow: some View {
        HStack(spacing: 7) {
            ForEach([("rough", -2), ("meh", -1), ("okay", 0), ("good", 1), ("great", 2)], id: \.0) { mood, v in
                Button {
                    store.logPulse(v, mood: mood)
                } label: {
                    Text(LocalizedStringKey(mood))
                        .font(.footnote.weight(.semibold))
                        .padding(.horizontal, 12).padding(.vertical, 6)
                        .background(todayPulse?.valence == v ? AnyShapeStyle(Theme.violet) : AnyShapeStyle(Theme.surface), in: Capsule())
                        .foregroundStyle(todayPulse?.valence == v ? .white : .secondary)
                }
                .accessibilityLabel(Text("I'm feeling \(String(localized: String.LocalizationValue(mood)))"))
            }
        }
        .sensoryFeedback(.selection, trigger: todayPulse?.valence)
    }

    var emptyState: some View {
        VStack(spacing: 4) {
            ContentUnavailableView {
                Label {
                    Text("i'm aura")
                } icon: {
                    Circle().fill(Theme.orbGradient).frame(width: 52, height: 52)
                }
            } description: {
                Text("tell me about your people and your plans, in english ya hindi. i'll quietly keep track, then nudge you at the right moment. everything stays on this phone.")
            }
            if !store.settings.calendarConnected {
                Button {
                    store.requestedTab = "more"
                } label: {
                    Label("see your day here, connect calendar in settings", systemImage: "calendar")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .padding(.horizontal, 14).padding(.vertical, 8)
                        .background(Theme.surface, in: Capsule())
                }
            }
        }
    }

    func section(_ title: LocalizedStringKey, @ViewBuilder content: () -> some View) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.footnote.weight(.semibold))
                .foregroundStyle(.secondary)
                .textCase(.uppercase)
            content()
        }
    }

    func remindersList(_ items: [Reminder], showPlace: Bool = false) -> some View {
        VStack(spacing: 0) {
            ForEach(items) { r in
                HStack(spacing: 12) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(r.text).font(.subheadline.weight(.medium))
                        Text(showPlace ? (r.place ?? "") : (r.at.map { DateKit.timeLabel($0) } ?? r.when.map { DateKit.dayLabel($0) } ?? ""))
                            .font(.caption).foregroundStyle(.secondary)
                    }
                    Spacer()
                    Button { store.reminderDone(r.id) } label: {
                        Image(systemName: "checkmark.circle.fill")
                            .font(.title3)
                            .foregroundStyle(.green)
                    }
                    .accessibilityLabel(Text("Mark done: \(r.text)"))
                    Button { store.deleteReminder(r.id) } label: {
                        Image(systemName: "xmark.circle")
                            .font(.title3)
                            .foregroundStyle(.secondary.opacity(0.5))
                    }
                    .accessibilityLabel(Text("Delete: \(r.text)"))
                }
                .padding(.vertical, 11).padding(.horizontal, 14)
                if r.id != items.last?.id { Divider().padding(.leading, 14) }
            }
        }
        .background(Theme.surface, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    var comingUp: some View {
        VStack(spacing: 0) {
            ForEach(tomorrowReminders) { r in
                HStack(spacing: 12) {
                    Image(systemName: "clock")
                        .foregroundStyle(Theme.sunny)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(r.text).font(.subheadline.weight(.medium))
                        Text(r.at.map { DateKit.timeLabel($0) } ?? r.when.map { DateKit.dayLabel($0) } ?? "")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                    Spacer()
                    Button { store.reminderDone(r.id) } label: {
                        Image(systemName: "checkmark.circle.fill")
                            .font(.title3)
                            .foregroundStyle(.green)
                    }
                    .accessibilityLabel(Text("Mark done: \(r.text)"))
                    Button { store.deleteReminder(r.id) } label: {
                        Image(systemName: "xmark.circle")
                            .font(.title3)
                            .foregroundStyle(.secondary.opacity(0.5))
                    }
                    .accessibilityLabel(Text("Delete: \(r.text)"))
                }
                .padding(.vertical, 11).padding(.horizontal, 14)
                Divider().padding(.leading, 14)
            }
            ForEach(birthdays) { p in
                HStack(spacing: 12) {
                    Image(systemName: "gift.fill")
                        .foregroundStyle(Theme.pink)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("\(p.name.lowercased())'s birthday").font(.subheadline.weight(.medium))
                        Text("\(DateKit.birthdayLabel(p.birthday))\(p.wants.first.map { String(localized: " · gift idea: \($0)") } ?? "")")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                    Spacer()
                }
                .padding(.vertical, 11).padding(.horizontal, 14)
                Divider().padding(.leading, 14)
            }
            ForEach(openPromises) { p in
                HStack(spacing: 12) {
                    Image(systemName: "hand.raised.fill")
                        .foregroundStyle(Theme.mint)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("\(p.direction == "i_owe" ? String(localized: "you promised") : String(localized: "owed to you"))\(p.person.map { " \($0.lowercased())" } ?? ""): \(p.text)")
                            .font(.subheadline.weight(.medium))
                        Text(p.due.map { DateKit.dayLabel($0) } ?? String(localized: "no date"))
                            .font(.caption).foregroundStyle(.secondary)
                    }
                    Spacer()
                    Button { store.promiseDone(p.id) } label: {
                        Image(systemName: "checkmark.circle.fill")
                            .font(.title3)
                            .foregroundStyle(.green)
                    }
                    .accessibilityLabel(Text("Mark done"))
                    Button { store.deletePromise(p.id) } label: {
                        Image(systemName: "xmark.circle")
                            .font(.title3)
                            .foregroundStyle(.secondary.opacity(0.5))
                    }
                    .accessibilityLabel(Text("Delete"))
                }
                .padding(.vertical, 11).padding(.horizontal, 14)
                if p.id != openPromises.last?.id { Divider().padding(.leading, 14) }
            }
        }
        .background(Theme.surface, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }
}
