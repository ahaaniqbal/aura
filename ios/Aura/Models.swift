// Models.swift, aura's memory shapes.
// mirrors the web version's data.json exactly, so an exported palace imports cleanly.

import Foundation

func uid() -> String {
    String(Int(Date().timeIntervalSince1970 * 1000), radix: 36) + String(UUID().uuidString.prefix(5)).lowercased()
}

func nowMs() -> Int64 { Int64(Date().timeIntervalSince1970 * 1000) }

struct Chip: Codable, Hashable, Sendable {
    var label: String
    var tone: String // person · gift · date · place · promise · pulse
}

struct Person: Codable, Identifiable, Hashable, Sendable {
    var id: String = uid()
    var name: String
    var relation: String?
    var birthday: String?        // "MM-DD"
    var interests: [String] = []
    var wants: [String] = []
    var care: String?
    var notes: [PersonNote] = []
    var mentionedAt: Int64 = nowMs()
    var createdAt: Int64 = nowMs()
}

struct PersonNote: Codable, Hashable, Sendable {
    var text: String
    var ts: Int64 = nowMs()
}

struct PromiseItem: Codable, Identifiable, Hashable, Sendable {
    var id: String = uid()
    var text: String
    var person: String?
    var direction: String = "i_owe" // i_owe | owed_to_me
    var due: String?                // "YYYY-MM-DD"
    var status: String = "open"     // open | done
    var createdAt: Int64 = nowMs()
    var doneAt: Int64?
}

struct Reminder: Codable, Identifiable, Hashable, Sendable {
    var id: String = uid()
    var text: String
    var when: String?               // "YYYY-MM-DD", day level
    var at: Int64?                  // epoch ms, exact time
    var place: String?              // "pharmacy", "trader joe's"
    var status: String = "open"     // open | done
    var createdAt: Int64 = nowMs()
}

struct NoteItem: Codable, Identifiable, Hashable, Sendable {
    var id: String = uid()
    var text: String
    var ts: Int64 = nowMs()
    var chips: [Chip]? = []
}

struct Message: Codable, Identifiable, Hashable, Sendable {
    var id: String = uid()
    var role: String                // you | aura
    var text: String
    var ts: Int64 = nowMs()
    var chips: [Chip]? = nil
}

struct Card: Codable, Identifiable, Hashable, Sendable {
    var id: String = uid()
    var type: String                // reminder | birthday | promise | drift | place
    var title: String
    var body: String
    var personId: String?
    var refId: String?
    var draft: Draft?
    var status: String = "pending"  // pending | approved | dismissed
    var createdAt: Int64 = nowMs()
    var resolvedAt: Int64?
}

struct Draft: Codable, Hashable, Sendable {
    var subject: String
    var body: String
}

struct PulseEntry: Codable, Hashable, Sendable {
    var ts: Int64 = nowMs()
    var valence: Int                // -2 rough .. 2 great
    var mood: String?
}

struct AppData: Codable, Sendable {
    var messages: [Message] = []
    var people: [Person] = []
    var promises: [PromiseItem] = []
    var reminders: [Reminder] = []
    var notes: [NoteItem] = []
    var pulse: [PulseEntry] = []
    var cards: [Card] = []
    var nudged: [String: Int64] = [:]

    // tolerate the web export's extra fields by ignoring them on import
    enum CodingKeys: String, CodingKey {
        case messages, people, promises, reminders, notes, pulse, cards, nudged
    }
}

// no em or en dash ever reaches the user, whatever a model does
func scrub(_ s: String) -> String {
    s.replacingOccurrences(of: "\\s*[\u{2014}\u{2013}]\\s*", with: ", ", options: .regularExpression)
     .replacingOccurrences(of: ",\\s*,", with: ",", options: .regularExpression)
}
