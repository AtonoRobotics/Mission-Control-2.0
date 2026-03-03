/**
 * Panel Web View — WKWebView wrapper for rendering web panels.
 * JavaScript bridge via "missionControl" message handler.
 */

import SwiftUI
import WebKit

struct PanelWebView: UIViewRepresentable {
    let url: String

    class Coordinator: NSObject, WKNavigationDelegate, WKScriptMessageHandler {
        var parent: PanelWebView

        init(_ parent: PanelWebView) {
            self.parent = parent
        }

        func userContentController(
            _ userContentController: WKUserContentController,
            didReceive message: WKScriptMessage
        ) {
            if message.name == "missionControl" {
                print("[PanelWebView] JS bridge message: \(message.body)")
            }
        }
    }

    func makeCoordinator() -> Coordinator {
        Coordinator(self)
    }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.userContentController.add(context.coordinator, name: "missionControl")

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = context.coordinator
        webView.backgroundColor = UIColor(red: 0.04, green: 0.04, blue: 0.04, alpha: 1)
        webView.isOpaque = false

        if let requestUrl = URL(string: url) {
            webView.load(URLRequest(url: requestUrl))
        }
        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}
}
