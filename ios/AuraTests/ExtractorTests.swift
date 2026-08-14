// ExtractorTests.swift, the pattern brain under test.
// covers Extractor.extract (reminders, birthdays, met-notes, wants, relations,
// promises, pulse), looksLikeName, Extractor.apply merging into AppData, and
// composeLocalReply. note: extract() lowercases its input internally, so every
// name and body it returns is lowercase; apply() is what re-capitalizes names.

import XCTest
@testable import Aura

final class ExtractorTests: XCTestCase {

    // MARK: - reminders

    func testReminderTomorrowStripsTrailingDayFromBody() throws {
        // bracket the call so a midnight rollover mid-test cannot flake the date
        let expectedBefore = DateKit.addDaysString(1)
        let ex = Extractor.extract("Remind me to call mom tomorrow")
        let expectedAfter = DateKit.addDaysString(1)

        let r = try XCTUnwrap(ex.reminders.first)
        XCTAssertEqual(r.text, "call mom", "trailing day word must be stripped, body lowercased")
        XCTAssertTrue(r.when == expectedBefore || r.when == expectedAfter, "when should be tomorrow as YYYY-MM-DD")
        XCTAssertNil(r.at)
        XCTAssertNil(r.place)
    }

    func testReminderAtExactTimeStripsTrailingTimeFromBody() throws {
        let ex = Extractor.extract("remind me to email raj at 6pm")
        let r = try XCTUnwrap(ex.reminders.first)
        XCTAssertEqual(r.text, "email raj", "trailing clock time must be stripped from the body")
        XCTAssertNil(r.when, "an exact time wins; no day-level when")
        XCTAssertNil(r.place)

        let at = try XCTUnwrap(r.at)
        XCTAssertGreaterThan(at, nowMs() - 60_000, "parsed time is always in the future")
        let c = Calendar.current.dateComponents([.hour, .minute],
                                                from: Date(timeIntervalSince1970: Double(at) / 1000))
        XCTAssertEqual(c.hour, 18)
        XCTAssertEqual(c.minute, 0)
    }

    func testReminderInThirtyMinutes() throws {
        let before = nowMs()
        let ex = Extractor.extract("remind me to stretch in 30 minutes")
        let after = nowMs()

        let r = try XCTUnwrap(ex.reminders.first)
        XCTAssertEqual(r.text, "stretch")
        XCTAssertNil(r.when)
        let at = try XCTUnwrap(r.at)
        XCTAssertGreaterThanOrEqual(at, before + 30 * 60_000)
        XCTAssertLessThanOrEqual(at, after + 30 * 60_000)
    }

    func testReminderWithPlace() throws {
        let ex = Extractor.extract("remind me to get medicine when i'm at the pharmacy")
        let r = try XCTUnwrap(ex.reminders.first)
        XCTAssertEqual(r.text, "get medicine")
        XCTAssertEqual(r.place, "the pharmacy")
        XCTAssertNil(r.when)
        XCTAssertNil(r.at)
    }

    func testReminderWithNoTimeKeepsFullBody() throws {
        let ex = Extractor.extract("remind me to water the plants")
        let r = try XCTUnwrap(ex.reminders.first)
        XCTAssertEqual(r.text, "water the plants")
        XCTAssertNil(r.when)
        XCTAssertNil(r.at)
        XCTAssertNil(r.place)
    }

    func testReminderBranchReturnsEarly() {
        // the reminder path returns before people extraction runs
        let ex = Extractor.extract("remind me to text priya tomorrow")
        XCTAssertEqual(ex.reminders.count, 1)
        XCTAssertTrue(ex.people.isEmpty, "names inside a reminder body must not become people")
    }

    // MARK: - birthdays

    func testBirthdayMonthDay() throws {
        let ex = Extractor.extract("Sam's birthday is June 28th")
        let p = try XCTUnwrap(ex.people.first)
        XCTAssertEqual(p.name, "sam", "extract() lowercases input, so the raw extracted name is lowercase")
        XCTAssertEqual(p.birthday, "06-28")
    }

    func testBirthdayDayMonthVariant() throws {
        let ex = Extractor.extract("priya's birthday is on 12 march")
        let p = try XCTUnwrap(ex.people.first)
        XCTAssertEqual(p.name, "priya")
        XCTAssertEqual(p.birthday, "03-12")
    }

    // MARK: - met notes

    func testMetAtPlaceBecomesNote() throws {
        let ex = Extractor.extract("met priya at the climbing gym")
        let p = try XCTUnwrap(ex.people.first)
        XCTAssertEqual(p.name, "priya")
        XCTAssertEqual(p.note, "met at the climbing gym")
    }

