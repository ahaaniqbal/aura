// DeadlineTests.swift, the deadline engine: parsing casual "till when" answers
// and planning the four quarter-point nudges.

import XCTest
@testable import Aura

final class DeadlineTests: XCTestCase {

    // a fixed, deterministic "now": today at 10:00 local
    private var now: Date {
        var c = Calendar.current.dateComponents([.year, .month, .day], from: Date())
        c.hour = 10; c.minute = 0; c.second = 0
        return Calendar.current.date(from: c)!
    }
    private var nowEpoch: Int64 { Int64(now.timeIntervalSince1970 * 1000) }

    private func hour(of ms: Int64) -> Int {
        Calendar.current.component(.hour, from: Date(timeIntervalSince1970: Double(ms) / 1000))
    }
    private func minute(of ms: Int64) -> Int {
        Calendar.current.component(.minute, from: Date(timeIntervalSince1970: Double(ms) / 1000))
    }

    // ---- parseDeadline ----

    func testRelativeHours() {
        let at = DateKit.parseDeadline("in 10 hours", now: now)
        XCTAssertEqual(at, nowEpoch + 10 * 3_600_000)
    }

    func testRelativeHoursWithoutIn() {
        // answers often drop the "in": "10 hours"
        XCTAssertEqual(DateKit.parseDeadline("10 hours", now: now), nowEpoch + 10 * 3_600_000)
    }

    func testRelativeMinutes() {
        XCTAssertEqual(DateKit.parseDeadline("in 45 min", now: now), nowEpoch + 45 * 60_000)
    }

    func testBareClockPM() {
        let at = DateKit.parseDeadline("6pm", now: now)
        XCTAssertNotNil(at)
        XCTAssertEqual(hour(of: at!), 18)
        XCTAssertEqual(minute(of: at!), 0)
    }

    func testByPrefixedClockWithMinutes() {
        let at = DateKit.parseDeadline("by 6:30 pm", now: now)
        XCTAssertNotNil(at)
        XCTAssertEqual(hour(of: at!), 18)
        XCTAssertEqual(minute(of: at!), 30)
    }

    func testTwentyFourHourClock() {
        let at = DateKit.parseDeadline("18:30", now: now)
        XCTAssertNotNil(at)
        XCTAssertEqual(hour(of: at!), 18)
    }

    func testCoarseEvening() {
        let at = DateKit.parseDeadline("by evening", now: now)
        XCTAssertNotNil(at)
        XCTAssertEqual(hour(of: at!), 19)
    }

    func testCoarseTonight() {
        let at = DateKit.parseDeadline("tonight", now: now)
        XCTAssertNotNil(at)
        XCTAssertEqual(hour(of: at!), 21)
    }

    func testBareDayEndsAtNine() {
        let at = DateKit.parseDeadline("tomorrow", now: now)
        XCTAssertNotNil(at)
        XCTAssertEqual(hour(of: at!), 21)
        let day = DateKit.todayString(Date(timeIntervalSince1970: Double(at!) / 1000))
        XCTAssertEqual(day, DateKit.addDaysString(1))
    }

    func testTomorrowMorningCombination() {
        let at = DateKit.parseDeadline("tomorrow morning", now: now)
        XCTAssertNotNil(at)
        XCTAssertEqual(hour(of: at!), 9)
        let day = DateKit.todayString(Date(timeIntervalSince1970: Double(at!) / 1000))
        XCTAssertEqual(day, DateKit.addDaysString(1))
    }

    func testAnchorDayPinsClockAnswers() {
        // reminder said "tomorrow", answer says "6pm": deadline is tomorrow 6pm
        let anchor = DateKit.addDaysString(1)
        let at = DateKit.parseDeadline("6pm", now: now, anchorDay: anchor)
        XCTAssertNotNil(at)
        XCTAssertEqual(hour(of: at!), 18)
        XCTAssertEqual(DateKit.todayString(Date(timeIntervalSince1970: Double(at!) / 1000)), anchor)
    }

    func testGarbageIsNotADeadline() {
        XCTAssertNil(DateKit.parseDeadline("what's sam's birthday?", now: now))
        XCTAssertNil(DateKit.parseDeadline("thanks!", now: now))
        XCTAssertNil(DateKit.parseDeadline(nil, now: now))
    }

    // ---- quarterPoints ----

    func testTenHourSpanGivesFourEvenQuarters() {
        // the spec case: 10 hours -> nudges every 2.5 hours, last one at the deadline
        let created = nowEpoch
        let deadline = created + 10 * 3_600_000 // 10:00 -> 20:00, all waking hours
        let points = DateKit.quarterPoints(created: created, deadline: deadline, now: created)
        XCTAssertEqual(points.count, 4)
        XCTAssertEqual(points[0], created + 9_000_000)   // 2.5h
        XCTAssertEqual(points[1], created + 18_000_000)  // 5h
        XCTAssertEqual(points[2], created + 27_000_000)  // 7.5h
        XCTAssertEqual(points[3], deadline)              // exactly the end
    }

