// PeopleView.swift, your circle. tap anyone to correct, enrich, or forget.

import SwiftUI

struct PeopleView: View {
    @Bindable var store: Store
    @State private var selected: Person?

    let columns = [GridItem(.flexible()), GridItem(.flexible())]

    var body: some View {
        NavigationStack {
            ScrollView {
                if store.data.people.isEmpty {
                    ContentUnavailableView("No one here yet",
                                           systemImage: "person.2",
                                           description: Text("tell me about your people in chat, i'll do the remembering."))
                        .padding(.top, 40)
                } else {
                    LazyVGrid(columns: columns, spacing: 10) {
                        ForEach(store.data.people.sorted { $0.mentionedAt > $1.mentionedAt }) { p in
                            Button { selected = p } label: { personCard(p) }
                                .foregroundStyle(.primary)
                                .contextMenu {
                                    Button(role: .destructive) {
                                        store.deletePerson(p.id)
                                    } label: { Label("Forget \(p.name.lowercased())", systemImage: "trash") }
                                }
                        }
                    }
                    .padding()
                }
            }
            .background(Theme.bg)
            .navigationTitle("People")
            .navigationBarTitleDisplayMode(.inline)
            .sheet(item: $selected) { p in
                PersonSheet(store: store, personId: p.id)
                    .presentationDetents([.medium, .large])
                    .presentationDragIndicator(.visible)
            }
        }
    }

    func personCard(_ p: Person) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(String(p.name.prefix(1)).uppercased())
                .font(.headline).foregroundStyle(.white)
                .frame(width: 42, height: 42)
                .background(
                    LinearGradient(colors: [
                        Color(hue: stableHue(p.name), saturation: 0.55, brightness: 0.8),
                        Color(hue: stableHue(p.name), saturation: 0.7, brightness: 0.62),
                    ], startPoint: .top, endPoint: .bottom),
                    in: Circle())
            Text(p.name.lowercased()).font(.subheadline.weight(.semibold))
            Text(subtitle(p)).font(.caption).foregroundStyle(.secondary).lineLimit(1)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.surface, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    }

    // swift's hashValue is seeded per launch; this stays the same color forever
    func stableHue(_ name: String) -> Double {
        Double(name.unicodeScalars.reduce(0) { ($0 * 31 + Int($1.value)) % 360 }) / 360
    }

    func subtitle(_ p: Person) -> String {
        var bits: [String] = []
        // dynamic lookups so the stored english relation words render in hindi too
        if let r = p.relation { bits.append(String(localized: String.LocalizationValue(r))) }
        if p.birthday != nil { bits.append("🎂 \(DateKit.birthdayLabel(p.birthday))") }
        let open = store.data.promises.filter { $0.status == "open" && $0.person == p.name }.count
        if open > 0 { bits.append(String(localized: "\(open) open")) }
        return bits.isEmpty ? String(localized: "just met") : bits.joined(separator: " · ")
    }
}

struct PersonSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Bindable var store: Store
    let personId: String

    @State private var birthdayText = ""
    @State private var noteText = ""
    @State private var wantText = ""

    let relations = ["family", "friend", "partner", "client", "collaborator"]

    var person: Person? { store.data.people.first { $0.id == personId } }

    var body: some View {
        if let p = person {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    HStack {
                        Text(p.name.lowercased()).font(.title2.bold())
                        Spacer()
                        Button { dismiss() } label: {
                            Image(systemName: "xmark.circle.fill")
                                .font(.title3)
                                .foregroundStyle(.secondary.opacity(0.6))
                        }
                        .accessibilityLabel(Text("Close"))
                    }
                    .padding(.top, 6)

                    label("Relationship")
                    HStack {
                        ForEach(relations, id: \.self) { rel in
                            Button {
                                store.updatePerson(p.id, relation: p.relation == rel ? "" : rel)
                            } label: {
                                Text(LocalizedStringKey(rel))
                                    .font(.caption.weight(.semibold))
                                    .padding(.horizontal, 10).padding(.vertical, 6)
                                    .background(p.relation == rel ? AnyShapeStyle(Theme.violet) : AnyShapeStyle(Theme.softViolet), in: Capsule())
                                    .foregroundStyle(p.relation == rel ? .white : .secondary)
                            }
                        }
                    }

                    label("Birthday")
                    editRow(text: $birthdayText, placeholder: p.birthday.map { DateKit.birthdayLabel($0) } ?? String(localized: "like: june 28")) {
                        store.updatePerson(p.id, birthday: birthdayText); birthdayText = ""
                    }

                    label("Add context")
                    editRow(text: $noteText, placeholder: String(localized: "how you know them, what matters…")) {
                        store.updatePerson(p.id, note: noteText); noteText = ""
                    }
                    editRow(text: $wantText, placeholder: String(localized: "a gift idea or something they love…")) {
                        store.updatePerson(p.id, want: wantText); wantText = ""
                    }

                    if !p.wants.isEmpty {
                        label("Gift ideas")
                        ChipRow(chips: p.wants.map { Chip(label: $0, tone: "gift") })
                    }
                    if !p.interests.isEmpty {
                        label("Into")
                        ChipRow(chips: p.interests.map { Chip(label: $0, tone: "person") })
                    }
                    if let care = p.care {
                        label("Worth remembering")
                        Text(care).font(.footnote).foregroundStyle(.secondary)
                    }

                    let open = store.data.promises.filter { $0.status == "open" && $0.person == p.name }
                    if !open.isEmpty {
                        label("Open between you")
                        ForEach(open) { pr in
                            HStack {
                                VStack(alignment: .leading) {
                                    Text(pr.text).font(.subheadline.weight(.medium))
                                    Text(pr.direction == "i_owe" ? "you owe them" : "they owe you")
                                        .font(.caption).foregroundStyle(.secondary)
                                }
                                Spacer()
                                Button { store.promiseDone(pr.id) } label: {
                                    Image(systemName: "checkmark.circle.fill")
                                        .font(.title3)
                                        .foregroundStyle(.green)
                                }
                                .accessibilityLabel(Text("Mark done"))
                            }
                        }
                    }

                    if !p.notes.isEmpty {
                        label("Notes")
                        ForEach(p.notes.suffix(6), id: \.self) { n in
                            Text(n.text).font(.footnote).foregroundStyle(.secondary)
                        }
                    }

                    Button("Forget \(p.name.lowercased())", role: .destructive) {
                        store.deletePerson(p.id)
                        dismiss()
                    }
                    .padding(.top, 10)
                }
                .padding(20)
            }
            .background(Theme.bg)
        }
    }

    func label(_ t: LocalizedStringKey) -> some View {
        Text(t)
            .font(.footnote.weight(.semibold))
            .foregroundStyle(.secondary)
            .textCase(.uppercase)
    }

    func editRow(text: Binding<String>, placeholder: String, save: @escaping () -> Void) -> some View {
        HStack {
            TextField(placeholder, text: text)
                .padding(.horizontal, 12).padding(.vertical, 8)
                .background(Theme.surface, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
            Button("Keep", action: save)
                .font(.subheadline.weight(.semibold))
                .buttonStyle(.borderedProminent)
                .disabled(text.wrappedValue.isEmpty)
        }
    }
}