    // MARK: - wants

    func testPronounWantAttachesToPrecedingPerson() throws {
        let ex = Extractor.extract("met dan at the gym. he's obsessed with chocolate cake")
        let p = try XCTUnwrap(ex.people.first)
        XCTAssertEqual(p.name, "dan")
        XCTAssertEqual(p.wants, ["chocolate cake"], "the pronoun want should attach to the person just mentioned")
    }

    func testPronounWantWithoutAnyPersonIsDropped() {
        let ex = Extractor.extract("he's obsessed with chocolate cake")
        XCTAssertTrue(ex.people.isEmpty, "a pronoun with nobody to attach to yields no person")
    }

    func testNamedWant() throws {
        let ex = Extractor.extract("Sarah loves tulips")
        let p = try XCTUnwrap(ex.people.first)
        XCTAssertEqual(p.name, "sarah")
        XCTAssertEqual(p.wants, ["tulips"])
    }

    // MARK: - relations

    func testRelationMapping() throws {
        let cases: [(input: String, name: String, relation: String)] = [
            ("my friend sam", "sam", "friend"),
            ("my sister ana", "ana", "family"),
            ("my colleague raj", "raj", "collaborator"),
            ("my girlfriend mia", "mia", "partner"),
        ]
        for c in cases {
            let ex = Extractor.extract(c.input)
            let p = try XCTUnwrap(ex.people.first, "no person extracted from \(c.input)")
            XCTAssertEqual(p.name, c.name, "for input: \(c.input)")
            XCTAssertEqual(p.relation, c.relation, "for input: \(c.input)")
        }
    }

    // MARK: - promises

    func testIOwePromiseWithDue() throws {
        let expectedBefore = DateKit.parseWhen("friday")
        let ex = Extractor.extract("i owe jake a coffee by friday")
        let expectedAfter = DateKit.parseWhen("friday")

        let pr = try XCTUnwrap(ex.promises.first)
        XCTAssertEqual(pr.person, "jake")
        XCTAssertEqual(pr.text, "a coffee", "the due clause must be stripped from the promise text")
        XCTAssertEqual(pr.direction, "i_owe")
        XCTAssertNotNil(pr.due)
        XCTAssertTrue(pr.due == expectedBefore || pr.due == expectedAfter, "due should be next friday as YYYY-MM-DD")
    }

    func testOwedToMePromise() throws {
        let ex = Extractor.extract("jake owes me $20")
        let pr = try XCTUnwrap(ex.promises.first)
        XCTAssertEqual(pr.person, "jake")
        XCTAssertEqual(pr.text, "$20")
        XCTAssertEqual(pr.direction, "owed_to_me")
        XCTAssertNil(pr.due)
    }

    func testPromisedStripsLeadingThatId() throws {
        let ex = Extractor.extract("i promised ana that i'd call her")
        let pr = try XCTUnwrap(ex.promises.first)
        XCTAssertEqual(pr.person, "ana")
        XCTAssertEqual(pr.text, "call her", "leading \"that i'd\" must be scrubbed off")
        XCTAssertEqual(pr.direction, "i_owe")
    }

    // MARK: - pulse

    func testPulseFeelingRough() throws {
        let ex = Extractor.extract("i'm feeling rough")
        let p = try XCTUnwrap(ex.pulse)
        XCTAssertEqual(p.valence, -2)
        XCTAssertEqual(p.mood, "rough")
    }

    func testPulseFeelingGreat() throws {
        let ex = Extractor.extract("feeling great")
        let p = try XCTUnwrap(ex.pulse)
        XCTAssertEqual(p.valence, 2)
        XCTAssertEqual(p.mood, "great")
    }

    func testPulseImTiredFallbackBranch() throws {
        // no "feeling" verb; the second, "i'm <mood>" regex should catch it
        let ex = Extractor.extract("i'm tired")
        let p = try XCTUnwrap(ex.pulse)
        XCTAssertEqual(p.valence, -1)
        XCTAssertEqual(p.mood, "tired")
    }

    func testPulseRejectsNonMoodWord() {
        XCTAssertNil(Extractor.extract("i'm feeling purple").pulse, "unknown words must not register as mood")
    }

    // MARK: - looksLikeName

