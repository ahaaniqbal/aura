// Brain.swift, aura's mind on the phone. talks to aura's relay, which forwards
// to google gemini with the developer's key, so users never touch an api key.
// two focused calls: the reply sees your memory, the extractor sees only the new
// message, so nothing echoes. prompts put their constant rules first and the
// clock last, so gemini's implicit prefix caching keeps the bill small.
// the pattern brain is the always-working floor when there's no plan or signal.

import Foundation

enum Brain {

    struct Thought {
        var reply: String
        var extraction: Extraction
        var mode: String
    }

    // ---- prompts ----
    // the persona block is byte-identical on every call, on purpose: identical
    // prefixes are what gemini's implicit caching discounts. dynamic facts
    // (date, name, memory) come after it, and the clock goes in the user turn.

    static let personaRules = """
    you are aura, a personal ambient assistant with genuine warmth and taste. you talk like a sharp, caring friend. ALWAYS lowercase in english. reply in 1 to 3 short sentences (a short list is fine when asked what you know). never use em dashes or en dashes, use commas or periods. emoji sparingly.
    mirror the user's language: reply in english, hindi, or hinglish, matching how the user writes.
    use what you remember when it helps. acknowledge new facts briefly and warmly, like a friend who caught it, not a database. never invent facts you don't have.
    when the user sets a reminder, the app itself asks them for an end time if one is missing, so never ask about reminder timing yourself. just acknowledge.
    return STRICT json, nothing else: {"reply":"what you say to the user"}
    the reply is spoken directly to the user in aura's voice. no analysis, just the words you say.
    """

    static func memorySnapshot(_ d: AppData) -> String {
        var lines: [String] = []
        let recentPeople = d.people.sorted { $0.mentionedAt > $1.mentionedAt }.prefix(15)
        if !recentPeople.isEmpty {
            lines.append("people:")
            for p in recentPeople {
                var bits: [String] = []
                if let r = p.relation { bits.append(r) }
                if let b = p.birthday { bits.append("birthday \(b) (\(DateKit.birthdayLabel(b)))") }
                if !p.wants.isEmpty { bits.append("into/wants: \(p.wants.joined(separator: ", "))") }
                if !p.interests.isEmpty { bits.append("interests: \(p.interests.joined(separator: ", "))") }
                if let c = p.care { bits.append(c) }
                if !p.notes.isEmpty { bits.append("context: \(p.notes.suffix(2).map(\.text).joined(separator: "; "))") }
                lines.append("- \(p.name)\(bits.isEmpty ? "" : ": " + bits.joined(separator: " · "))")
            }
        }
        let open = d.promises.filter { $0.status == "open" }
        if !open.isEmpty {
            lines.append("open promises:")
            for p in open.suffix(10) {
                lines.append("- \(p.direction == "i_owe" ? "user owes" : "owed to user")\(p.person.map { " (\($0))" } ?? ""): \(p.text)\(p.due.map { ", due \($0)" } ?? "")")
            }
        }
        let rem = d.reminders.filter { $0.status == "open" }
        if !rem.isEmpty {
            lines.append("reminders:")
            for r in rem.suffix(10) {
                lines.append("- \(r.text)\(r.when.map { " (\($0))" } ?? "")\(r.at.map { " (\(DateKit.timeLabel($0)))" } ?? "")\(r.place.map { " (at \($0))" } ?? "")")
            }
        }
        if let last = d.pulse.last {
            lines.append("user's recent mood: \(last.mood ?? String(last.valence))")
        }
        return lines.isEmpty ? "(nothing yet, first conversations)" : lines.joined(separator: "\n")
    }

    static func replyPrompt(_ d: AppData, name: String, calendar: String? = nil) -> String {
        """
        \(personaRules)
        \(name.isEmpty ? "" : "the user's name is \(name).")
        today is \(DateKit.todayString()) (\(DateKit.days[Calendar.current.component(.weekday, from: Date()) - 1])).

        what you remember about the user's life:
        \(memorySnapshot(d))\(calendar.map { "\n\($0)" } ?? "")
        """
    }

    // fully static: every dated fact rides in the user turn instead, so this
    // whole block stays cacheable forever
    static let extractRules = """
    you extract durable facts from ONE message a user just said to their assistant. the message may be english, hindi, or hinglish. the user turn starts with a context line (today's date, the time now on a 24 hour clock, and a date table). use that table instead of computing dates.
    return STRICT json, exactly this shape, nothing else:
    {"people":[{"name":"","relation":null,"birthday":null,"wants":[],"interests":[],"care":null,"note":null}],"promises":[{"text":"","person":null,"direction":"i_owe","due":null}],"reminders":[{"text":"","when":null,"at":null,"place":null}],"pulse":null}
    rules:
    - only what THIS message actually says. never invent, never repeat old facts.
    - people: someone the user mentions. relation one of family|friend|client|collaborator|partner if clear, else null. birthday as "MM-DD" if said. things they love or gift ideas go in wants. emotional weight about them goes in care.
    - promises: commitments between the user and a person. direction "i_owe" if the user owes it, "owed_to_me" if it is owed to the user. due as "YYYY-MM-DD" if a date is said.
    - reminders: things the user asks to be reminded of (in any language, e.g. "yaad dilana", "remind karna"). "when" as "YYYY-MM-DD" for day level asks. "at" as "YYYY-MM-DD HH:MM" (24 hour) for exact times, computed from the time in the context line. place only for "when i'm at X". a self task is a reminder, not a promise.
    - pulse: the user's OWN mood if evident, as {"valence": -2 to 2, "mood": "one word"}, else null.
    - keep extracted text in the user's language. names keep their spelling.
    - nothing relevant: empty arrays and null pulse.
    """

