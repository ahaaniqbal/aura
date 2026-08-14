// AuraApp.swift, the entry point.

import SwiftUI
import UserNotifications

@main
struct AuraApp: App {
    init() {
        UNUserNotificationCenter.current().delegate = NotificationDelegate.shared
        Notifier.registerCategories()
        SubscriptionManager.shared.start()
        // notifications are requested in context, the first time a reminder exists
        if Store.shared.settings.locationNudges { LocationKit.shared.start() }
    }

    var body: some Scene {
        WindowGroup {
            RootView()
        }
    }
}
