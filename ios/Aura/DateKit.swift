// DateKit.swift, deterministic time. relative times are computed here in code,
// never by the model, so "in 30 minutes" means exactly 30 minutes.

import Foundation

enum DateKit {
    static let months = ["january","february","march","april","may","june","july","august","september","october","november","december"]
    static let days = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"]

    static var cal: Calendar { Calendar.current }

    static func todayString(_ date: Date = Date()) -> String {
        let c = cal.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", c.year!, c.month!, c.day!)
    }

    static func addDaysString(_ n: Int) -> String {
        todayString(cal.date(byAdding: .day, value: n, to: Date())!)
    }

    static func monthIndex(_ word: String) -> Int? {
        let w = word.lowercased().prefix(3)
        return months.firstIndex { $0.hasPrefix(w) }
    }

    // "june 28th" | "28 june" | "6/28" -> "MM-DD"
    static func parseMonthDay(_ input: String?) -> String? {
        guard var s = input?.lowercased() else { return nil }
        s = s.replacing(#/(\d+)(st|nd|rd|th)/#) { m in String(m.output.1) }
        if let m = s.firstMatch(of: #/([a-z]+)\s+(\d{1,2})/#), let mi = monthIndex(String(m.output.1)) {
            return String(format: "%02d-%02d", mi + 1, Int(m.output.2)!)
        }
        if let m = s.firstMatch(of: #/(\d{1,2})\s+([a-z]+)/#), let mi = monthIndex(String(m.output.2)) {
            return String(format: "%02d-%02d", mi + 1, Int(m.output.1)!)
        }
        if let m = s.firstMatch(of: #/(\d{1,2})\/(\d{1,2})/#), let mm = Int(m.output.1), mm >= 1, mm <= 12 {
            return String(format: "%02d-%02d", mm, Int(m.output.2)!)
        }
        return nil
    }

    // natural date -> "YYYY-MM-DD"
    static func parseWhen(_ input: String?) -> String? {
        guard var s = input?.lowercased().trimmingCharacters(in: .whitespaces) else { return nil }
        if s.hasPrefix("on ") { s = String(s.dropFirst(3)) }
        if s == "today" || s == "aaj" || s == "आज" { return addDaysString(0) }
        if s == "tomorrow" || s == "tmrw" || s == "kal" || s == "कल" { return addDaysString(1) }
        if s == "day after tomorrow" || s == "parso" || s == "परसों" { return addDaysString(2) }
        if let m = s.wholeMatch(of: #/in (\d{1,2}) days?/#) { return addDaysString(Int(m.output.1)!) }
        if let m = s.wholeMatch(of: #/(next |this )?([a-z]+day)/#), let idx = days.firstIndex(of: String(m.output.2)) {
            let today = cal.component(.weekday, from: Date()) - 1 // sunday = 0
            var diff = (idx - today + 7) % 7
            if diff == 0 { diff = 7 }
            if m.output.1 == "next " && diff < 7 { diff += 7 }
            return addDaysString(diff)
        }
        if s.wholeMatch(of: #/\d{4}-\d{2}-\d{2}/#) != nil { return s }
        if let md = parseMonthDay(s) {
            let year = cal.component(.year, from: Date())
            let candidate = "\(year)-\(md)"
            return candidate < todayString() ? "\(year + 1)-\(md)" : candidate
        }
        return nil
    }

    // exact times -> epoch ms. "in 30 minutes", "in half an hour", "at 6pm", "at 18:30"
    static func parseAt(_ input: String?, now: Date = Date()) -> Int64? {
        guard let s = input?.lowercased() else { return nil }
        let base = Int64(now.timeIntervalSince1970 * 1000)
        if let m = s.firstMatch(of: #/in (\d+) ?min(?:ute)?s?\b/#) { return base + Int64(m.output.1)! * 60_000 }
        if s.contains("in half an hour") { return base + 30 * 60_000 }
        if let m = s.firstMatch(of: #/in (\d+(?:\.\d+)?) ?hours?\b/#), let h = Double(m.output.1) {
            return base + Int64(h * 60) * 60_000
        }
        if s.firstMatch(of: #/in an? hour\b/#) != nil { return base + 60 * 60_000 }
        if let m = s.firstMatch(of: #/at (\d{1,2})(?::(\d{2}))? ?(am|pm)\b/#) {
            var h = Int(m.output.1)! % 12
            if m.output.3 == "pm" { h += 12 }
            let min = m.output.2.flatMap { Int($0) } ?? 0
            return futureTime(hour: h, minute: min, now: now)
        }
        if let m = s.firstMatch(of: #/at (\d{1,2}):(\d{2})\b/#), let h = Int(m.output.1), let min = Int(m.output.2), h <= 23, min <= 59 {
            return futureTime(hour: h, minute: min, now: now)
        }
        return nil
    }

    // a deadline answer can be casual: "6pm", "by evening", "in 10 hours",
    // "tomorrow", "morning". anchorDay ("YYYY-MM-DD") carries day context from
    // the reminder being answered, so "6pm" for a tomorrow-reminder lands tomorrow.
    static let coarseHours: [(String, Int)] = [
        ("end of day", 21), ("eod", 21), ("tonight", 21), ("night", 21),
        ("morning", 9), ("noon", 12), ("afternoon", 15), ("evening", 19),
        // hinglish and hindi, first-class: "kal subah", "shaam tak", "रात को"
        ("subah", 9), ("dopahar", 15), ("shaam", 19), ("raat", 21),
        ("सुबह", 9), ("दोपहर", 15), ("शाम", 19), ("रात", 21),
    ]

    static func parseDeadline(_ input: String?, now: Date = Date(), anchorDay: String? = nil) -> Int64? {
        guard var s = input?.lowercased().trimmingCharacters(in: .whitespaces) else { return nil }
        s = s.replacing(#/^(?:by|till|until|before|around|at)\s+/#, with: "")

        // relative spans ("in 10 hours", "in 30 min") ignore the anchor day
        if let at = parseAt("in " + s.replacing(#/^in\s+/#, with: ""), now: now) { return at }

        func compose(hour: Int, minute: Int) -> Int64 {
            if let anchorDay, let day = dateFrom(anchorDay) {
                var c = cal.dateComponents([.year, .month, .day], from: day)
                c.hour = hour; c.minute = minute
                if let d = cal.date(from: c) { return Int64(d.timeIntervalSince1970 * 1000) }
            }
            return futureTime(hour: hour, minute: minute, now: now)
        }

        // bare or prefixed clock: "6pm", "6:30 pm", "18:30"
        if let m = s.firstMatch(of: #/^(\d{1,2})(?::(\d{2}))? ?(am|pm)\b/#) {
            var h = Int(m.output.1)! % 12
            if m.output.3 == "pm" { h += 12 }
            return compose(hour: h, minute: m.output.2.flatMap { Int($0) } ?? 0)
        }
        if let m = s.firstMatch(of: #/^(\d{1,2}):(\d{2})\b/#), let h = Int(m.output.1), h <= 23,
           let min = Int(m.output.2), min <= 59 {
            return compose(hour: h, minute: min)
        }
        // coarse words: "evening", "by tonight", "tomorrow morning", "kal subah"
        let dayFromText = parseWhen(s.replacing(#/\s*(morning|noon|afternoon|evening|tonight|night|end of day|eod|subah|dopahar|shaam|raat|ko|tak|सुबह|दोपहर|शाम|रात|को|तक)\s*/#, with: " ").trimmingCharacters(in: .whitespaces))
        for (word, hour) in coarseHours where s.contains(word) {
            if let day = dayFromText ?? anchorDay, let date = dateFrom(day) {
                var c = cal.dateComponents([.year, .month, .day], from: date)
                c.hour = hour; c.minute = 0
                if let d = cal.date(from: c) { return Int64(d.timeIntervalSince1970 * 1000) }
            }
            return futureTime(hour: hour, minute: 0, now: now)
        }
        // a bare day ("tomorrow", "friday") ends at 21:00 that day
        if let day = parseWhen(s), let date = dateFrom(day) {
            var c = cal.dateComponents([.year, .month, .day], from: date)
            c.hour = 21; c.minute = 0
            if let d = cal.date(from: c) { return Int64(d.timeIntervalSince1970 * 1000) }
        }
        return nil
    }

    // the four-nudge plan: 25, 50, 75 and 100 percent of the span between
    // creation and deadline. nudges that would land in sleeping hours
    // (22:00 to 08:00) slide to 08:00; the final one IS the deadline and never
    // moves. past points and near-duplicates are dropped.
    static func quarterPoints(created: Int64, deadline: Int64, now: Int64) -> [Int64] {
        guard deadline > now + 60_000 else { return [] }
        guard deadline > created else { return [deadline] }
        let span = deadline - created
        var points: [Int64] = []
        for k in 1...4 {
            var p = created + span * Int64(k) / 4
            if k < 4 {
                p = shiftOutOfSleep(p)
                guard p > now + 60_000, p < deadline else { continue }
                if let last = points.last, p - last < 5 * 60_000 { continue }
                points.append(p)
            } else {
                while let last = points.last, deadline - last < 5 * 60_000 { points.removeLast() }
                points.append(deadline)
            }
        }
        return points
    }

    static func shiftOutOfSleep(_ ms: Int64) -> Int64 {
        let d = Date(timeIntervalSince1970: Double(ms) / 1000)
        let h = cal.component(.hour, from: d)
        if h < 8 {
            var c = cal.dateComponents([.year, .month, .day], from: d)
            c.hour = 8; c.minute = 0
            if let shifted = cal.date(from: c) { return Int64(shifted.timeIntervalSince1970 * 1000) }
        }
        if h >= 22, let next = cal.date(byAdding: .day, value: 1, to: d) {
            var c = cal.dateComponents([.year, .month, .day], from: next)
            c.hour = 8; c.minute = 0
            if let shifted = cal.date(from: c) { return Int64(shifted.timeIntervalSince1970 * 1000) }
        }
        return ms
    }

    // "2 hr 30 min", localized by the system (hindi included)
    static func durationLabel(_ ms: Int64) -> String {
        let f = DateComponentsFormatter()
        f.allowedUnits = ms >= 86_400_000 ? [.day, .hour] : [.hour, .minute]
        f.unitsStyle = .abbreviated
        f.maximumUnitCount = 2
        return f.string(from: TimeInterval(ms) / 1000) ?? ""
    }

    static func futureTime(hour: Int, minute: Int, now: Date) -> Int64 {
        var c = cal.dateComponents([.year, .month, .day], from: now)
        c.hour = hour; c.minute = minute; c.second = 0
        var d = cal.date(from: c)!
        if d <= now { d = cal.date(byAdding: .day, value: 1, to: d)! }
        return Int64(d.timeIntervalSince1970 * 1000)
    }

    // display strings speak the phone's language: english stays lowercase aura
    // style, hindi comes out in proper devanagari via the system formatters
    static func clock12(_ ms: Int64) -> String {
        let f = DateFormatter()
        f.locale = Locale.current
        f.dateStyle = .none
        f.timeStyle = .short
        // modern ios puts a narrow no-break space before am/pm; normalize so
        // labels compare and wrap like plain text
        return f.string(from: Date(timeIntervalSince1970: Double(ms) / 1000))
            .replacingOccurrences(of: "\u{202F}", with: " ")
            .lowercased()
    }

    static func monthDay(_ d: Date) -> String {
        let f = DateFormatter()
        f.locale = Locale.current
        f.setLocalizedDateFormatFromTemplate("MMMd")
        return f.string(from: d).lowercased()
    }

    static func weekdayName(_ d: Date) -> String {
        let f = DateFormatter()
        f.locale = Locale.current
        f.setLocalizedDateFormatFromTemplate("EEEE")
        return f.string(from: d).lowercased()
    }

    static func timeLabel(_ at: Int64) -> String {
        let diff = at - nowMs()
        if diff < -90_000 { return String(localized: "\(clock12(at)), slipped") }
        if diff < 60_000 { return String(localized: "now") }
        if diff < 3_600_000 { return String(localized: "in \(Int((Double(diff) / 60_000).rounded())) min") }
        let d = Date(timeIntervalSince1970: Double(at) / 1000)
        if cal.isDateInToday(d) { return String(localized: "today \(clock12(at))") }
        if cal.isDateInTomorrow(d) { return String(localized: "tomorrow \(clock12(at))") }
        return "\(monthDay(d)), \(clock12(at))"
    }

    static func dayLabel(_ ymd: String) -> String {
        let t = todayString()
        if ymd == t { return String(localized: "today") }
        if ymd == addDaysString(1) { return String(localized: "tomorrow") }
        guard let d = dateFrom(ymd) else { return ymd }
        let diff = cal.dateComponents([.day], from: cal.startOfDay(for: Date()), to: cal.startOfDay(for: d)).day ?? 0
        if diff > 1 && diff < 7 { return weekdayName(d) }
        if diff < 0 { return String(localized: "\(-diff)d overdue") }
        return monthDay(d)
    }

    static func dateFrom(_ ymd: String) -> Date? {
        let parts = ymd.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3 else { return nil }
        var c = DateComponents()
        c.year = parts[0]; c.month = parts[1]; c.day = parts[2]; c.hour = 12
        return cal.date(from: c)
    }

    // strict "MM-DD" with a real month and day. model output and imported files
    // are untrusted, and months[13 - 1] is a crash, so everything that stores or
    // renders a birthday funnels through this.
    static func validMonthDay(_ s: String) -> Bool {
        guard s.wholeMatch(of: #/\d{2}-\d{2}/#) != nil else { return false }
        let p = s.split(separator: "-").compactMap { Int($0) }
        return p.count == 2 && (1...12).contains(p[0]) && (1...31).contains(p[1])
    }

    // days until the next occurrence of an "MM-DD" birthday (0 = today)
    static func daysUntilBirthday(_ mmdd: String?) -> Int? {
        guard let mmdd, validMonthDay(mmdd) else { return nil }
        let parts = mmdd.split(separator: "-").compactMap { Int($0) }
        var c = DateComponents()
        c.year = cal.component(.year, from: Date()); c.month = parts[0]; c.day = parts[1]
        guard var next = cal.date(from: c) else { return nil }
        let start = cal.startOfDay(for: Date())
        if next < start { c.year! += 1; next = cal.date(from: c)! }
        return cal.dateComponents([.day], from: start, to: cal.startOfDay(for: next)).day
    }

    static func birthdayLabel(_ mmdd: String?) -> String {
        guard let n = daysUntilBirthday(mmdd) else { return "" }
        if n == 0 { return String(localized: "today 🎂") }
        if n == 1 { return String(localized: "tomorrow") }
        if n < 7 { return String(localized: "in \(n) days") }
        let parts = mmdd!.split(separator: "-").compactMap { Int($0) }
        var c = DateComponents()
        c.year = cal.component(.year, from: Date()); c.month = parts[0]; c.day = parts[1]
        guard let d = cal.date(from: c) else { return "" }
        return monthDay(d)
    }

    // the date table handed to the model, so it never does date math
    static func weekTable() -> String {
        (0...7).map { i in
            let d = cal.date(byAdding: .day, value: i, to: Date())!
            let name = i == 0 ? "today" : i == 1 ? "tomorrow" : days[cal.component(.weekday, from: d) - 1]
            return "\(name) = \(todayString(d))"
        }.joined(separator: ", ")
    }

    static func nowClock24() -> String {
        let c = cal.dateComponents([.hour, .minute], from: Date())
        return String(format: "%02d:%02d", c.hour!, c.minute!)
    }
}