    func testLooksLikeName() {
        XCTAssertTrue(Extractor.looksLikeName("sam"))
        XCTAssertTrue(Extractor.looksLikeName("priya"))
        XCTAssertTrue(Extractor.looksLikeName("jean-luc"))
        XCTAssertTrue(Extractor.looksLikeName("Sam"), "case-insensitive shape check")

        // stopwords and non-name shapes
        XCTAssertFalse(Extractor.looksLikeName("tomorrow"))
        XCTAssertFalse(Extractor.looksLikeName("he"))
        XCTAssertFalse(Extractor.looksLikeName("the"))
        XCTAssertFalse(Extractor.looksLikeName("remind"))
        XCTAssertFalse(Extractor.looksLikeName("someone"))
        XCTAssertFalse(Extractor.looksLikeName("i"), "too short and a stopword")
        XCTAssertFalse(Extractor.looksLikeName("x"), "a single letter is not a name")
        XCTAssertFalse(Extractor.looksLikeName("sam3"), "digits are not part of a name")
    }

    // MARK: - apply, merging into AppData

    func testApplyCreatesCapitalizedPersonWithBirthdayChip() {
        var d = AppData()
        let ex = Extractor.extract("Sam's birthday is June 28th")
        let chips = Extractor.apply(ex, to: &d)

        XCTAssertEqual(d.people.count, 1)
        XCTAssertEqual(d.people[0].name, "Sam", "apply() capitalizes the lowercase extracted name")
        XCTAssertEqual(d.people[0].birthday, "06-28")

        XCTAssertEqual(chips.count, 1)
        XCTAssertEqual(chips[0].tone, "date")
        XCTAssertTrue(chips[0].label.hasPrefix("sam · "), "birthday chip is 'name · <birthday label>'")
    }

    func testApplyDedupesByCaseInsensitiveNameAndUpdates() {
        var d = AppData()
        var existing = Person(name: "Sam")
        existing.mentionedAt = 1
        d.people = [existing]

        let start = nowMs()
        var ex = Extraction()
        ex.people = [ExtractedPerson(name: "sam", relation: "friend", birthday: "06-28")]
        Extractor.apply(ex, to: &d)

        XCTAssertEqual(d.people.count, 1, "sam must merge into Sam, not duplicate")
        XCTAssertEqual(d.people[0].name, "Sam", "the stored casing is kept")
        XCTAssertEqual(d.people[0].relation, "friend", "relation updated on the existing person")
        XCTAssertEqual(d.people[0].birthday, "06-28", "birthday updated on the existing person")
        XCTAssertGreaterThanOrEqual(d.people[0].mentionedAt, start, "mentionedAt must be bumped")
    }

    func testApplyWantsDedupe() {
        var d = AppData()
        var sarah = Person(name: "Sarah")
        sarah.wants = ["tulips"]
        d.people = [sarah]

        var ex = Extraction()
        ex.people = [ExtractedPerson(name: "sarah", wants: ["tulips", "daisies"])]
        let chips = Extractor.apply(ex, to: &d)

        XCTAssertEqual(d.people.count, 1)
        XCTAssertEqual(d.people[0].wants, ["tulips", "daisies"], "existing want must not duplicate")
        XCTAssertEqual(chips, [Chip(label: "sarah · gift idea", tone: "gift")])
    }

    func testApplyPersonNoteAndPlainPersonChip() {
        var d = AppData()
        var ex = Extraction()
        ex.people = [ExtractedPerson(name: "priya", note: "met at the climbing gym")]
        let chips = Extractor.apply(ex, to: &d)

        XCTAssertEqual(d.people.count, 1)
        XCTAssertEqual(d.people[0].name, "Priya")
        XCTAssertEqual(d.people[0].notes.map(\.text), ["met at the climbing gym"])
        XCTAssertEqual(chips, [Chip(label: "priya", tone: "person")])
    }

    func testApplyPromiseAutoCreatesPerson() {
        var d = AppData()
        var ex = Extraction()
        ex.promises = [ExtractedPromise(text: "a coffee", person: "jake")]
        let chips = Extractor.apply(ex, to: &d)

        XCTAssertEqual(d.people.count, 1, "a promise involving an unknown person creates them")
        XCTAssertEqual(d.people[0].name, "Jake")
        XCTAssertEqual(d.promises.count, 1)
        XCTAssertEqual(d.promises[0].person, "Jake")
        XCTAssertEqual(d.promises[0].direction, "i_owe")
        XCTAssertEqual(d.promises[0].status, "open")
        XCTAssertEqual(chips, [Chip(label: "promise", tone: "promise")])
    }

