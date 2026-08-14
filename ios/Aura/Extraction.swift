// Extraction.swift, the pattern brain. always works, no model needed.
// ported from the verified web version: people, birthdays, wants, promises,
// reminders (day, exact time, place) and the user's own mood.

import Foundation

struct Extraction: Sendable {
    var people: [ExtractedPerson] = []
    var promises: [ExtractedPromise] = []
    var reminders: [ExtractedReminder] = []
    var pulse: ExtractedPulse?
}

struct ExtractedPerson: Sendable {
    var name: String
    var relation: String?
    var birthday: String?
    var wants: [String] = []
    var interests: [String] = []
    var care: String?
    var note: String?
}

struct ExtractedPromise: Sendable {
    var text: String
    var person: String?
    var direction: String = "i_owe"
    var due: String?
}

struct ExtractedReminder: Sendable {
    var text: String
    var when: String?
    var at: Int64?
    var place: String?
}

struct ExtractedPulse: Sendable {
    var valence: Int
    var mood: String?
}

enum Extractor {
    static let notNames: Set<String> = ["i","me","my","he","she","they","it","we","you","the","a","an","that","this","today","tomorrow","and","but","so","remind","remember","everyone","someone"]

    static let moods: [String: Int] = [
        "amazing": 2, "great": 2, "excited": 2, "fantastic": 2,
        "good": 1, "happy": 1, "solid": 1,
        "okay": 0, "ok": 0, "fine": 0, "meh": 0,
        "tired": -1, "stressed": -1, "anxious": -1, "overwhelmed": -1, "drained": -1, "exhausted": -1,
        "rough": -2, "sad": -2, "awful": -2, "terrible": -2, "down": -2, "horrible": -2,
    ]

