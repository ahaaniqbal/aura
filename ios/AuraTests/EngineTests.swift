// EngineTests.swift, the contracts that keep aura trustworthy: the one-card
// rule and its priority order, the nudged bookkeeping that stops repeats,
// resolve() semantics, the brain's json parsing and extraction mapping, and
// schema compatibility with the web export and older settings files.
//
// everything here builds AppData/Person/Reminder/PromiseItem values directly.
// Store.shared is never touched, so no file on disk is read or written.

import XCTest
@testable import Aura

// MARK: - card engine

final class CardEngineTests: XCTestCase {

    private func pendingCount(_ d: AppData) -> Int {
        d.cards.filter { $0.status == "pending" }.count
    }

    private var year: Int { Calendar.current.component(.year, from: Date()) }

    // the full ladder: exact-time reminder > due-today reminder > birthday >
    // promise > drift, with the bookkeeping key checked at every rung
    func testPriorityOrderAndBookkeeping() throws {
        var d = AppData()
        let today = DateKit.todayString()
        let exactAt = nowMs() - 60_000

        let daily = Reminder(text: "water the plants", when: today)
        let exact = Reminder(text: "take meds", at: exactAt)
        d.reminders = [daily, exact] // scrambled on purpose: class beats array order

        let bdayPerson = Person(name: "Priya", birthday: String(today.suffix(5)))
        let quietest = Person(name: "Rohan", relation: "friend", mentionedAt: nowMs() - 40 * 86_400_000)
        let lessQuiet = Person(name: "Meera", relation: "family", mentionedAt: nowMs() - 25 * 86_400_000)
        d.people = [bdayPerson, quietest, lessQuiet]

        let promise = PromiseItem(text: "send the photos", due: today)
        d.promises = [promise]

        // 1. exact-time reminder wins, and its nudged key lands immediately
        let c1 = try XCTUnwrap(CardEngine.decide(&d))
        XCTAssertEqual(c1.type, "reminder")
        XCTAssertEqual(c1.refId, exact.id)
        XCTAssertNotNil(d.nudged["rem:\(exact.id):\(exactAt)"])
        XCTAssertEqual(pendingCount(d), 1)

        // one-pending-card rule: a second decide returns the same card, no new one
        XCTAssertEqual(CardEngine.decide(&d)?.id, c1.id)
        XCTAssertEqual(d.cards.count, 1)

        let r1 = try XCTUnwrap(CardEngine.resolve(&d, id: c1.id, approve: true))
        XCTAssertEqual(r1.status, "approved")
        XCTAssertNotNil(r1.resolvedAt)
        XCTAssertEqual(d.reminders.first { $0.id == exact.id }?.status, "done")

        // 2. due-today reminder is next
        let c2 = try XCTUnwrap(CardEngine.decide(&d))
        XCTAssertEqual(c2.type, "reminder")
        XCTAssertEqual(c2.refId, daily.id)
        XCTAssertEqual(pendingCount(d), 1)
        _ = CardEngine.resolve(&d, id: c2.id, approve: true)
        XCTAssertEqual(d.reminders.first { $0.id == daily.id }?.status, "done")

        // 3. birthday beats promise and drift
        let c3 = try XCTUnwrap(CardEngine.decide(&d))
        XCTAssertEqual(c3.type, "birthday")
        XCTAssertEqual(c3.personId, bdayPerson.id)
        _ = CardEngine.resolve(&d, id: c3.id, approve: true)
        XCTAssertNotNil(d.nudged["bday:\(bdayPerson.id):\(year)"], "resolving a birthday marks it for the year")

        // 4. promise coming due
        let c4 = try XCTUnwrap(CardEngine.decide(&d))
        XCTAssertEqual(c4.type, "promise")
        XCTAssertEqual(c4.refId, promise.id)
        _ = CardEngine.resolve(&d, id: c4.id, approve: false)
        XCTAssertNotNil(d.nudged["prom:\(promise.id):\(today)"], "a dismissed promise stays quiet for the day")

        // 5. drift picks the quietest close person
        let c5 = try XCTUnwrap(CardEngine.decide(&d))
        XCTAssertEqual(c5.type, "drift")
        XCTAssertEqual(c5.personId, quietest.id)
        _ = CardEngine.resolve(&d, id: c5.id, approve: true)
        XCTAssertNotNil(d.nudged["drift:\(quietest.id)"])
        XCTAssertNotNil(d.nudged["drift:last"])

        // 6. weekly cap: meera is quiet too, but drift just fired
        XCTAssertNil(CardEngine.decide(&d), "max one drift card a week")

        // pretend the last drift was over a week ago: meera surfaces, rohan is
        // still blocked by his own 30-day key
        d.nudged["drift:last"] = nowMs() - 8 * 86_400_000
        let c6 = try XCTUnwrap(CardEngine.decide(&d))
        XCTAssertEqual(c6.type, "drift")
        XCTAssertEqual(c6.personId, lessQuiet.id)
    }

