// Speech.swift, voice both ways in english and hindi, on apple's apis.
// recognition prefers on-device when the locale supports it; when it doesn't,
// apple's speech service handles it (that trade is disclosed in the privacy
// policy). no third party ever hears audio.

import Foundation
import Speech
import AVFoundation

@Observable
final class Listener {
    var isRecording = false
    var transcript = ""
    private var starting = false // set synchronously on tap, so a double tap can never start twice

    private var recognizer: SFSpeechRecognizer?
    private var task: SFSpeechRecognitionTask?
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private let engine = AVAudioEngine()

    // "auto" follows the phone's language, with indian english as the anchor.
    // hindi is a first-class choice, picked in settings.
    static func locale(for lang: String) -> Locale {
        switch lang {
        case "hi-IN": return Locale(identifier: "hi-IN")
        case "en-IN": return Locale(identifier: "en-IN")
        default:
            let device = Locale.current.identifier
            if device.hasPrefix("hi") { return Locale(identifier: "hi-IN") }
            if SFSpeechRecognizer(locale: Locale.current)?.isAvailable == true { return Locale.current }
            return Locale(identifier: "en-IN")
        }
    }

    private func freshRecognizer() -> SFSpeechRecognizer? {
        let loc = Self.locale(for: Store.shared.settings.speechLang)
        return SFSpeechRecognizer(locale: loc) ?? SFSpeechRecognizer(locale: Locale(identifier: "en-US"))
    }

    var available: Bool { (recognizer ?? freshRecognizer())?.isAvailable ?? false }

    func toggle() {
        (isRecording || starting) ? stop() : start()
    }

    func start() {
        guard !starting, !isRecording else { return }
        starting = true
        recognizer = freshRecognizer() // the language setting may have changed since last time
        SFSpeechRecognizer.requestAuthorization { [weak self] status in
            guard status == .authorized else { DispatchQueue.main.async { self?.starting = false }; return }
            AVAudioApplication.requestRecordPermission { granted in
                DispatchQueue.main.async {
                    guard let self, self.starting else { return } // a stop() while permissions were in flight cancels the start
                    guard granted else { self.starting = false; return }
                    self.begin()
                }
            }
        }
    }

    private func begin() {
        guard !isRecording else { starting = false; return }
        transcript = ""
        let session = AVAudioSession.sharedInstance()
        try? session.setCategory(.record, mode: .measurement, options: .duckOthers)
        try? session.setActive(true, options: .notifyOthersOnDeactivation)

        let request = SFSpeechAudioBufferRecognitionRequest()
        request.shouldReportPartialResults = true
        // keep audio on the phone whenever the locale supports it
        if recognizer?.supportsOnDeviceRecognition == true {
            request.requiresOnDeviceRecognition = true
        }
        self.request = request

        let input = engine.inputNode
        let format = input.outputFormat(forBus: 0)
        // a dead session (mic held by a call, route mid-handoff) reports a
        // 0 Hz format, and installTap raises an uncatchable objc exception on it
        guard format.sampleRate > 0, format.channelCount > 0 else {
            self.request = nil
            starting = false
            return
        }
        input.removeTap(onBus: 0) // belt and suspenders: a bus can only ever hold one tap
        input.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, _ in
            request.append(buffer)
        }
        engine.prepare()
        do {
            try engine.start()
        } catch {
            // never fake a live mic: tear down and stay idle
            input.removeTap(onBus: 0)
            request.endAudio()
            self.request = nil
            starting = false
            return
        }
        isRecording = true
        starting = false

        task = recognizer?.recognitionTask(with: request) { [weak self] result, error in
            if let result {
                DispatchQueue.main.async { self?.transcript = result.bestTranscription.formattedString.lowercased() }
            }
            if error != nil || (result?.isFinal ?? false) {
                DispatchQueue.main.async { self?.stop() }
            }
        }
    }

    func stop() {
        starting = false
        guard isRecording else { return }
        engine.stop()
        engine.inputNode.removeTap(onBus: 0)
        request?.endAudio()
        task?.cancel()
        task = nil
        request = nil
        isRecording = false
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }
}

enum Speech {
    private static let synth = AVSpeechSynthesizer()

    // devanagari in the reply means aura answers in hindi, so the voice follows
    static func voiceLanguage(for text: String) -> String {
        text.unicodeScalars.contains { (0x0900...0x097F).contains($0.value) } ? "hi-IN" : "en-IN"
    }

    static func speak(_ text: String) {
        let clean = text.replacingOccurrences(of: #"[✨🤍🎂❤️👋🎙]"#, with: "", options: .regularExpression)
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .spokenAudio, options: .duckOthers)
        try? AVAudioSession.sharedInstance().setActive(true)
        let u = AVSpeechUtterance(string: clean)
        let lang = voiceLanguage(for: clean)
        u.voice = AVSpeechSynthesisVoice(language: lang) ?? AVSpeechSynthesisVoice(language: "en-US")
        u.rate = 0.5
        synth.stopSpeaking(at: .immediate)
        synth.speak(u)
    }
}
