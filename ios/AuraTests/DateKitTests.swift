// DateKitTests.swift
// Exhaustive tests for Aura/DateKit.swift.
//
// Determinism policy: DateKit.parseAt / futureTime take an injectable `now:`
// parameter and are tested against fixed instants built from today's calendar
// components. Everything that reads the real clock internally (parseWhen,
// timeLabel, dayLabel, daysUntilBirthday, weekTable, nowClock24) is tested
// against expectations computed from Date() with the SAME Calendar, so results
// track whatever day/time the suite runs on. No test assumes a hardcoded
// "today". A setUp guard sidesteps the only true race (a midnight rollover
// between computing an expectation and calling the function under test), and
// minute-sensitive checks accept a before/after pair of expectations.

import XCTest
@testable import Aura

final class DateKitTests: XCTestCase {

    private var cal: Calendar { Calendar.current }

    override func setUp() {
        super.setUp()
        // If the wall clock is within a couple of seconds of midnight, wait it
        // out so every "compute expectation, then call DateKit" pair inside a
        // single test sees the same calendar day. This makes the day-level
        // tests below race-free without hardcoding any date.
        let now = Date()
        if let nextMidnight = cal.nextDate(
            after: now,
            matching: DateComponents(hour: 0, minute: 0, second: 0),
            matchingPolicy: .nextTime
        ) {
            let gap = nextMidnight.timeIntervalSince(now)
            if gap < 2 { Thread.sleep(forTimeInterval: gap + 0.5) }
        }
    }

    // MARK: - Helpers (all derived from the live clock + Calendar.current)

    /// "YYYY-MM-DD" for the day `n` days from now, formatted exactly like DateKit.todayString.
    private func ymd(daysFromNow n: Int) -> String {
        let d = cal.date(byAdding: .day, value: n, to: Date())!
        let c = cal.dateComponents([.year, .month, .day], from: d)
        return String(format: "%04d-%02d-%02d", c.year!, c.month!, c.day!)
    }

    /// Lowercase english weekday name for the day `n` days from now.
    private func weekdayName(daysFromNow n: Int) -> String {
        let d = cal.date(byAdding: .day, value: n, to: Date())!
        return DateKit.days[cal.component(.weekday, from: d) - 1]
    }

    /// Today at hour:minute (seconds zeroed) in the local calendar — a fixed,
    /// reproducible `now` for the parseAt/futureTime tests.
    private func makeNow(hour: Int, minute: Int) -> Date {
        var c = cal.dateComponents([.year, .month, .day], from: Date())
        c.hour = hour; c.minute = minute; c.second = 0
        return cal.date(from: c)!
    }

    private func ms(_ d: Date) -> Int64 { Int64(d.timeIntervalSince1970 * 1000) }

    /// Epoch ms of today at hour:minute, plus `dayOffset` days.
    private func todayAt(hour: Int, minute: Int, dayOffset: Int = 0) -> Int64 {
        var d = makeNow(hour: hour, minute: minute)
        if dayOffset != 0 { d = cal.date(byAdding: .day, value: dayOffset, to: d)! }
        return ms(d)
    }

    /// Same rendering DateKit.clock12 uses, computed independently.
    private func clock12(_ at: Int64) -> String {
        let f = DateFormatter()
        f.dateFormat = "h:mm a"
        return f.string(from: Date(timeIntervalSince1970: Double(at) / 1000)).lowercased()
    }

    /// The documented month-day resolution rule for parseWhen: this year's
    /// occurrence, or next year's when that date has already passed.
    private func resolvedYear(forMonth month: Int, day: Int) -> String {
        let md = String(format: "%02d-%02d", month, day)
        let year = cal.component(.year, from: Date())
        let candidate = "\(String(format: "%04d", year))-\(md)"
        return candidate < ymd(daysFromNow: 0) ? "\(String(format: "%04d", year + 1))-\(md)" : candidate
    }

    // MARK: - parseMonthDay

    func testParseMonthDayMonthFirst() {
        XCTAssertEqual(DateKit.parseMonthDay("june 28th"), "06-28")
        XCTAssertEqual(DateKit.parseMonthDay("june 28"), "06-28")
        XCTAssertEqual(DateKit.parseMonthDay("january 5"), "01-05")
        XCTAssertEqual(DateKit.parseMonthDay("december 31"), "12-31")
    }

