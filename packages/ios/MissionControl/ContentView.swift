/**
 * Mission Control iOS — Main Content View
 * Tab-based navigation: Dashboard, Recordings, Fleet, Settings
 */

import SwiftUI

struct ContentView: View {
    var body: some View {
        TabView {
            NavigationStack {
                Text("Dashboard")
                    .navigationTitle("Dashboard")
            }
            .tabItem {
                Label("Dashboard", systemImage: "gauge.open.with.lines.needle.33percent")
            }

            NavigationStack {
                Text("Recordings")
                    .navigationTitle("Recordings")
            }
            .tabItem {
                Label("Recordings", systemImage: "record.circle")
            }

            NavigationStack {
                Text("Fleet")
                    .navigationTitle("Fleet")
            }
            .tabItem {
                Label("Fleet", systemImage: "cpu")
            }

            NavigationStack {
                Text("Settings")
                    .navigationTitle("Settings")
            }
            .tabItem {
                Label("Settings", systemImage: "gearshape.fill")
            }
        }
    }
}

#Preview {
    ContentView()
}