    func testExistingPendingCardBlocksEverything() {
        var d = AppData()
        let stale = Card(type: "drift", title: "someone", body: "quiet")
        d.cards = [stale]
        d.reminders = [Reminder(text: "urgent thing", at: nowMs() - 1_000)]

        let card = CardEngine.decide(&d)
        XCTAssertEqual(card?.id, stale.id, "a pending card is returned as-is")
        XCTAssertEqual(d.cards.count, 1, "no second card is created")
        XCTAssertTrue(d.nudged.isEmpty, "the eligible reminder is not consumed while another card is pending")
    }

    func testExactTimeNudgedKeyPreventsRepeat() throws {
        var d = AppData()
        let at = nowMs() - 60_000
        d.reminders = [Reminder(text: "call mom", at: at)]

        let card = try XCTUnwrap(CardEngine.decide(&d))
        XCTAssertNotNil(d.nudged["rem:\(d.reminders[0].id):\(at)"])
        _ = CardEngine.resolve(&d, id: card.id, approve: true)

        // even if the reminder somehow reopens with the same at, the key holds
        d.reminders[0].status = "open"
        XCTAssertNil(CardEngine.decide(&d), "the same at must never nudge twice")
    }

    func testDueTodayDismissMarksDayAndPreventsRepeat() throws {
        var d = AppData()
        let today = DateKit.todayString()
        d.reminders = [Reminder(text: "water the plants", when: today)]

        let card = try XCTUnwrap(CardEngine.decide(&d))
        _ = CardEngine.resolve(&d, id: card.id, approve: false)

        XCTAssertEqual(d.reminders[0].status, "open", "dismissing a day-level reminder keeps it open")
        XCTAssertNotNil(d.nudged["rem:\(d.reminders[0].id):\(today)"])
        XCTAssertNil(CardEngine.decide(&d), "no second card the same day")
    }

    func testApproveMarksReminderDone() throws {
        var d = AppData()
        d.reminders = [Reminder(text: "pay rent", when: DateKit.todayString())]
        let card = try XCTUnwrap(CardEngine.decide(&d))

        let resolved = try XCTUnwrap(CardEngine.resolve(&d, id: card.id, approve: true))
        XCTAssertEqual(resolved.status, "approved")
        XCTAssertNotNil(resolved.resolvedAt)
        XCTAssertEqual(d.reminders[0].status, "done")
    }

    func testDismissOnTimedReminderSnoozesTenMinutes() throws {
        var d = AppData()
        d.reminders = [Reminder(text: "take meds", at: nowMs() - 20 * 60_000)]
        let card = try XCTUnwrap(CardEngine.decide(&d))

        let before = nowMs()
        _ = CardEngine.resolve(&d, id: card.id, approve: false)
        let after = nowMs()

        let newAt = try XCTUnwrap(d.reminders[0].at)
        XCTAssertGreaterThanOrEqual(newAt, before + 10 * 60_000)
        XCTAssertLessThanOrEqual(newAt, after + 10 * 60_000)
        XCTAssertEqual(d.reminders[0].status, "open", "a snoozed reminder is still open")
        XCTAssertNil(CardEngine.decide(&d), "the snoozed at is in the future, no card yet")
    }