    func testParseMonthDayDayFirst() {
        XCTAssertEqual(DateKit.parseMonthDay("28 june"), "06-28")
        XCTAssertEqual(DateKit.parseMonthDay("5 january"), "01-05")
        XCTAssertEqual(DateKit.parseMonthDay("1st december"), "12-01")
    }

    func testParseMonthDaySlashForm() {
        XCTAssertEqual(DateKit.parseMonthDay("6/28"), "06-28")
        XCTAssertEqual(DateKit.parseMonthDay("12/1"), "12-01")
        XCTAssertEqual(DateKit.parseMonthDay("1/1"), "01-01")
    }

    func testParseMonthDayOrdinalStripping() {
        XCTAssertEqual(DateKit.parseMonthDay("august 1st"), "08-01")
        XCTAssertEqual(DateKit.parseMonthDay("march 22nd"), "03-22")
        XCTAssertEqual(DateKit.parseMonthDay("may 3rd"), "05-03")
        XCTAssertEqual(DateKit.parseMonthDay("july 4th"), "07-04")
    }

    func testParseMonthDayCaseInsensitiveAndAbbreviations() {
        XCTAssertEqual(DateKit.parseMonthDay("June 28TH"), "06-28")
        // monthIndex matches on the first three letters.
        XCTAssertEqual(DateKit.parseMonthDay("jun 28"), "06-28")
        XCTAssertEqual(DateKit.parseMonthDay("sept 9"), "09-09")
    }

    func testParseMonthDayRejectsInvalidMonth() {
        XCTAssertNil(DateKit.parseMonthDay("smarch 5"))
        XCTAssertNil(DateKit.parseMonthDay("13/28"))
        XCTAssertNil(DateKit.parseMonthDay("0/15"))
        XCTAssertNil(DateKit.parseMonthDay("hello"))
        XCTAssertNil(DateKit.parseMonthDay(""))
        XCTAssertNil(DateKit.parseMonthDay(nil))
    }

    // MARK: - parseWhen (relative words)

    func testParseWhenToday() {
        XCTAssertEqual(DateKit.parseWhen("today"), ymd(daysFromNow: 0))
        XCTAssertEqual(DateKit.parseWhen("Today"), ymd(daysFromNow: 0))
        XCTAssertEqual(DateKit.parseWhen("  today  "), ymd(daysFromNow: 0))
    }

    func testParseWhenTomorrowAndTmrw() {
        XCTAssertEqual(DateKit.parseWhen("tomorrow"), ymd(daysFromNow: 1))
        XCTAssertEqual(DateKit.parseWhen("tmrw"), ymd(daysFromNow: 1))
        XCTAssertEqual(DateKit.parseWhen("on tomorrow"), ymd(daysFromNow: 1))
    }

    func testParseWhenDayAfterTomorrow() {
        XCTAssertEqual(DateKit.parseWhen("day after tomorrow"), ymd(daysFromNow: 2))
    }

    func testParseWhenInNDays() {
        XCTAssertEqual(DateKit.parseWhen("in 1 day"), ymd(daysFromNow: 1))
        XCTAssertEqual(DateKit.parseWhen("in 3 days"), ymd(daysFromNow: 3))
        XCTAssertEqual(DateKit.parseWhen("in 10 days"), ymd(daysFromNow: 10))
        XCTAssertEqual(DateKit.parseWhen("In 5 Days"), ymd(daysFromNow: 5))
    }

    // MARK: - parseWhen (weekdays)

    func testParseWhenBareWeekdayMeansNextOccurrence() {
        // Tomorrow's weekday name must resolve to tomorrow, whatever day it is.
        XCTAssertEqual(DateKit.parseWhen(weekdayName(daysFromNow: 1)), ymd(daysFromNow: 1))
        // A weekday three days out resolves three days out.
        XCTAssertEqual(DateKit.parseWhen(weekdayName(daysFromNow: 3)), ymd(daysFromNow: 3))
        // Today's own weekday name means NEXT week, not today.
        XCTAssertEqual(DateKit.parseWhen(weekdayName(daysFromNow: 0)), ymd(daysFromNow: 7))
    }

