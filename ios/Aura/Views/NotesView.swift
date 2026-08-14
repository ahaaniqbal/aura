// NotesView.swift, quick capture. a jotted thought files itself into memory.

import SwiftUI

struct NotesView: View {
    @Bindable var store: Store
    @State private var draft = ""

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 10) {
                    HStack {
                        TextField("jot a thought, it files itself…", text: $draft)
                            .padding(.horizontal, 14).padding(.vertical, 9)
                            .background(Theme.surface, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                            .onSubmit(keep)
                        Button("Keep", action: keep)
                            .font(.subheadline.weight(.semibold))
                            .buttonStyle(.borderedProminent)
                            .disabled(draft.isEmpty)
                    }

                    if store.data.notes.isEmpty {
                        ContentUnavailableView("Nothing jotted yet",
                                               systemImage: "square.and.pencil",
                                               description: Text("like chat, but quieter. jot a thought and it files itself into memory without replying."))
                            .padding(.top, 30)
                    }

                    ForEach(store.data.notes.reversed()) { n in
                        VStack(alignment: .leading, spacing: 6) {
                            HStack(alignment: .top) {
                                Text(n.text).font(.subheadline)
                                Spacer()
                                Button { store.deleteNote(n.id) } label: {
                                    Image(systemName: "xmark.circle")
                                        .foregroundStyle(.secondary.opacity(0.5))
                                }
                                .accessibilityLabel(Text("Delete note"))
                            }
                            if let chips = n.chips, !chips.isEmpty { ChipRow(chips: chips) }
                            Text(Date(timeIntervalSince1970: Double(n.ts) / 1000).formatted(date: .abbreviated, time: .shortened))
                                .font(.caption2).foregroundStyle(.secondary)
                        }
                        .padding(14)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Theme.surface, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                    }
                }
                .padding()
                .animation(.snappy, value: store.data.notes.count)
            }
            .background(Theme.bg)
            .navigationTitle("Notes")
            .navigationBarTitleDisplayMode(.inline)
        }
    }

    func keep() {
        guard !draft.isEmpty else { return }
        let text = draft
        draft = ""
        Task { await store.addNote(text) }
    }
}
