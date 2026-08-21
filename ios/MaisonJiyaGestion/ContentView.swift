import SwiftUI
import WebKit
import UIKit

struct ContentView: View {
    var body: some View {
        MaisonJiyaWebView()
            .ignoresSafeArea(edges: .bottom)
            .background(Color.black)
    }
}

struct MaisonJiyaWebView: UIViewRepresentable {
    private let homeURL = URL(string: "https://maison-jiya-site.maisonjya1.workers.dev/")!

    func makeCoordinator() -> Coordinator {
        Coordinator(homeHost: homeURL.host ?? "")
    }

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.preferences.javaScriptCanOpenWindowsAutomatically = true
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = context.coordinator
        webView.uiDelegate = context.coordinator
        webView.allowsBackForwardNavigationGestures = true
        webView.scrollView.keyboardDismissMode = .interactive
        webView.scrollView.contentInsetAdjustmentBehavior = .automatic
        webView.customUserAgent = "MaisonJiyaiOS/1.0"

        let refresh = UIRefreshControl()
        refresh.addTarget(context.coordinator, action: #selector(Coordinator.refresh(_:)), for: .valueChanged)
        webView.scrollView.refreshControl = refresh
        context.coordinator.webView = webView

        webView.load(URLRequest(url: homeURL, cachePolicy: .useProtocolCachePolicy, timeoutInterval: 30))
        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {
    }

    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate {
        let homeHost: String
        weak var webView: WKWebView?

        init(homeHost: String) {
            self.homeHost = homeHost
        }

        @objc func refresh(_ sender: UIRefreshControl) {
            webView?.reload()
        }

        private func isInternal(_ url: URL) -> Bool {
            url.scheme?.lowercased() == "https" && url.host?.lowercased() == homeHost.lowercased()
        }

        private func openExternal(_ url: URL) {
            DispatchQueue.main.async {
                UIApplication.shared.open(url)
            }
        }

        func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            guard let url = navigationAction.request.url else {
                decisionHandler(.cancel)
                return
            }

            if isInternal(url) || url.scheme == "about" || url.scheme == "data" || url.scheme == "blob" {
                decisionHandler(.allow)
                return
            }

            openExternal(url)
            decisionHandler(.cancel)
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            webView.scrollView.refreshControl?.endRefreshing()
        }

        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
            webView.scrollView.refreshControl?.endRefreshing()
        }

        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
            webView.scrollView.refreshControl?.endRefreshing()
        }

        func webView(_ webView: WKWebView,
                     createWebViewWith configuration: WKWebViewConfiguration,
                     for navigationAction: WKNavigationAction,
                     windowFeatures: WKWindowFeatures) -> WKWebView? {
            guard let url = navigationAction.request.url else { return nil }
            if isInternal(url) {
                webView.load(URLRequest(url: url))
            } else {
                openExternal(url)
            }
            return nil
        }
    }
}