    func testParseWhenThisWeekdayEqualsBareWeekday() {
        let name = weekdayName(daysFromNow: 2)
        XCTAssertEqual(DateKit.parseWhen("this \(name)"), DateKit.parseWhen(name))
        XCTAssertEqual(DateKit.parseWhen("this \(name)"), ymd(daysFromNow: 2))
    }

    func testParseWhenNextWeekdayForEveryOffset() {
        // For every day of the coming week: "next X" lands 7 days after the
        // bare "X", except when the bare form already lands a full week out
        // (X == today's weekday), where "next X" adds nothing.
        for offset in 1...7 {
            let name = weekdayName(daysFromNow: offset)
            XCTAssertEqual(DateKit.parseWhen(name), ymd(daysFromNow: offset), "bare \(name)")
            let expectedNext = offset == 7 ? ymd(daysFromNow: 7) : ymd(daysFromNow: offset + 7)
            XCTAssertEqual(DateKit.parseWhen("next \(name)"), expectedNext, "next \(name)")
        }
    }

    func testParseWhenOnPrefixStripped() {
        let name = weekdayName(daysFromNow: 4)
        XCTAssertEqual(DateKit.parseWhen("on \(name)"), ymd(daysFromNow: 4))
    }

    // MARK: - parseWhen (explicit dates)

    func testParseWhenIsoPassthrough() {
        // A well-formed YYYY-MM-DD passes through untouched — independent of the clock.
        XCTAssertEqual(DateKit.parseWhen("2030-05-09"), "2030-05-09")
        let dynamic = ymd(daysFromNow: 40)
        XCTAssertEqual(DateKit.parseWhen(dynamic), dynamic)
    }

    func testParseWhenMonthDayInPastRollsToNextYear() {
        // A month-day 10 days behind us must resolve to a date that is not in
        // the past (this year if still ahead across a year boundary, else next year).
        let past = cal.date(byAdding: .day, value: -10, to: Date())!
        let c = cal.dateComponents([.month, .day], from: past)
        let text = "\(DateKit.months[c.month! - 1]) \(c.day!)"
        let result = DateKit.parseWhen(text)
        XCTAssertEqual(result, resolvedYear(forMonth: c.month!, day: c.day!))
        XCTAssertGreaterThanOrEqual(result!, ymd(daysFromNow: 0), "resolved date must never be in the past")
    }

    func testParseWhenMonthDayInFutureStaysThisYear() {
        let future = cal.date(byAdding: .day, value: 10, to: Date())!
        let c = cal.dateComponents([.month, .day], from: future)
        let text = "\(c.day!) \(DateKit.months[c.month! - 1])"
        let result = DateKit.parseWhen(text)
        XCTAssertEqual(result, resolvedYear(forMonth: c.month!, day: c.day!))
        XCTAssertGreaterThanOrEqual(result!, ymd(daysFromNow: 0))
    }

    func testParseWhenTodayMonthDayResolvesToToday() {
        // Today's own month-day is not "past", so it stays this year.
        let c = cal.dateComponents([.month, .day], from: Date())
        let text = "\(DateKit.months[c.month! - 1]) \(c.day!)"
        XCTAssertEqual(DateKit.parseWhen(text), ymd(daysFromNow: 0))
    }

    func testParseWhenRejectsGarbage() {
        XCTAssertNil(DateKit.parseWhen(nil))
        XCTAssertNil(DateKit.parseWhen(""))
        XCTAssertNil(DateKit.parseWhen("whenever"))
        XCTAssertNil(DateKit.parseWhen("someday"))   // ends in "day" but is no weekday
        XCTAssertNil(DateKit.parseWhen("smarch 5"))
    }

    // MARK: - parseAt (relative, deterministic via now:)

    func testParseAtInMinutes() {
        let now = makeNow(hour: 9, minute: 0)
        let base = ms(now)
        XCTAssertEqual(DateKit.parseAt("in 5 min", now: now), base + 5 * 60_000)
        XCTAssertEqual(DateKit.parseAt("in 30 minutes", now: now), base + 30 * 60_000)
        XCTAssertEqual(DateKit.parseAt("in 1 minute", now: now), base + 60_000)
        XCTAssertEqual(DateKit.parseAt("remind me in 90 mins to stretch", now: now), base + 90 * 60_000)
        XCTAssertEqual(DateKit.parseAt("in 10min", now: now), base + 10 * 60_000)
    }

