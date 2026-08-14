// Theme.swift, aura's identity on apple's foundations. one brand violet, and
// semantic system colors everywhere else, so light, dark, and increased
// contrast all come out right without a single hardcoded surface.

import SwiftUI
import UIKit

enum Theme {
    // the brand accent, aura's violet
    static let violet = Color(red: 0.48, green: 0.36, blue: 1.0)          // #7B5CFF

    // chip tones, tuned near apple's palette so they read native
    static let pink = Color(red: 1.0, green: 0.36, blue: 0.66)            // gifts
    static let mint = Color(red: 0.07, green: 0.64, blue: 0.49)           // promises
    static let sunny = Color(red: 0.66, green: 0.49, blue: 0.0)           // dates
    static let blue = Color(red: 0.18, green: 0.66, blue: 1.0)            // places

    // semantic surfaces: the system keeps these correct in every appearance
    static var bg: Color { Color(uiColor: .systemGroupedBackground) }
    static var surface: Color { Color(uiColor: .secondarySystemGroupedBackground) }
    static var surfaceRaised: Color { Color(uiColor: .tertiarySystemGroupedBackground) }
    static var softViolet: Color { violet.opacity(0.12) }

    static func toneColor(_ tone: String) -> Color {
        switch tone {
        case "person": return violet
        case "gift": return pink
        case "date": return sunny
        case "place": return blue
        case "promise": return mint
        default: return .secondary
        }
    }

    static let orbGradient = RadialGradient(
        gradient: Gradient(colors: [
            Color(red: 0.56, green: 0.42, blue: 1.0),
            Color(red: 0.37, green: 0.66, blue: 1.0),
            Color(red: 0.13, green: 0.83, blue: 0.63),
        ]),
        center: UnitPoint(x: 0.35, y: 0.3), startRadius: 2, endRadius: 40)

    // the user bubble in chat, a quiet violet gradient
    static let bubbleGradient = LinearGradient(
        colors: [Color(red: 0.52, green: 0.40, blue: 1.0), Color(red: 0.44, green: 0.32, blue: 0.96)],
        startPoint: .topLeading, endPoint: .bottomTrailing)
}