    func testBirthdayResolveMarksYearEitherWay() throws {
        var d = AppData()
        let p = Person(name: "Priya", birthday: String(DateKit.todayString().suffix(5)))
        d.people = [p]

        let card = try XCTUnwrap(CardEngine.decide(&d))
        XCTAssertEqual(card.type, "birthday")
        _ = CardEngine.resolve(&d, id: card.id, approve: false) // even a dismissal counts
        XCTAssertNotNil(d.nudged["bday:\(p.id):\(year)"])
        XCTAssertNil(CardEngine.decide(&d), "one birthday nudge per person per year")
    }

    func testBirthdayMoreThanAWeekOutStaysQuiet() {
        var d = AppData()
        let tenDaysOut = Calendar.current.date(byAdding: .day, value: 10, to: Date())!
        d.people = [Person(name: "Sam", birthday: String(DateKit.todayString(tenDaysOut).suffix(5)))]
        XCTAssertNil(CardEngine.decide(&d))
    }

    func testPromiseGates() {
        var d = AppData()
        d.promises = [
            PromiseItem(text: "they owe me lunch", direction: "owed_to_me", due: DateKit.todayString()),
            PromiseItem(text: "far away", due: DateKit.addDaysString(5)),
        ]
        XCTAssertNil(CardEngine.decide(&d), "owed_to_me and far-future promises never nudge")
    }

    func testDriftNeedsCloseRelationAndThreeWeeksQuiet() throws {
        var d = AppData()
        d.people = [
            Person(name: "Nora", mentionedAt: nowMs() - 40 * 86_400_000),                     // no relation
            Person(name: "Vik", relation: "client", mentionedAt: nowMs() - 40 * 86_400_000),  // not close
            Person(name: "Asha", relation: "friend", mentionedAt: nowMs() - 10 * 86_400_000), // too recent
        ]
        XCTAssertNil(CardEngine.decide(&d))

        let ravi = Person(name: "Ravi", relation: "family", mentionedAt: nowMs() - 22 * 86_400_000)
        d.people.append(ravi)
        let card = try XCTUnwrap(CardEngine.decide(&d))
        XCTAssertEqual(card.type, "drift")
        XCTAssertEqual(card.personId, ravi.id)
    }

    func testDriftWeeklyAndPerPersonCaps() throws {
        var d = AppData()
        let p = Person(name: "Ravi", relation: "friend", mentionedAt: nowMs() - 40 * 86_400_000)
        d.people = [p]

        d.nudged["drift:last"] = nowMs() - 3 * 86_400_000
        XCTAssertNil(CardEngine.decide(&d), "a drift card in the last week blocks all drift")

        d.nudged["drift:last"] = nowMs() - 8 * 86_400_000
        d.nudged["drift:\(p.id)"] = nowMs() - 5 * 86_400_000
        XCTAssertNil(CardEngine.decide(&d), "the same person is not re-drifted within 30 days")

        d.nudged["drift:\(p.id)"] = nowMs() - 31 * 86_400_000
        let card = try XCTUnwrap(CardEngine.decide(&d))
        XCTAssertEqual(card.type, "drift")
        XCTAssertEqual(card.personId, p.id)
    }

    func testResolveIsSafeOnUnknownAndAlreadyResolvedCards() throws {
        var d = AppData()
        XCTAssertNil(CardEngine.resolve(&d, id: "missing", approve: true))

        d.reminders = [Reminder(text: "pay rent", when: DateKit.todayString())]
        let card = try XCTUnwrap(CardEngine.decide(&d))
        XCTAssertNotNil(CardEngine.resolve(&d, id: card.id, approve: true))
        XCTAssertNil(CardEngine.resolve(&d, id: card.id, approve: true), "a card resolves exactly once")
    }
}

// MARK: - brain parsing

final class BrainParsingTests: XCTestCase {

    // "YYYY-MM-DD HH:mm" -> epoch ms through the same calendar the app uses
    private func epochMs(_ ymd: String, _ hour: Int, _ minute: Int) -> Int64 {
        let parts = ymd.split(separator: "-").compactMap { Int($0) }
        var c = DateComponents()
        c.year = parts[0]; c.month = parts[1]; c.day = parts[2]
        c.hour = hour; c.minute = minute; c.second = 0
        return Int64(Calendar.current.date(from: c)!.timeIntervalSince1970 * 1000)
    }