    func testParseAtInHalfAnHour() {
        let now = makeNow(hour: 14, minute: 30)
        XCTAssertEqual(DateKit.parseAt("in half an hour", now: now), ms(now) + 30 * 60_000)
    }

    func testParseAtInAnHour() {
        let now = makeNow(hour: 14, minute: 30)
        XCTAssertEqual(DateKit.parseAt("in an hour", now: now), ms(now) + 60 * 60_000)
    }

    func testParseAtInNHours() {
        let now = makeNow(hour: 9, minute: 15)
        let base = ms(now)
        XCTAssertEqual(DateKit.parseAt("in 2 hours", now: now), base + 120 * 60_000)
        XCTAssertEqual(DateKit.parseAt("in 1 hour", now: now), base + 60 * 60_000)
        XCTAssertEqual(DateKit.parseAt("in 1.5 hours", now: now), base + 90 * 60_000)
    }

    // MARK: - parseAt (clock times)

    func testParseAtPmClockStillAhead() {
        let now = makeNow(hour: 10, minute: 0)
        XCTAssertEqual(DateKit.parseAt("at 6pm", now: now), todayAt(hour: 18, minute: 0))
        XCTAssertEqual(DateKit.parseAt("at 6:15pm", now: now), todayAt(hour: 18, minute: 15))
        XCTAssertEqual(DateKit.parseAt("at 6 pm", now: now), todayAt(hour: 18, minute: 0))
        XCTAssertEqual(DateKit.parseAt("call mom at 11am", now: now), todayAt(hour: 11, minute: 0))
    }

    func testParseAtTwelveHourEdges() {
        let now = makeNow(hour: 9, minute: 0)
        // 12pm is noon, not midnight.
        XCTAssertEqual(DateKit.parseAt("at 12pm", now: now), todayAt(hour: 12, minute: 0))
        // 12am is midnight; today's midnight already passed, so it rolls to tomorrow.
        XCTAssertEqual(DateKit.parseAt("at 12am", now: now), todayAt(hour: 0, minute: 0, dayOffset: 1))
    }

    func testParseAt24HourClock() {
        let now = makeNow(hour: 10, minute: 0)
        XCTAssertEqual(DateKit.parseAt("at 18:30", now: now), todayAt(hour: 18, minute: 30))
        XCTAssertEqual(DateKit.parseAt("at 07:05", now: now), todayAt(hour: 7, minute: 5, dayOffset: 1)) // 7:05 passed
    }

    func testParseAtRollsToNextDayWhenTimePassed() {
        let now = makeNow(hour: 21, minute: 0) // 9pm
        XCTAssertEqual(DateKit.parseAt("at 6pm", now: now), todayAt(hour: 18, minute: 0, dayOffset: 1))
        XCTAssertEqual(DateKit.parseAt("at 18:30", now: now), todayAt(hour: 18, minute: 30, dayOffset: 1))
    }

    func testParseAtRejectsGarbage() {
        let now = makeNow(hour: 10, minute: 0)
        XCTAssertNil(DateKit.parseAt(nil, now: now))
        XCTAssertNil(DateKit.parseAt("", now: now))
        XCTAssertNil(DateKit.parseAt("remind me to call mom", now: now))
        XCTAssertNil(DateKit.parseAt("at 25:00", now: now)) // hour out of range
    }

    // MARK: - futureTime

    func testFutureTimeStillAheadStaysToday() {
        let now = makeNow(hour: 10, minute: 0)
        XCTAssertEqual(DateKit.futureTime(hour: 15, minute: 30, now: now), todayAt(hour: 15, minute: 30))
    }

    func testFutureTimeAlreadyPassedRollsToTomorrow() {
        let now = makeNow(hour: 10, minute: 0)
        XCTAssertEqual(DateKit.futureTime(hour: 9, minute: 0, now: now), todayAt(hour: 9, minute: 0, dayOffset: 1))
    }

