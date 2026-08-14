// HinglishTests.swift, the free floor speaks hinglish and hindi now. these are
// the exact phrases the consumer test failed on, kept green forever.

import XCTest
@testable import Aura

final class HinglishTests: XCTestCase {

    private func hour(of ms: Int64) -> Int {
        Calendar.current.component(.hour, from: Date(timeIntervalSince1970: Double(ms) / 1000))
    }

    // ---- the consumer test's exact failures ----

    func testYaarKalDoodh() {
        let ex = Extractor.extract("yaar mujhe kal doodh lena hai")
        XCTAssertEqual(ex.reminders.count, 1)
        XCTAssertTrue(ex.reminders[0].text.contains("doodh"))
        XCTAssertEqual(ex.reminders[0].when, DateKit.addDaysString(1))
        XCTAssertNil(ex.reminders[0].at)
    }

    func testDevanagariKalDoodh() {
        let ex = Extractor.extract("मुझे कल दूध लेना है")
        XCTAssertEqual(ex.reminders.count, 1)
        XCTAssertTrue(ex.reminders[0].text.contains("दूध"))
        XCTAssertEqual(ex.reminders[0].when, DateKit.addDaysString(1))
    }

    func testKalSubahMummyCall() {
        let ex = Extractor.extract("kal subah mummy ko call karna hai yaad dilana")
        XCTAssertEqual(ex.reminders.count, 1)
        XCTAssertTrue(ex.reminders[0].text.contains("call"))
        let at = ex.reminders[0].at
        XCTAssertNotNil(at, "kal subah carries both a day and an hour, so this should be an exact time")
        XCTAssertEqual(hour(of: at!), 9)
        XCTAssertEqual(DateKit.todayString(Date(timeIntervalSince1970: Double(at!) / 1000)), DateKit.addDaysString(1))
    }

    // ---- broader hinglish floor ----

    func testShaamKoSabzi() {
        let ex = Extractor.extract("shaam ko sabzi kharidni hai")
        XCTAssertEqual(ex.reminders.count, 1)
        XCTAssertTrue(ex.reminders[0].text.contains("sabzi"))
        XCTAssertNotNil(ex.reminders[0].at)
        XCTAssertEqual(hour(of: ex.reminders[0].at!), 19)
    }

    func testBajeClock() {
        let ex = Extractor.extract("kal 6 baje form bharna hai")
        XCTAssertEqual(ex.reminders.count, 1)
        let at = ex.reminders[0].at
        XCTAssertNotNil(at)
        XCTAssertEqual(hour(of: at!), 18, "a bare small 'baje' number leans evening")
    }

    func testEnglishFloorUntouched() {
        // the hinglish branch must not swallow english patterns
        let ex = Extractor.extract("remind me to call mom tomorrow")
        XCTAssertEqual(ex.reminders.count, 1)
        XCTAssertEqual(ex.reminders[0].text, "call mom")
        let promise = Extractor.extract("i owe jake a coffee by friday")
        XCTAssertTrue(promise.reminders.isEmpty)
        XCTAssertEqual(promise.promises.count, 1)
    }

    func testPlainChatterIsNotATask() {
        XCTAssertTrue(Extractor.extract("kya haal hai").reminders.isEmpty)
        XCTAssertTrue(Extractor.extract("thanks yaar").reminders.isEmpty)
    }

    // ---- deadline answers in hinglish ----

    func testKalSubahAsDeadlineAnswer() {
        let at = DateKit.parseDeadline("kal subah")
        XCTAssertNotNil(at)
        XCTAssertEqual(hour(of: at!), 9)
        XCTAssertEqual(DateKit.todayString(Date(timeIntervalSince1970: Double(at!) / 1000)), DateKit.addDaysString(1))
    }

    func testShaamTakAsDeadlineAnswer() {
        let at = DateKit.parseDeadline("shaam tak")
        XCTAssertNotNil(at)
        XCTAssertEqual(hour(of: at!), 19)
    }

    func testDevanagariDayAsDeadlineAnswer() {
        let at = DateKit.parseDeadline("कल")
        XCTAssertNotNil(at)
        XCTAssertEqual(hour(of: at!), 21, "a bare day answer ends at 21:00")
    }

    // ---- the honest fallback and date echoes ----

    func testHonestFallbackWhenNothingCaught() {
        let reply = Extractor.composeLocalReply(Extraction())
        XCTAssertTrue(reply.contains("simple brain"), "the empty fallback must admit its limits, not deflect")
    }

    func testPromiseReplyEchoesTheDate() {
        let ex = Extractor.extract("i owe jake a coffee by friday")
        let reply = Extractor.composeLocalReply(ex)
        XCTAssertTrue(reply.contains("jake"))
        XCTAssertTrue(reply.contains("by "), "the picked date must be said out loud: \(reply)")
    }

    func testPromiseChipCarriesTheDate() {
        var d = AppData()
        let ex = Extractor.extract("i owe jake a coffee by friday")
        let chips = Extractor.apply(ex, to: &d)
        XCTAssertTrue(chips.contains { $0.tone == "promise" && $0.label.contains("·") },
                      "promise chip should show the chosen date")
    }
}