    func testApplyPromiseBumpsExistingPersonMentionedAt() {
        var d = AppData()
        var jake = Person(name: "Jake")
        jake.mentionedAt = 1
        d.people = [jake]

        let start = nowMs()
        var ex = Extraction()
        ex.promises = [ExtractedPromise(text: "a coffee", person: "jake")]
        Extractor.apply(ex, to: &d)

        XCTAssertEqual(d.people.count, 1, "no duplicate person for a promise about someone known")
        XCTAssertGreaterThanOrEqual(d.people[0].mentionedAt, start, "a promise counts as contact for drift")
    }

    func testApplyReminderChips() {
        var d = AppData()
        let when = DateKit.addDaysString(1)
        var ex = Extraction()
        ex.reminders = [
            ExtractedReminder(text: "get medicine", place: "the pharmacy"),
            ExtractedReminder(text: "call mom"),
            ExtractedReminder(text: "buy milk", when: when),
        ]
        let chips = Extractor.apply(ex, to: &d)

        XCTAssertEqual(d.reminders.count, 3)
        XCTAssertEqual(d.reminders.map(\.text), ["get medicine", "call mom", "buy milk"])
        XCTAssertEqual(chips.count, 3)
        XCTAssertEqual(chips[0], Chip(label: "at the pharmacy", tone: "place"))
        XCTAssertEqual(chips[1], Chip(label: "remembered", tone: "date"))
        XCTAssertEqual(chips[2], Chip(label: DateKit.dayLabel(when), tone: "date"))
    }

    func testApplySkipsEmptyReminderText() {
        var d = AppData()
        var ex = Extraction()
        ex.reminders = [ExtractedReminder(text: "")]
        let chips = Extractor.apply(ex, to: &d)

        XCTAssertTrue(d.reminders.isEmpty, "an empty reminder body must not be stored")
        XCTAssertTrue(chips.isEmpty)
    }

    func testApplyPulseClampsValenceAndChips() {
        var d = AppData()
        var ex = Extraction()
        ex.pulse = ExtractedPulse(valence: 5, mood: "great")
        let chips = Extractor.apply(ex, to: &d)

        XCTAssertEqual(d.pulse.count, 1)
        XCTAssertEqual(d.pulse[0].valence, 2, "valence is clamped to -2...2")
        XCTAssertEqual(d.pulse[0].mood, "great")
        XCTAssertEqual(chips, [Chip(label: "great", tone: "pulse")])
    }

    func testApplyIgnoresMoodlessPulse() {
        var d = AppData()
        var ex = Extraction()
        ex.pulse = ExtractedPulse(valence: 1, mood: nil)
        let chips = Extractor.apply(ex, to: &d)

        XCTAssertTrue(d.pulse.isEmpty, "a pulse without a mood word is dropped")
        XCTAssertTrue(chips.isEmpty)
    }

    // MARK: - composeLocalReply

    func testReplyBirthdayKept() {
        var ex = Extraction()
        ex.people = [ExtractedPerson(name: "sam", birthday: "06-28")]
        let reply = Extractor.composeLocalReply(ex)
        XCTAssertTrue(reply.contains("sam's birthday is"), "got: \(reply)")
        XCTAssertTrue(reply.contains("kept"), "got: \(reply)")
    }

    func testReplyReminderHeld() {
        var ex = Extraction()
        ex.reminders = [ExtractedReminder(text: "call mom")]
        XCTAssertEqual(Extractor.composeLocalReply(ex), "holding onto \"call mom\".")
    }

    func testReplyReminderAtPlace() {
        var ex = Extraction()
        ex.reminders = [ExtractedReminder(text: "get medicine", place: "the pharmacy")]
        XCTAssertEqual(Extractor.composeLocalReply(ex),
                       "i'll bring \"get medicine\" back when you're at the pharmacy.")
    }

    func testReplyPromiseTracked() {
        var iOwe = Extraction()
        iOwe.promises = [ExtractedPromise(text: "a coffee", person: "jake")]
        XCTAssertEqual(Extractor.composeLocalReply(iOwe), "tracking it, for jake.")

        var owedToMe = Extraction()
        owedToMe.promises = [ExtractedPromise(text: "$20", person: "jake", direction: "owed_to_me")]
        XCTAssertEqual(Extractor.composeLocalReply(owedToMe), "tracking it, jake owes you.")
    }

    func testReplyEmptyFallback() {
        // the fallback is honest now: it names what the simple brain can and
        // cannot follow instead of deflecting with "i'm listening"
        let reply = Extractor.composeLocalReply(Extraction())
        XCTAssertTrue(reply.contains("simple brain"), "fallback must admit its limits: \(reply)")
        XCTAssertTrue(reply.contains("kal doodh lena hai"), "fallback should teach a hinglish example")
    }
}
