// LocationKit.swift, place reminders come alive natively. ios wakes aura on
// significant movement, mapkit finds what's around you, no external services.
// background wake with the app closed requires Always authorization, so the
// flow is the two-step apple recommends: When In Use first, then the upgrade.

import Foundation
import CoreLocation
import MapKit

final class LocationKit: NSObject, CLLocationManagerDelegate {
    static let shared = LocationKit()
    private let manager = CLLocationManager()
    private var lastCheck: Int64 = 0

    var status: CLAuthorizationStatus { manager.authorizationStatus }

    static let categories: [(pattern: String, query: String, label: String)] = [
        ("pharmac|medicine|chemist|drug|meds|dawai", "pharmacy", "a pharmacy"),
        ("grocer|supermarket|market|kirana|sabzi", "grocery store", "a grocery store"),
        ("bakery|cake|bread", "bakery", "a bakery"),
        ("gym|fitness|workout", "gym", "a gym"),
        ("coffee|cafe|chai", "cafe", "a cafe"),
        ("bank|atm", "bank", "a bank"),
        ("florist|flowers", "florist", "a florist"),
        ("post office|mail", "post office", "a post office"),
    ]

    func start() {
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyHundredMeters
        switch manager.authorizationStatus {
        case .notDetermined:
            manager.requestWhenInUseAuthorization()
        case .authorizedWhenInUse:
            // the upgrade prompt: without Always, ios cannot wake aura when the
            // app is closed, and place nudges only work while it's open
            manager.requestAlwaysAuthorization()
            beginMonitoring()
        case .authorizedAlways:
            beginMonitoring()
        default:
            break // denied or restricted: the settings screen offers the way out
        }
    }

    func stop() {
        manager.stopMonitoringSignificantLocationChanges()
    }

    private func beginMonitoring() {
        manager.startMonitoringSignificantLocationChanges()
        manager.requestLocation()
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        switch manager.authorizationStatus {
        case .authorizedWhenInUse:
            if Store.shared.settings.locationNudges {
                manager.requestAlwaysAuthorization()
                beginMonitoring()
            }
        case .authorizedAlways:
            if Store.shared.settings.locationNudges { beginMonitoring() }
        default:
            break
        }
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let loc = locations.last else { return }
        guard nowMs() - lastCheck > 5 * 60_000 else { return } // at most one sweep per 5 minutes
        lastCheck = nowMs()
        Task { await Self.checkNearby(loc) }
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {}

    // match open place reminders against what's physically near
    @MainActor
    static func checkNearby(_ loc: CLLocation) async {
        let store = Store.shared
        guard store.settings.locationNudges else { return }
        guard !store.data.cards.contains(where: { $0.status == "pending" }) else { return }
        let today = DateKit.todayString()

        for r in store.data.reminders where r.status == "open" && r.place != nil {
            guard store.data.nudged["place:\(r.id):\(today)"] == nil else { continue }
            let place = r.place!.lowercased()
            let cat = categories.first { place.range(of: $0.pattern, options: .regularExpression) != nil }
            let query = cat?.query ?? r.place!

            let request = MKLocalSearch.Request()
            request.naturalLanguageQuery = query
            request.region = MKCoordinateRegion(center: loc.coordinate, latitudinalMeters: 500, longitudinalMeters: 500)
            guard let response = try? await MKLocalSearch(request: request).start() else { continue }

            // the search suspended us: the world may have moved on. re-check everything
            // against live state before acting, so the one-card rule holds and a reminder
            // the user just completed never resurfaces.
            guard !store.data.cards.contains(where: { $0.status == "pending" }) else { break }
            guard let fresh = store.data.reminders.first(where: { $0.id == r.id }),
                  fresh.status == "open",
                  store.data.nudged["place:\(fresh.id):\(today)"] == nil else { continue }

            let near = response.mapItems.first { item in
                guard let l = item.placemark.location else { return false }
                return l.distance(from: loc) <= 250
            }
            if let near {
                let card = CardEngine.placeCard(&store.data, reminder: fresh, placeName: near.name ?? cat?.label)
                store.save()
                Notifier.nudgeNow(title: card.title, body: card.body, refId: fresh.id)
                break // one card at a time, always
            }
        }
    }
}