    func testFutureTimeExactlyNowRollsToTomorrow() {
        // d <= now means "this exact minute" is treated as passed.
        let now = makeNow(hour: 10, minute: 0)
        XCTAssertEqual(DateKit.futureTime(hour: 10, minute: 0, now: now), todayAt(hour: 10, minute: 0, dayOffset: 1))
    }

    func testFutureTimeIsAlwaysInTheFuture() {
        let now = makeNow(hour: 13, minute: 7)
        for hour in [0, 6, 13, 23] {
            let t = DateKit.futureTime(hour: hour, minute: 7, now: now)
            XCTAssertGreaterThan(t, ms(now), "hour \(hour) must resolve strictly after now")
            XCTAssertLessThanOrEqual(t - ms(now), 24 * 3_600_000 + 3_600_000, "and within ~a day") // +1h DST slack
        }
    }

    // MARK: - timeLabel buckets (relative to the real clock)

    func testTimeLabelNowBucket() {
        let base = Int64(Date().timeIntervalSince1970 * 1000)
        XCTAssertEqual(DateKit.timeLabel(base + 30_000), "now")          // 30s ahead
        XCTAssertEqual(DateKit.timeLabel(base - 60_000), "now")          // 60s behind, within grace
    }

    func testTimeLabelMinutesBucket() {
        let base = Int64(Date().timeIntervalSince1970 * 1000)
        XCTAssertEqual(DateKit.timeLabel(base + 2 * 60_000), "in 2 min")
        XCTAssertEqual(DateKit.timeLabel(base + 30 * 60_000), "in 30 min")
        XCTAssertEqual(DateKit.timeLabel(base + 59 * 60_000), "in 59 min")
    }

    func testTimeLabelTodayOrTomorrowBucketTwoHoursOut() {
        let base = Int64(Date().timeIntervalSince1970 * 1000)
        let target = base + 2 * 3_600_000
        let targetDate = Date(timeIntervalSince1970: Double(target) / 1000)
        let label = DateKit.timeLabel(target)
        // Two hours from now is either later today or (late at night) tomorrow;
        // decide with the same Calendar rather than assuming.
        if cal.isDateInToday(targetDate) {
            XCTAssertEqual(label, "today \(clock12(target))")
        } else {
            XCTAssertEqual(label, "tomorrow \(clock12(target))")
        }
    }

    func testTimeLabelTomorrowBucket() {
        let d = cal.date(byAdding: .day, value: 1, to: Date())! // same wall time tomorrow
        let target = ms(d)
        XCTAssertEqual(DateKit.timeLabel(target), "tomorrow \(clock12(target))")
    }

    func testTimeLabelSlippedBucket() {
        let base = Int64(Date().timeIntervalSince1970 * 1000)
        let target = base - 10 * 60_000
        XCTAssertEqual(DateKit.timeLabel(target), "\(clock12(target)), slipped")
    }

    func testTimeLabelFarDateShowsMonthAndDay() {
        // display follows the phone's locale (day-first in india), so the
        // expectation comes from the same localized month-day formatter
        let d = cal.date(byAdding: .day, value: 8, to: Date())!
        let target = ms(d)
        XCTAssertEqual(DateKit.timeLabel(target), "\(DateKit.monthDay(d)), \(clock12(target))")
        XCTAssertFalse(DateKit.monthDay(d).isEmpty)
    }

    // MARK: - dayLabel

    func testDayLabelToday() {
        XCTAssertEqual(DateKit.dayLabel(ymd(daysFromNow: 0)), "today")
    }

    func testDayLabelTomorrow() {
        XCTAssertEqual(DateKit.dayLabel(ymd(daysFromNow: 1)), "tomorrow")
    }

    func testDayLabelWeekdayWithinSevenDays() {
        for offset in 2...6 {
            XCTAssertEqual(DateKit.dayLabel(ymd(daysFromNow: offset)),
                           weekdayName(daysFromNow: offset),
                           "offset \(offset) should render as a weekday name")
        }
    }

    func testDayLabelSevenOrMoreDaysShowsMonthAndDay() {
        // locale-aware month-day, mirrored through the same formatter
        for offset in [7, 10] {
            let d = cal.date(byAdding: .day, value: offset, to: Date())!
            XCTAssertEqual(DateKit.dayLabel(ymd(daysFromNow: offset)), DateKit.monthDay(d))
            let c = cal.dateComponents([.month, .day], from: d)
            XCTAssertTrue(DateKit.monthDay(d).contains("\(c.day!)"),
                          "month-day label should contain the day number")
        }
    }

