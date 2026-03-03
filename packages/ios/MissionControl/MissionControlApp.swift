/**
 * Mission Control iOS — App Entry Point
 * SwiftUI app with orange/amber accent theme.
 * Minimum deployment: iOS 17.0
 */

import SwiftUI

@main
struct MissionControlApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
                .accentColor(.orange)
        }
    }
}