    // what the model would write for a given instant, minute precision
    private func modelClockString(_ date: Date) -> String {
        let c = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute], from: date)
        return String(format: "%04d-%02d-%02d %02d:%02d", c.year!, c.month!, c.day!, c.hour!, c.minute!)
    }

    private func minuteEpoch(_ date: Date) -> Int64 {
        var c = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute], from: date)
        c.second = 0
        return Int64(Calendar.current.date(from: c)!.timeIntervalSince1970 * 1000)
    }

    // ---- parseJSONBlock ----

    func testParseJSONBlockPlain() {
        let obj = Brain.parseJSONBlock(#"{"reply":"hi there"}"#)
        XCTAssertEqual(obj?["reply"] as? String, "hi there")
    }

    func testParseJSONBlockStripsCodeFences() {
        let raw = "sure, here you go:\n```json\n{\"reply\":\"kept it\"}\n```"
        XCTAssertEqual(Brain.parseJSONBlock(raw)?["reply"] as? String, "kept it")
    }

    func testParseJSONBlockStripsThinkBlocks() {
        let raw = "<think>\nthe user wants { strict json } so i will comply\n</think>\n{\"reply\":\"done\"}"
        XCTAssertEqual(Brain.parseJSONBlock(raw)?["reply"] as? String, "done")
    }

    func testParseJSONBlockGarbageIsNil() {
        XCTAssertNil(Brain.parseJSONBlock("no structured output at all"))
        XCTAssertNil(Brain.parseJSONBlock("{ this is not json }"))
        XCTAssertNil(Brain.parseJSONBlock("{{{"))
        XCTAssertNil(Brain.parseJSONBlock(""))
    }

    // ---- extractionFrom ----

    func testExtractionMapsAllSections() throws {
        let tomorrow = DateKit.addDaysString(1)
        let people: [[String: Any]] = [
            ["name": "Priya", "relation": "friend", "birthday": "06-28",
             "wants": ["tulips", "dark chocolate"], "interests": ["climbing"],
             "care": "worried about her exams", "note": "met at the gym"],
            ["name": "", "relation": "friend"],                       // nameless: skipped
            ["name": "Sam", "relation": NSNull(), "birthday": "june 28"], // natural date path
        ]
        let promises: [[String: Any]] = [
            ["text": "buy sam a coffee", "person": "Sam", "direction": "owed_to_me", "due": "2027-01-15"],
            ["text": "send the deck", "person": NSNull(), "direction": "gibberish", "due": "tomorrow"],
            ["text": ""],                                             // empty: skipped
        ]
        let reminders: [[String: Any]] = [
            ["text": "pay rent", "at": "\(tomorrow) 09:30"],
            ["text": "pack bags", "when": "tomorrow"],
            ["text": "join standup", "at": "\(tomorrow)T18:05"],      // T separator also accepted
            ["text": ""],                                             // empty: skipped
        ]
        let obj: [String: Any] = [
            "people": people, "promises": promises, "reminders": reminders,
            "pulse": ["valence": 1, "mood": "good"] as [String: Any],
        ]

        // "pay rent" carries no time phrase, so the deterministic override stays out
        let ex = Brain.extractionFrom(obj, text: "remind me to pay rent")

        XCTAssertEqual(ex.people.count, 2)
        XCTAssertEqual(ex.people[0].name, "Priya")
        XCTAssertEqual(ex.people[0].relation, "friend")
        XCTAssertEqual(ex.people[0].birthday, "06-28", "MM-DD passes straight through")
        XCTAssertEqual(ex.people[0].wants, ["tulips", "dark chocolate"])
        XCTAssertEqual(ex.people[0].interests, ["climbing"])
        XCTAssertEqual(ex.people[0].care, "worried about her exams")
        XCTAssertEqual(ex.people[0].note, "met at the gym")
        XCTAssertEqual(ex.people[1].name, "Sam")
        XCTAssertNil(ex.people[1].relation)
        XCTAssertEqual(ex.people[1].birthday, "06-28", "natural language dates go through parseMonthDay")

        XCTAssertEqual(ex.promises.count, 2)
        XCTAssertEqual(ex.promises[0].direction, "owed_to_me")
        XCTAssertEqual(ex.promises[0].person, "Sam")
        XCTAssertEqual(ex.promises[0].due, "2027-01-15")
        XCTAssertEqual(ex.promises[1].direction, "i_owe", "anything but owed_to_me collapses to i_owe")
        XCTAssertNil(ex.promises[1].person)
        XCTAssertEqual(ex.promises[1].due, tomorrow, "natural dues go through parseWhen")

        XCTAssertEqual(ex.reminders.count, 3)
        XCTAssertEqual(ex.reminders[0].at, epochMs(tomorrow, 9, 30))
        XCTAssertNil(ex.reminders[0].when)
        XCTAssertEqual(ex.reminders[1].when, tomorrow)
        XCTAssertNil(ex.reminders[1].at)
        XCTAssertEqual(ex.reminders[2].at, epochMs(tomorrow, 18, 5))

        let pulse = try XCTUnwrap(ex.pulse)
        XCTAssertEqual(pulse.valence, 1)
        XCTAssertEqual(pulse.mood, "good")
    }

    func testPulseNullOrEmptyMoodIsDropped() {
        XCTAssertNil(Brain.extractionFrom(["pulse": NSNull()], text: "hello").pulse)
        let empty: [String: Any] = ["pulse": ["valence": 2, "mood": ""] as [String: Any]]
        XCTAssertNil(Brain.extractionFrom(empty, text: "hello").pulse)
    }

    func testDeterministicParseAtOverridesAWrongModelClock() throws {
        // the model hallucinates a clock two hours off; the text says 30 minutes
        let wrong = Date().addingTimeInterval(2 * 3600)
        let reminders: [[String: Any]] = [
            ["text": "call mom", "at": modelClockString(wrong), "when": "tomorrow"],
        ]
        let obj: [String: Any] = ["reminders": reminders]

        let before = nowMs()
        let ex = Brain.extractionFrom(obj, text: "remind me to call mom in 30 minutes")
        let after = nowMs()

        let at = try XCTUnwrap(ex.reminders.first?.at)
        XCTAssertGreaterThanOrEqual(at, before + 30 * 60_000, "in 30 minutes means exactly 30 minutes")
        XCTAssertLessThanOrEqual(at, after + 30 * 60_000)
        XCTAssertNil(ex.reminders.first?.when, "the override also clears the day-level when")
    }

    func testModelClockWithinFiveMinutesIsKept() {
        // the model agrees with the deterministic parse to the minute: keep it
        let target = Date().addingTimeInterval(30 * 60)
        let reminders: [[String: Any]] = [["text": "stretch", "at": modelClockString(target)]]
        let ex = Brain.extractionFrom(["reminders": reminders], text: "remind me to stretch in 30 minutes")
        XCTAssertEqual(ex.reminders.first?.at, minuteEpoch(target))
    }

    func testFarFutureAtIsNulledBySanityCap() throws {
        let far = Calendar.current.date(byAdding: .day, value: 400, to: Date())!
        let reminders: [[String: Any]] = [["text": "renew passport", "at": modelClockString(far)]]
        let ex = Brain.extractionFrom(["reminders": reminders], text: "the passport thing")
        XCTAssertEqual(ex.reminders.count, 1, "the reminder itself survives")
        XCTAssertNil(ex.reminders[0].at, "an at more than 366 days out is a model fumble, nulled")
    }
}