    func testFinalPointIsAlwaysTheDeadline() {
        let created = nowEpoch
        let deadline = created + 7 * 3_600_000
        let points = DateKit.quarterPoints(created: created, deadline: deadline, now: created)
        XCTAssertEqual(points.last, deadline)
    }

    func testPastPointsAreDropped() {
        // half the span already elapsed: only future points remain
        let created = nowEpoch - 5 * 3_600_000
        let deadline = nowEpoch + 5 * 3_600_000
        let points = DateKit.quarterPoints(created: created, deadline: deadline, now: nowEpoch)
        XCTAssertFalse(points.isEmpty)
        XCTAssertTrue(points.allSatisfy { $0 > nowEpoch })
        XCTAssertEqual(points.last, deadline)
    }

    func testExpiredDeadlineGivesNothing() {
        XCTAssertEqual(DateKit.quarterPoints(created: nowEpoch - 3_600_000, deadline: nowEpoch - 60_000, now: nowEpoch), [])
    }

    func testShortSpanCollapsesToDeadlineOnly() {
        // 10 minutes total: quarters land within 5 min of each other and collapse
        let created = nowEpoch
        let deadline = created + 10 * 60_000
        let points = DateKit.quarterPoints(created: created, deadline: deadline, now: created)
        XCTAssertEqual(points.last, deadline)
        XCTAssertTrue(points.count <= 2, "10 minutes should not produce four separate nudges")
    }

    func testSleepClampNeverMovesTheDeadline() {
        // overnight span: 20:00 today -> 09:00 tomorrow. quarters land in the
        // night and slide to 08:00; the deadline itself must stay 09:00.
        var c = Calendar.current.dateComponents([.year, .month, .day], from: Date())
        c.hour = 20; c.minute = 0; c.second = 0
        let evening = Calendar.current.date(from: c)!
        let created = Int64(evening.timeIntervalSince1970 * 1000)
        let deadline = created + 13 * 3_600_000 // 09:00 next day
        let points = DateKit.quarterPoints(created: created, deadline: deadline, now: created)
        XCTAssertEqual(points.last, deadline)
        for p in points.dropLast() {
            let h = hour(of: p)
            XCTAssertTrue(h >= 8 && h < 22, "quarter nudge at \(h):00 lands in sleeping hours")
        }
    }

    func testShiftOutOfSleepMovesLateNightToMorning() {
        var c = Calendar.current.dateComponents([.year, .month, .day], from: Date())
        c.hour = 23; c.minute = 30
        let lateNight = Int64(Calendar.current.date(from: c)!.timeIntervalSince1970 * 1000)
        let shifted = DateKit.shiftOutOfSleep(lateNight)
        XCTAssertEqual(hour(of: shifted), 8)
        XCTAssertTrue(shifted > lateNight)
    }

    func testDurationLabelIsHumanReadable() {
        let label = DateKit.durationLabel(2 * 3_600_000 + 30 * 60_000)
        XCTAssertFalse(label.isEmpty)
    }

    // ---- plain-words tasks feed the deadline flow ----

    func testPlainWordsTaskCreatesReminder() {
        let ex = Extractor.extract("i need to call sam today")
        XCTAssertEqual(ex.reminders.count, 1)
        XCTAssertEqual(ex.reminders[0].text, "call sam")
        XCTAssertEqual(ex.reminders[0].when, DateKit.addDaysString(0))
        XCTAssertNil(ex.reminders[0].at, "day-only tasks have no clock yet, so the app must ask")
    }

    func testPlainWordsTaskWithClockNeedsNoAsk() {
        let ex = Extractor.extract("i should call mom at 6pm")
        XCTAssertEqual(ex.reminders.count, 1)
        XCTAssertEqual(ex.reminders[0].text, "call mom")
        XCTAssertNotNil(ex.reminders[0].at)
    }

    func testGottaTaskWithByDay() {
        let ex = Extractor.extract("gotta submit the form by friday")
        XCTAssertEqual(ex.reminders.count, 1)
        XCTAssertEqual(ex.reminders[0].text, "submit the form")
        XCTAssertNotNil(ex.reminders[0].when)
    }

    func testOwePhrasingStaysAPromise() {
        let ex = Extractor.extract("i owe jake a coffee by friday")
        XCTAssertTrue(ex.reminders.isEmpty)
        XCTAssertEqual(ex.promises.count, 1)
    }
}
