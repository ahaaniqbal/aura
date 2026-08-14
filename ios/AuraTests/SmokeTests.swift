// SmokeTests.swift, proves the test target itself is alive. the real suites
// (DateKit, Extractor, CardEngine, Brain parsing, schema compatibility) live
// in their own files beside this one.

import XCTest
@testable import Aura

final class SmokeTests: XCTestCase {
    func testTargetBoots() {
        XCTAssertEqual(scrub("a — b"), "a, b", "the em dash scrubber is the oldest rule in the house")
    }
}