// MARK: - schema compatibility

final class SchemaCompatibilityTests: XCTestCase {

    // shaped like the web version's export, plus unknown fields at the top
    // level and inside a person, which the ios app must ignore on import
    private let webExport = """
    {
      "version": 7,
      "exportedAt": 1755000000000,
      "settings": { "theme": "dark", "openrouterModel": "gemini" },
      "messages": [
        { "id": "m1", "role": "you", "text": "hi", "ts": 1755000000000 },
        { "id": "m2", "role": "aura", "text": "hey", "ts": 1755000001000,
          "chips": [ { "label": "priya", "tone": "person" } ] }
      ],
      "people": [
        {
          "id": "p1", "name": "Priya", "relation": "friend", "birthday": "06-28",
          "interests": ["climbing"], "wants": ["tulips"], "care": "worried about exams",
          "notes": [ { "text": "met at the gym", "ts": 1755000000000 } ],
          "mentionedAt": 1755000000000, "createdAt": 1754000000000,
          "avatar": "web-only-field"
        }
      ],
      "promises": [
        { "id": "pr1", "text": "buy her a coffee", "person": "Priya", "direction": "i_owe",
          "due": "2026-12-01", "status": "open", "createdAt": 1755000000000 }
      ],
      "reminders": [
        { "id": "r1", "text": "pay rent", "when": "2026-09-01", "status": "open",
          "createdAt": 1755000000000 }
      ],
      "notes": [
        { "id": "n1", "text": "a loose thought", "ts": 1755000000000, "chips": [] }
      ],
      "pulse": [ { "ts": 1755000000000, "valence": 1, "mood": "good" } ],
      "cards": [],
      "nudged": { "drift:last": 1750000000000 }
    }
    """