    static func extractContext() -> String {
        "context: today is \(DateKit.todayString()) (\(DateKit.days[Calendar.current.component(.weekday, from: Date()) - 1])), time now \(DateKit.nowClock24()). date table: \(DateKit.weekTable())."
    }

    // ---- the wire ----
    // the relay speaks the openai chat format and forwards to gemini. the app
    // authenticates with the app store subscription proof (a signed jws), which
    // the relay verifies against apple before spending tokens.

    #if DEBUG
    // dev builds can talk to gemini directly: a key injected per-launch via the
    // AURA_DEV_GEMINI_KEY environment variable (never stored anywhere), or one
    // saved in the keychain from settings > developer
    static var devKey: String? {
        ProcessInfo.processInfo.environment["AURA_DEV_GEMINI_KEY"] ?? Keychain.get("dev-gemini-key")
    }
    #endif

    static func endpoint(_ settings: Store.Settings) -> URL {
        #if DEBUG
        if !settings.relayOverride.isEmpty, let u = URL(string: settings.relayOverride) {
            return u.appendingPathComponent("v1/chat")
        }
        if devKey != nil {
            return URL(string: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions")!
        }
        #endif
        return Config.relayURL.appendingPathComponent("v1/chat")
    }

    static func callModel(_ messages: [[String: Any]], maxTokens: Int, temperature: Double,
                          settings: Store.Settings, auth: String) async throws -> String {
        var req = URLRequest(url: endpoint(settings))
        req.httpMethod = "POST"
        req.timeoutInterval = 30
        req.setValue("application/json", forHTTPHeaderField: "content-type")
        var body: [String: Any] = [
            "messages": messages,
            "max_tokens": maxTokens,
            "temperature": temperature,
            "response_format": ["type": "json_object"],
        ]
        #if DEBUG
        if let devKey = Self.devKey, settings.relayOverride.isEmpty {
            // straight to google in development, no relay needed. the model is
            // pinned to the same id the relay serves in production.
            req.setValue("Bearer \(devKey)", forHTTPHeaderField: "authorization")
            body["model"] = "gemini-3.1-flash-lite"
        } else {
            req.setValue("Bearer \(auth)", forHTTPHeaderField: "authorization")
        }
        #else
        req.setValue("Bearer \(auth)", forHTTPHeaderField: "authorization")
        #endif
        req.httpBody = try JSONSerialization.data(withJSONObject: body)
        let (data, resp) = try await URLSession.shared.data(for: req)
        guard let http = resp as? HTTPURLResponse, http.statusCode == 200 else {
            let code = (resp as? HTTPURLResponse)?.statusCode ?? 0
            if code == 401 {
                // the relay no longer honors our proof: re-sync entitlements so
                // the ui stops promising a brain the relay will refuse
                await SubscriptionManager.shared.refresh()
            }
            throw NSError(domain: "aura", code: code,
                          userInfo: [NSLocalizedDescriptionKey: "relay \(code)"])
        }
        let obj = try JSONSerialization.jsonObject(with: data) as? [String: Any]
        let choices = obj?["choices"] as? [[String: Any]]
        let msg = choices?.first?["message"] as? [String: Any]
        return msg?["content"] as? String ?? ""
    }

    static func parseJSONBlock(_ s: String) -> [String: Any]? {
        var t = s.replacingOccurrences(of: "<think>[\\s\\S]*?</think>", with: "", options: .regularExpression)
        t = t.replacingOccurrences(of: "```json", with: "").replacingOccurrences(of: "```", with: "")
        guard let a = t.firstIndex(of: "{"), let b = t.lastIndex(of: "}") else { return nil }
        t = String(t[a...b])
        return (try? JSONSerialization.jsonObject(with: Data(t.utf8))) as? [String: Any]
    }

    static func extractionFrom(_ obj: [String: Any], text: String) -> Extraction {
        var ex = Extraction()
        for p in obj["people"] as? [[String: Any]] ?? [] {
            guard let name = p["name"] as? String, !name.isEmpty else { continue }
            ex.people.append(ExtractedPerson(
                name: name,
                relation: p["relation"] as? String,
                birthday: (p["birthday"] as? String).flatMap { s in
                    // a valid MM-DD passes through; anything else (including a
                    // day-first "28-06" the model may emit) gets re-parsed or dropped
                    DateKit.validMonthDay(s) ? s : DateKit.parseMonthDay(s).flatMap { DateKit.validMonthDay($0) ? $0 : nil }
                },
                wants: p["wants"] as? [String] ?? [],
                interests: p["interests"] as? [String] ?? [],
                care: p["care"] as? String,
                note: p["note"] as? String))
        }
        for p in obj["promises"] as? [[String: Any]] ?? [] {
            guard let t = p["text"] as? String, !t.isEmpty else { continue }
            ex.promises.append(ExtractedPromise(
                text: t, person: p["person"] as? String,
                direction: (p["direction"] as? String) == "owed_to_me" ? "owed_to_me" : "i_owe",
                due: (p["due"] as? String).flatMap { DateKit.parseWhen($0) }))
        }
        for r in obj["reminders"] as? [[String: Any]] ?? [] {
            guard let t = r["text"] as? String, !t.isEmpty else { continue }
            var at: Int64? = nil
            if let s = r["at"] as? String, let m = s.firstMatch(of: #/(\d{4})-(\d{2})-(\d{2})[T ](\d{1,2}):(\d{2})/#) {
                var c = DateComponents()
                c.year = Int(m.output.1); c.month = Int(m.output.2); c.day = Int(m.output.3)
                c.hour = Int(m.output.4); c.minute = Int(m.output.5)
                at = Calendar.current.date(from: c).map { Int64($0.timeIntervalSince1970 * 1000) }
            }
            if let a = at, a > nowMs() + 366 * 86_400_000 { at = nil } // sanity cap, same as the web brain
            ex.reminders.append(ExtractedReminder(
                text: t,
                when: (r["when"] as? String).flatMap { DateKit.parseWhen($0) },
                at: at,
                place: r["place"] as? String))
        }
        if let pulse = obj["pulse"] as? [String: Any], let v = pulse["valence"] as? Int, let mood = pulse["mood"] as? String, !mood.isEmpty {
            ex.pulse = ExtractedPulse(valence: v, mood: mood)
        }
        // the model can fumble clock math, so the deterministic parse wins
        if let det = DateKit.parseAt(text), !ex.reminders.isEmpty {
            let off = ex.reminders[0].at.map { abs($0 - det) } ?? Int64.max
            if off > 5 * 60_000 { ex.reminders[0].at = det; ex.reminders[0].when = nil }
        }
        return ex
    }

    // ---- the two-call flow ----
    // auth is the app store subscription proof. nil means no active plan (or no
    // consent), and the pattern brain answers instead. it always answers.

    static func think(_ text: String, data: AppData, settings: Store.Settings, auth: String?) async -> Thought {
        guard let auth else {
            let ex = Extractor.extract(text)
            return Thought(reply: Extractor.composeLocalReply(ex), extraction: ex, mode: "offline")
        }
        let history: [[String: Any]] = data.messages.suffix(4).map {
            ["role": $0.role == "you" ? "user" : "assistant", "content": String($0.text.prefix(300))]
        } + [["role": "user", "content": text]]

        // the calendar line lets chat answer "how's my day?", and costs under
        // a hundred tokens only when the user has connected the calendar
        let calendarLine = settings.calendarConnected ? await CalendarKit.snapshotLine() : nil
        async let replyTask: String? = try? callModel(
            [["role": "system", "content": replyPrompt(data, name: settings.userName, calendar: calendarLine)]] + history,
            maxTokens: 250, temperature: 0.4, settings: settings, auth: auth)
        async let extractTask: String? = try? callModel(
            [["role": "system", "content": extractRules],
             ["role": "user", "content": extractContext() + "\n\nmessage: " + text]],
            maxTokens: 350, temperature: 0.1, settings: settings, auth: auth)

        let rawReply = await replyTask
        let rawExtract = await extractTask

        let reply = rawReply.flatMap { parseJSONBlock($0)?["reply"] as? String }
        let ex = rawExtract.flatMap { parseJSONBlock($0).map { extractionFrom($0, text: text) } } ?? Extractor.extract(text)

        if let reply, !reply.isEmpty {
            return Thought(reply: reply, extraction: ex, mode: "relay")
        }
        // network or model hiccup: the pattern brain still answers
        let localEx = Extractor.extract(text)
        return Thought(reply: Extractor.composeLocalReply(localEx), extraction: localEx, mode: "offline")
    }

    static func extractOnly(_ text: String, settings: Store.Settings, auth: String?) async -> Extraction {
        guard let auth else { return Extractor.extract(text) }
        if let raw = try? await callModel(
            [["role": "system", "content": extractRules],
             ["role": "user", "content": extractContext() + "\n\nmessage: " + text]],
            maxTokens: 350, temperature: 0.1, settings: settings, auth: auth),
           let obj = parseJSONBlock(raw) {
            return extractionFrom(obj, text: text)
        }
        return Extractor.extract(text)
    }
}