    func testDayLabelOverdue() {
        XCTAssertEqual(DateKit.dayLabel(ymd(daysFromNow: -1)), "1d overdue")
        XCTAssertEqual(DateKit.dayLabel(ymd(daysFromNow: -2)), "2d overdue")
        XCTAssertEqual(DateKit.dayLabel(ymd(daysFromNow: -14)), "14d overdue")
    }

    func testDayLabelUnparseableStringEchoesInput() {
        XCTAssertEqual(DateKit.dayLabel("notadate"), "notadate")
    }

    // MARK: - daysUntilBirthday

    func testDaysUntilBirthdayTodayIsZero() {
        let c = cal.dateComponents([.month, .day], from: Date())
        let md = String(format: "%02d-%02d", c.month!, c.day!)
        XCTAssertEqual(DateKit.daysUntilBirthday(md), 0)
    }

    func testDaysUntilBirthdayTomorrowIsOne() {
        let d = cal.date(byAdding: .day, value: 1, to: Date())!
        let c = cal.dateComponents([.month, .day], from: d)
        let md = String(format: "%02d-%02d", c.month!, c.day!)
        XCTAssertEqual(DateKit.daysUntilBirthday(md), 1)
    }

    func testDaysUntilBirthdayPastDateRollsToNextYear() {
        // Yesterday's month-day: the next occurrence is roughly a year away,
        // never negative and never "yesterday".
        let d = cal.date(byAdding: .day, value: -1, to: Date())!
        let c = cal.dateComponents([.month, .day], from: d)
        let md = String(format: "%02d-%02d", c.month!, c.day!)
        let got = DateKit.daysUntilBirthday(md)
        XCTAssertNotNil(got)
        XCTAssertTrue((363...366).contains(got!), "expected ~a year out, got \(got!)")
    }

    func testDaysUntilBirthdayNextWeek() {
        let d = cal.date(byAdding: .day, value: 6, to: Date())!
        let c = cal.dateComponents([.month, .day], from: d)
        let md = String(format: "%02d-%02d", c.month!, c.day!)
        XCTAssertEqual(DateKit.daysUntilBirthday(md), 6)
    }

    func testDaysUntilBirthdayRejectsInvalidFormat() {
        XCTAssertNil(DateKit.daysUntilBirthday(nil))
        XCTAssertNil(DateKit.daysUntilBirthday(""))
        XCTAssertNil(DateKit.daysUntilBirthday("junk"))
        XCTAssertNil(DateKit.daysUntilBirthday("6-28"))        // needs zero-padded MM-DD
        XCTAssertNil(DateKit.daysUntilBirthday("2026-06-28"))  // full dates rejected
        XCTAssertNil(DateKit.daysUntilBirthday("06/28"))       // wrong separator
    }

    // MARK: - weekTable

    func testWeekTableShape() {
        let entries = DateKit.weekTable().components(separatedBy: ", ")
        XCTAssertEqual(entries.count, 8, "today plus the next seven days")
        XCTAssertEqual(entries[0], "today = \(ymd(daysFromNow: 0))")
        XCTAssertEqual(entries[1], "tomorrow = \(ymd(daysFromNow: 1))")
        for i in 2...7 {
            XCTAssertEqual(entries[i], "\(weekdayName(daysFromNow: i)) = \(ymd(daysFromNow: i))",
                           "entry \(i) should be a weekday name mapped to its date")
        }
    }

    // MARK: - nowClock24

    func testNowClock24Format() {
        func expected() -> String {
            let c = cal.dateComponents([.hour, .minute], from: Date())
            return String(format: "%02d:%02d", c.hour!, c.minute!)
        }
        // The minute can tick over between computing the expectation and the
        // call, so accept the reading from either side of the call.
        let before = expected()
        let got = DateKit.nowClock24()
        let after = expected()
        XCTAssertTrue(got == before || got == after,
                      "expected \(before) or \(after), got \(got)")
        XCTAssertNotNil(got.wholeMatch(of: #/\d{2}:\d{2}/#), "must be zero-padded HH:mm")
    }
}