    func testWebExportWithUnknownFieldsDecodes() throws {
        let d = try JSONDecoder().decode(AppData.self, from: Data(webExport.utf8))

        XCTAssertEqual(d.messages.count, 2)
        XCTAssertEqual(d.messages[1].chips?.first?.label, "priya")

        XCTAssertEqual(d.people.count, 1)
        XCTAssertEqual(d.people[0].id, "p1")
        XCTAssertEqual(d.people[0].name, "Priya")
        XCTAssertEqual(d.people[0].relation, "friend")
        XCTAssertEqual(d.people[0].birthday, "06-28")
        XCTAssertEqual(d.people[0].wants, ["tulips"])
        XCTAssertEqual(d.people[0].notes.first?.text, "met at the gym")
        XCTAssertEqual(d.people[0].mentionedAt, 1_755_000_000_000)

        XCTAssertEqual(d.promises.first?.due, "2026-12-01")
        XCTAssertEqual(d.promises.first?.direction, "i_owe")
        XCTAssertEqual(d.reminders.first?.when, "2026-09-01")
        XCTAssertNil(d.reminders.first?.at)
        XCTAssertEqual(d.pulse.first?.valence, 1)
        XCTAssertEqual(d.nudged["drift:last"], 1_750_000_000_000)
        XCTAssertTrue(d.cards.isEmpty)
    }

    func testUnknownFieldsDoNotSurviveARoundTrip() throws {
        let d = try JSONDecoder().decode(AppData.self, from: Data(webExport.utf8))
        let out = String(data: try JSONEncoder().encode(d), encoding: .utf8)!
        XCTAssertFalse(out.contains("exportedAt"), "web-only top-level fields are dropped")
        XCTAssertFalse(out.contains("web-only-field"), "unknown nested fields are dropped")
        XCTAssertTrue(out.contains("\"nudged\""), "known fields are preserved")
    }

    func testOldFormatSettingsDecodeWithDefaults() throws {
        let old = """
        {"openrouterKey":"x","openrouterModel":"y","userName":"dan","voiceReplies":true,"locationNudges":false}
        """
        let s = try JSONDecoder().decode(Store.Settings.self, from: Data(old.utf8))
        XCTAssertEqual(s.userName, "dan", "the old name survives the update")
        XCTAssertTrue(s.voiceReplies)
        XCTAssertFalse(s.locationNudges)
        XCTAssertFalse(s.aiConsent, "new consent flag defaults off, never assumed")
        XCTAssertEqual(s.speechLang, "auto")
        XCTAssertEqual(s.relayOverride, "")
    }

    func testEmptySettingsDecodeToDefaults() throws {
        let s = try JSONDecoder().decode(Store.Settings.self, from: Data("{}".utf8))
        XCTAssertEqual(s.userName, "")
        XCTAssertFalse(s.voiceReplies)
        XCTAssertFalse(s.locationNudges)
        XCTAssertFalse(s.aiConsent)
        XCTAssertEqual(s.speechLang, "auto")
        XCTAssertEqual(s.relayOverride, "")
    }
}