    static func looksLikeName(_ w: String) -> Bool {
        w.wholeMatch(of: #/[a-z][a-z-]{1,20}/#.ignoresCase()) != nil && !notNames.contains(w.lowercased())
    }

    // peel a trailing time off a task body: "call mom at 6pm" -> ("call mom", at),
    // "buy milk tomorrow" -> ("buy milk", when)
    static func stripTrailingTime(_ input: String) -> (body: String, when: String?, at: Int64?) {
        var body = input.trimmingCharacters(in: .whitespaces)
        var when: String? = nil
        var at: Int64? = nil
        if let t = body.firstMatch(of: #/\s(in (?:half an hour|an? hour|\d+ ?min(?:ute)?s?|\d+(?:\.\d+)? ?hours?)|at \d{1,2}(?::\d{2})? ?(?:am|pm)?)$/#) {
            at = DateKit.parseAt(String(t.output.1))
            if at != nil { body = String(body[..<t.range.lowerBound]).trimmingCharacters(in: .whitespaces) }
        }
        if at == nil, let t = body.firstMatch(of: #/\s(?:on\s)?(today|tomorrow|day after tomorrow|in \d{1,2} days?|(?:next |this )?[a-z]+day|[a-z]+ \d{1,2}(?:st|nd|rd|th)?|\d{1,2}\/\d{1,2})$/#) {
            when = DateKit.parseWhen(String(t.output.1))
            if when != nil { body = String(body[..<t.range.lowerBound]).trimmingCharacters(in: .whitespaces) }
        }
        return (body, when, at)
    }

    // the hinglish floor: day words (kal/aaj/parso), hour words (subah/shaam...),
    // "N baje" clocks, and the "<something> <verb>na hai" task shape, in roman
    // and devanagari. returns nil when the message isn't a hinglish task.
    static func hinglishTask(_ low: String) -> ExtractedReminder? {
        let hasTaskShape = low.range(of: #"(?:\p{Script=Devanagari}|[a-z])\w* (?:hai|hain|h)\b"#, options: .regularExpression) != nil
            || low.contains("है") || low.contains("yaad dila") || low.contains("याद दिला")
        guard hasTaskShape else { return nil }

        var s = " " + low + " "
        var dayOffset: Int? = nil
        var hour: Int? = nil

        for (word, off) in [("parso", 2), ("परसों", 2), ("kal", 1), ("कल", 1), ("aaj", 0), ("आज", 0)] {
            if s.contains(" \(word) ") {
                dayOffset = off
                s = s.replacingOccurrences(of: " \(word) ", with: " ")
                break
            }
        }
        for (word, h) in [("subah", 9), ("सुबह", 9), ("dopahar", 15), ("दोपहर", 15),
                          ("shaam", 19), ("शाम", 19), ("raat", 21), ("रात", 21)] {
            if s.contains(word) {
                hour = h
                s = s.replacingOccurrences(of: word, with: " ")
                break
            }
        }
        // "6 baje": with shaam/raat that means 18/21-ish, alone a small number leans evening
        if let m = s.firstMatch(of: #/(\d{1,2}) ?(?:baje|बजे)/#), let n = Int(m.output.1) {
            if let h = hour, h >= 12, n < 12 { hour = n + 12 }
            else if hour == nil, n <= 7 { hour = n + 12 }
            else { hour = n }
            s = s.replacing(#/(\d{1,2}) ?(?:baje|बजे)/#, with: " ")
        }

        // strip boilerplate and fillers, keep the task itself
        s = s.replacing(#/\b(?:yaad dilana|yaad dila dena|yaad dilao|yaad dila|remind karna|remind kar|याद दिलाना|याद दिला देना|याद दिला|please|plz|yaar|bhai|na\b|mujhe|mereko|mujhko|मुझे|मुझको|ko\b|को)\b/#, with: " ")
        s = s.replacing(#/\s+/#, with: " ").trimmingCharacters(in: .whitespaces)

        // "<task> <verb-form> hai" in roman or devanagari
        let body: String
        if let m = s.firstMatch(of: #/([\p{Script=Devanagari}a-z0-9' ]+?(?:ना|नी|na|ni|कर|kar|le|de|ja|bhej|utha|kharid|bana|dekh|padh|bhar|la)[\p{Script=Devanagari}a-z]*)\s+(?:hai|hain|h|है|हैं)\b/#) {
            body = String(m.output.1).trimmingCharacters(in: .whitespaces)
        } else if s.contains("yaad") == false, !s.isEmpty, dayOffset != nil || hour != nil {
            // "kal subah <something>" with an explicit time still reads as a task
            body = s.replacing(#/\b(?:hai|hain|h|है|हैं)\b/#, with: " ").replacing(#/\s+/#, with: " ").trimmingCharacters(in: .whitespaces)
        } else {
            return nil
        }
        guard body.count >= 3 else { return nil }

        var when: String? = dayOffset.map { DateKit.addDaysString($0) }
        var at: Int64? = nil
        if let hour {
            var c = DateKit.cal.dateComponents([.year, .month, .day], from: Date())
            if let w = when, let d = DateKit.dateFrom(w) {
                c = DateKit.cal.dateComponents([.year, .month, .day], from: d)
            }
            c.hour = hour; c.minute = 0
            if let d = DateKit.cal.date(from: c) {
                var ms = Int64(d.timeIntervalSince1970 * 1000)
                if ms <= nowMs(), when == nil { ms += 86_400_000 } // "raat ko" said after 9pm means tomorrow night
                at = ms
                when = nil
            }
        }
        return ExtractedReminder(text: body, when: when, at: at)
    }

    static func extract(_ text: String) -> Extraction {
        var ex = Extraction()
        let low = " " + text.lowercased().replacing(#/\s+/#, with: " ").trimmingCharacters(in: .whitespaces) + " "

        // reminders first: "remind me to X [time] [when i'm at Y]"
        if let m = low.firstMatch(of: #/remind me to (.+?)(?:\s+when i'?m at ([a-z0-9' &-]+?))?\s*$/#) {
            let t = stripTrailingTime(String(m.output.1))
            ex.reminders.append(ExtractedReminder(text: t.body, when: t.when, at: t.at, place: m.output.2.map { String($0).trimmingCharacters(in: .whitespaces) }))
            return ex
        }

        // plain-words tasks: "i need to call sam today", "i should pick up meds",
        // "gotta submit the form by friday". every task deserves an end time, and
        // the app asks for one when this leaves it open.
        if let m = low.firstMatch(of: #/\b(?:i need to|i have to|i must|i should|gotta) (.+?)\s*$/#) {
            let t = stripTrailingTime(String(m.output.1).replacing(#/\s+by\s+(?=\S+$)/#, with: " "))
            if t.body.count >= 3 {
                ex.reminders.append(ExtractedReminder(text: t.body, when: t.when, at: t.at))
                return ex
            }
        }

        // hinglish and hindi tasks: "yaar mujhe kal doodh lena hai",
        // "mummy ko call karna hai", "kal subah yaad dilana", "मुझे कल दूध लेना है".
        // the free floor speaks the user's language too, in its simple way.
        if let r = hinglishTask(low) {
            ex.reminders.append(r)
            return ex
        }

        // birthdays: "sam's birthday is june 28th"
        if let m = low.firstMatch(of: #/([a-z-]+)'s birthday(?: is| was)?(?: on)? ([a-z]+ \d{1,2}(?:st|nd|rd|th)?|\d{1,2} [a-z]+|\d{1,2}\/\d{1,2})/#),
           looksLikeName(String(m.output.1)), let bd = DateKit.parseMonthDay(String(m.output.2)) {
            ex.people.append(ExtractedPerson(name: String(m.output.1), birthday: bd))
        }

        // met: "met priya at the climbing gym" (before wants so pronouns can attach)
        if let m = low.firstMatch(of: #/\bmet ([a-z-]+) at ([a-z0-9' &-]+?)(?:[.,!]|$)/#), looksLikeName(String(m.output.1)) {
            ex.people.append(ExtractedPerson(name: String(m.output.1), note: "met at \(String(m.output.2).trimmingCharacters(in: .whitespaces))"))
        }

        // wants: "he's obsessed with chocolate cake", "sarah loves tulips"
        for m in low.matches(of: #/(?:he|she|they)(?:'s| is|'re| are)? (?:obsessed with|really into|into|loves?|likes?) ([a-z0-9' -]+?)(?:[.,!]| and | so |$)/#) {
            let thing = String(m.output.1).trimmingCharacters(in: .whitespaces)
            guard thing.count >= 3, !ex.people.isEmpty else { continue }
            if !ex.people[0].wants.contains(thing) { ex.people[0].wants.append(thing) }
        }
        for m in low.matches(of: #/([a-z-]+) (?:loves|is obsessed with|is really into|is into|likes) ([a-z0-9' -]+?)(?:[.,!]| and | so |$)/#) {
            let name = String(m.output.1), thing = String(m.output.2).trimmingCharacters(in: .whitespaces)
            guard looksLikeName(name), thing.count >= 3 else { continue }
            if let i = ex.people.firstIndex(where: { $0.name == name }) {
                if !ex.people[i].wants.contains(thing) { ex.people[i].wants.append(thing) }
            } else {
                ex.people.append(ExtractedPerson(name: name, wants: [thing]))
            }
        }

        // relations: "my friend sam", "my sister ana"
        if let m = low.firstMatch(of: #/my (friend|sister|brother|mom|mum|dad|father|mother|partner|girlfriend|boyfriend|wife|husband|cousin|colleague|coworker|client) ([a-z-]+)/#),
           looksLikeName(String(m.output.2)) {
            let kind = String(m.output.1)
            let rel = kind == "friend" ? "friend"
                : ["client", "colleague", "coworker"].contains(kind) ? "collaborator"
                : ["partner", "girlfriend", "boyfriend", "wife", "husband"].contains(kind) ? "partner" : "family"
            if let i = ex.people.firstIndex(where: { $0.name == String(m.output.2) }) { ex.people[i].relation = rel }
            else { ex.people.append(ExtractedPerson(name: String(m.output.2), relation: rel)) }
        }

        // promises: "i owe sam a coffee by friday", "jake owes me $20"
        if let m = low.firstMatch(of: #/i (?:owe|promised) ([a-z-]+) (.+?)(?: by ((?:next |this )?[a-z]+day|tomorrow|[a-z]+ \d{1,2}(?:st|nd|rd|th)?))?[.!]?\s*$/#),
           looksLikeName(String(m.output.1)) {
            var t = String(m.output.2).trimmingCharacters(in: .whitespaces)
            t = t.replacing(#/^(that )?i'?d? /#, with: "")
            ex.promises.append(ExtractedPromise(text: t, person: String(m.output.1), direction: "i_owe", due: m.output.3.flatMap { DateKit.parseWhen(String($0)) }))
        }
        if let m = low.firstMatch(of: #/([a-z-]+) owes me (.+?)[.!]?\s*$/#), looksLikeName(String(m.output.1)) {
            ex.promises.append(ExtractedPromise(text: String(m.output.2).trimmingCharacters(in: .whitespaces), person: String(m.output.1), direction: "owed_to_me"))
        }

        // the user's own pulse: "i'm feeling rough", "feeling great today"
        if let m = low.firstMatch(of: #/(?:i'?m |i am |i'?ve been )?feel(?:ing)? (?:pretty |really |very |so |a bit |kind of )?([a-z]+)/#), let v = moods[String(m.output.1)] {
            ex.pulse = ExtractedPulse(valence: v, mood: String(m.output.1))
        } else if let m = low.firstMatch(of: #/\bi'?m (great|good|okay|ok|fine|tired|stressed|sad|down|exhausted|anxious|happy|excited)\b/#), let v = moods[String(m.output.1)] {
            ex.pulse = ExtractedPulse(valence: v, mood: String(m.output.1))
        }

        return ex
    }

    // merge an extraction into the palace; returns chips describing what was caught
    @discardableResult
    static func apply(_ ex: Extraction, to d: inout AppData) -> [Chip] {
        var chips: [Chip] = []
        for p in ex.people {
            let name = p.name.prefix(1).uppercased() + p.name.dropFirst()
            var idx = d.people.firstIndex { $0.name.lowercased() == p.name.lowercased() }
            if idx == nil {
                d.people.append(Person(name: name))
                idx = d.people.count - 1
            }
            if let rel = p.relation { d.people[idx!].relation = rel }
            if let bd = p.birthday { d.people[idx!].birthday = bd }
            if let care = p.care { d.people[idx!].care = care }
            for w in p.wants where !d.people[idx!].wants.contains(w) { d.people[idx!].wants.append(w) }
            for i in p.interests where !d.people[idx!].interests.contains(i) { d.people[idx!].interests.append(i) }
            if let note = p.note { d.people[idx!].notes.append(PersonNote(text: note)) }
            d.people[idx!].mentionedAt = nowMs()
            if p.birthday != nil { chips.append(Chip(label: "\(p.name.lowercased()) · \(DateKit.birthdayLabel(p.birthday))", tone: "date")) }
            else if !p.wants.isEmpty { chips.append(Chip(label: "\(p.name.lowercased()) · gift idea", tone: "gift")) }
            else { chips.append(Chip(label: p.name.lowercased(), tone: "person")) }
        }
        for pr in ex.promises {
            if let who = pr.person {
                if let i = d.people.firstIndex(where: { $0.name.lowercased() == who.lowercased() }) {
                    d.people[i].mentionedAt = nowMs() // a promise involving them counts as contact, for drift
                } else {
                    d.people.append(Person(name: who.prefix(1).uppercased() + who.dropFirst()))
                }
            }
            d.promises.append(PromiseItem(text: scrub(pr.text), person: pr.person.map { $0.prefix(1).uppercased() + $0.dropFirst() }, direction: pr.direction, due: pr.due))
            // the chip shows which date aura picked, so nothing is decided silently
            chips.append(Chip(label: pr.due.map { "promise · \(DateKit.dayLabel($0))" } ?? "promise", tone: "promise"))
        }
        for r in ex.reminders where !r.text.isEmpty {
            d.reminders.append(Reminder(text: scrub(r.text), when: r.when, at: r.at, place: r.place))
            let label = r.place.map { "at \($0)" } ?? r.at.map { DateKit.timeLabel($0) } ?? r.when.map { DateKit.dayLabel($0) } ?? "remembered"
            chips.append(Chip(label: label, tone: r.place != nil ? "place" : "date"))
        }
        if let pulse = ex.pulse, pulse.mood != nil {
            d.pulse.append(PulseEntry(valence: max(-2, min(2, pulse.valence)), mood: pulse.mood))
            chips.append(Chip(label: pulse.mood ?? "noted", tone: "pulse"))
        }
        return chips
    }

    // a warm little acknowledgment when no model is reachable. every line is
    // localized, and the picked dates are echoed so nothing is decided silently.
    static func composeLocalReply(_ ex: Extraction) -> String {
        var bits: [String] = []
        for p in ex.people {
            if let bd = p.birthday { bits.append(String(localized: "\(p.name)'s birthday is \(DateKit.birthdayLabel(bd)), kept")) }
            if let w = p.wants.first { bits.append(String(localized: "i'll remember the \(w) thing")) }
            if let n = p.note { bits.append(String(localized: "noted, \(n)")) }
            if p.birthday == nil && p.wants.isEmpty && p.note == nil { bits.append(String(localized: "\(p.name) is in your circle now")) }
        }
        for r in ex.reminders {
            if let place = r.place { bits.append(String(localized: "i'll bring \"\(r.text)\" back when you're at \(place)")) }
            else if let at = r.at { bits.append(String(localized: "i'll bring \"\(r.text)\" back \(DateKit.timeLabel(at))")) }
            else if let when = r.when { bits.append(String(localized: "i'll bring \"\(r.text)\" back \(DateKit.dayLabel(when))")) }
            else { bits.append(String(localized: "holding onto \"\(r.text)\"")) }
        }
        for pr in ex.promises {
            let due = pr.due.map { ", " + String(localized: "by \(DateKit.dayLabel($0))") } ?? ""
            if pr.direction == "owed_to_me" {
                bits.append(String(localized: "tracking it, \(pr.person ?? "they") owes you") + due)
            } else if let who = pr.person {
                bits.append(String(localized: "tracking it, for \(who)") + due)
            } else {
                bits.append(String(localized: "tracking it") + due)
            }
        }
        if let p = ex.pulse {
            bits.append(p.valence <= -1 ? String(localized: "hear you. i'll keep things light today 🤍")
                : p.valence >= 1 ? String(localized: "love that for you ✨") : String(localized: "noted"))
        }
        if bits.isEmpty {
            // honest, not evasive: say what the simple brain can and cannot follow
            return String(localized: "didn't catch anything to keep there. my simple brain follows simple lines like \"remind me to call mom tomorrow\" ya \"kal doodh lena hai\". the full brain understands everything, english and hindi.")
        }
        return bits.joined(separator: ". ") + "."
    }
}
