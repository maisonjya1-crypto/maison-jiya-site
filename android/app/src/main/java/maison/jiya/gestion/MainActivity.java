package maison.jiya.gestion;

import android.Manifest;
import android.app.Activity;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.NetworkRequest;
import android.net.Uri;
import android.net.http.SslError;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.view.Gravity;
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.SafeBrowsingResponse;
import android.webkit.SslErrorHandler;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

public class MainActivity extends Activity {
    private static final String HOME_URL = "https://maison-jiya-site.maisonjya1.workers.dev/";
    private static final String HOME_HOST = "maison-jiya-site.maisonjya1.workers.dev";
    private static final int FILE_CHOOSER_REQUEST = 4102;
    private static final int NOTIFICATION_PERMISSION_REQUEST = 4103;
    private static final String NOTIFICATION_CHANNEL_ID = "maison_jiya_orders";

    private WebView webView;
    private ProgressBar progressBar;
    private View errorOverlay;
    private TextView errorMessage;
    private ValueCallback<Uri[]> fileCallback;
    private ConnectivityManager.NetworkCallback networkCallback;
    private final Handler retryHandler = new Handler(Looper.getMainLooper());
    private int retryAttempts = 0;
    private int notificationCounter = 2200;
    private String lastRequestedUrl = HOME_URL;
    private boolean hasCommittedPage = false;

    private final Runnable retryRunnable = () -> {
        if (webView == null) return;
        if (!isNetworkConnected()) {
            showConnectionError("Connexion indisponible. Maison Jiya réessaie automatiquement.");
            scheduleRetry();
            return;
        }
        loadWithRecovery(lastRequestedUrl);
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        getWindow().setStatusBarColor(0xFF111111);
        getWindow().setNavigationBarColor(0xFF111111);
        createNotificationChannel();

        FrameLayout root = new FrameLayout(this);
        webView = new WebView(this);
        progressBar = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        progressBar.setMax(100);

        root.addView(webView, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
        ));

        FrameLayout.LayoutParams progressParams = new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                6
        );
        root.addView(progressBar, progressParams);

        errorOverlay = buildErrorOverlay();
        root.addView(errorOverlay, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
        ));

        setContentView(root);
        configureWebView();
        registerNetworkCallback();

        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState);
            String restored = webView.getUrl();
            if (restored != null && !restored.isEmpty()) {
                lastRequestedUrl = restored;
                hasCommittedPage = true;
                webView.setVisibility(View.VISIBLE);
                errorOverlay.setVisibility(View.GONE);
            } else {
                loadWithRecovery(resolveLaunchUrl(getIntent()));
            }
        } else {
            loadWithRecovery(resolveLaunchUrl(getIntent()));
        }
    }

    private View buildErrorOverlay() {
        LinearLayout panel = new LinearLayout(this);
        panel.setOrientation(LinearLayout.VERTICAL);
        panel.setGravity(Gravity.CENTER);
        panel.setPadding(dp(30), dp(30), dp(30), dp(30));
        panel.setBackgroundColor(Color.rgb(247, 244, 248));
        panel.setVisibility(View.GONE);

        TextView badge = new TextView(this);
        badge.setText("MJ");
        badge.setGravity(Gravity.CENTER);
        badge.setTextColor(Color.WHITE);
        badge.setTextSize(21);
        badge.setBackgroundColor(Color.rgb(45, 36, 48));
        LinearLayout.LayoutParams badgeParams = new LinearLayout.LayoutParams(dp(64), dp(64));
        badgeParams.bottomMargin = dp(22);
        panel.addView(badge, badgeParams);

        TextView title = new TextView(this);
        title.setText("Connexion momentanément indisponible");
        title.setTextColor(Color.rgb(45, 36, 48));
        title.setTextSize(20);
        title.setGravity(Gravity.CENTER);
        title.setTypeface(null, android.graphics.Typeface.BOLD);
        panel.addView(title, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
        ));

        errorMessage = new TextView(this);
        errorMessage.setText("Maison Jiya va réessayer automatiquement. Vérifie simplement ta connexion Internet.");
        errorMessage.setTextColor(Color.rgb(105, 96, 107));
        errorMessage.setTextSize(14);
        errorMessage.setGravity(Gravity.CENTER);
        errorMessage.setPadding(0, dp(12), 0, dp(20));
        panel.addView(errorMessage, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
        ));

        Button retry = new Button(this);
        retry.setText("Réessayer maintenant");
        retry.setAllCaps(false);
        retry.setOnClickListener(v -> {
            retryAttempts = 0;
            loadWithRecovery(lastRequestedUrl);
        });
        LinearLayout.LayoutParams retryParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                dp(52)
        );
        panel.addView(retry, retryParams);

        return panel;
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;
        NotificationChannel channel = new NotificationChannel(
                NOTIFICATION_CHANNEL_ID,
                "Commandes Maison Jiya",
                NotificationManager.IMPORTANCE_HIGH
        );
        channel.setDescription("Notifications des nouvelles commandes Maison Jiya");
        channel.enableVibration(true);
        manager.createNotificationChannel(channel);
    }

    private boolean hasNotificationPermission() {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU
                || checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
    }

    private void requestNativeNotificationPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && !hasNotificationPermission()) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, NOTIFICATION_PERMISSION_REQUEST);
            return;
        }
        dispatchNotificationStateToWeb();
        showLocalNotification(
                "Notifications Maison Jiya activées",
                "Tu recevras une alerte lorsque l’application détecte une nouvelle commande."
        );
    }

    private void openNativeNotificationSettings() {
        try {
            Intent intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
            intent.putExtra(Settings.EXTRA_APP_PACKAGE, getPackageName());
            startActivity(intent);
        } catch (Exception e) {
            Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getPackageName()));
            startActivity(intent);
        }
    }

    private void showOrderNotification(String orderRef, String customerName, String products) {
        if (!hasNotificationPermission()) return;
        String safeRef = orderRef == null || orderRef.trim().isEmpty() ? "Nouvelle commande" : orderRef.trim();
        String customer = customerName == null ? "" : customerName.trim();
        String productList = products == null ? "" : products.trim();
        String detail = customer;
        if (!productList.isEmpty()) detail = detail.isEmpty() ? productList : detail + " · " + productList;
        if (detail.isEmpty()) detail = "Une nouvelle commande vient d’être enregistrée.";
        showLocalNotification("Nouvelle commande · " + safeRef, detail);
    }

    private void showLocalNotification(String title, String text) {
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null || !hasNotificationPermission()) return;

        Intent openApp = new Intent(this, MainActivity.class);
        openApp.setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pendingIntent = PendingIntent.getActivity(
                this,
                notificationCounter,
                openApp,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new Notification.Builder(this, NOTIFICATION_CHANNEL_ID)
                : new Notification.Builder(this);
        builder.setSmallIcon(android.R.drawable.ic_dialog_info)
                .setContentTitle(title)
                .setContentText(text)
                .setStyle(new Notification.BigTextStyle().bigText(text))
                .setAutoCancel(true)
                .setContentIntent(pendingIntent)
                .setDefaults(Notification.DEFAULT_SOUND | Notification.DEFAULT_VIBRATE)
                .setPriority(Notification.PRIORITY_HIGH);

        manager.notify(notificationCounter++, builder.build());
    }

    private void dispatchNotificationStateToWeb() {
        if (webView == null) return;
        boolean enabled = hasNotificationPermission();
        webView.evaluateJavascript(
                "window.dispatchEvent(new CustomEvent('maison-jiya-native-notifications',{detail:{enabled:" + (enabled ? "true" : "false") + "}}));",
                null
        );
    }

    private class NativeBridge {
        @JavascriptInterface
        public boolean notificationsSupported() {
            return true;
        }

        @JavascriptInterface
        public boolean notificationsEnabled() {
            return hasNotificationPermission();
        }

        @JavascriptInterface
        public void requestNotificationPermission() {
            runOnUiThread(() -> requestNativeNotificationPermission());
        }

        @JavascriptInterface
        public void openNotificationSettings() {
            runOnUiThread(() -> openNativeNotificationSettings());
        }

        @JavascriptInterface
        public void notifyNewOrder(String orderRef, String customerName, String products) {
            runOnUiThread(() -> showOrderNotification(orderRef, customerName, products));
        }
    }

    private void configureWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setLoadsImagesAutomatically(true);
        settings.setBlockNetworkLoads(false);

        settings.setLoadWithOverviewMode(false);
        settings.setUseWideViewPort(false);
        settings.setLayoutAlgorithm(WebSettings.LayoutAlgorithm.TEXT_AUTOSIZING);
        settings.setTextZoom(100);
        settings.setDefaultFontSize(16);
        settings.setMinimumFontSize(8);

        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setSupportZoom(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(true);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setUserAgentString(settings.getUserAgentString() + " MaisonJiyaAndroid/2.5");

        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        cookies.setAcceptThirdPartyCookies(webView, true);

        webView.addJavascriptInterface(new NativeBridge(), "MaisonJiyaNative");
        webView.setOverScrollMode(View.OVER_SCROLL_IF_CONTENT_SCROLLS);
        webView.setScrollBarStyle(View.SCROLLBARS_INSIDE_OVERLAY);
        webView.setWebViewClient(new MaisonJiyaWebViewClient());
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int newProgress) {
                progressBar.setProgress(newProgress);
                progressBar.setVisibility(newProgress >= 100 ? View.GONE : View.VISIBLE);
            }

            @Override
            public boolean onShowFileChooser(
                    WebView webView,
                    ValueCallback<Uri[]> filePathCallback,
                    FileChooserParams fileChooserParams
            ) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = filePathCallback;

                try {
                    Intent intent = fileChooserParams.createIntent();
                    intent.addCategory(Intent.CATEGORY_OPENABLE);
                    intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                    startActivityForResult(intent, FILE_CHOOSER_REQUEST);
                    return true;
                } catch (ActivityNotFoundException e) {
                    fileCallback = null;
                    Toast.makeText(MainActivity.this, "Aucune application de fichiers disponible.", Toast.LENGTH_LONG).show();
                    return false;
                }
            }
        });

        webView.setDownloadListener((url, userAgent, contentDisposition, mimeType, contentLength) -> openExternal(url));
    }

    private void registerNetworkCallback() {
        ConnectivityManager manager = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        if (manager == null) return;

        networkCallback = new ConnectivityManager.NetworkCallback() {
            @Override
            public void onAvailable(Network network) {
                retryHandler.post(() -> {
                    if (webView == null || !isNetworkConnected()) return;
                    retryAttempts = 0;
                    if (!hasCommittedPage || errorOverlay.getVisibility() == View.VISIBLE) {
                        loadWithRecovery(lastRequestedUrl);
                    }
                });
            }

            @Override
            public void onLost(Network network) {
                retryHandler.post(() -> {
                    if (webView == null || isNetworkConnected()) return;
                    showConnectionError("Connexion perdue. La page reste protégée pendant la reconnexion automatique.");
                    scheduleRetry();
                });
            }
        };

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                manager.registerDefaultNetworkCallback(networkCallback);
            } else {
                NetworkRequest request = new NetworkRequest.Builder()
                        .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                        .build();
                manager.registerNetworkCallback(request, networkCallback);
            }
        } catch (Exception ignored) {
            networkCallback = null;
        }
    }

    private void loadWithRecovery(String url) {
        if (webView == null) return;
        lastRequestedUrl = (url == null || url.isEmpty()) ? HOME_URL : url;
        retryHandler.removeCallbacks(retryRunnable);
        errorOverlay.setVisibility(View.GONE);
        if (!hasCommittedPage) webView.setVisibility(View.INVISIBLE);
        progressBar.setVisibility(View.VISIBLE);

        if (!isNetworkConnected()) {
            showConnectionError("Aucune connexion Internet détectée. Maison Jiya réessaiera automatiquement.");
            scheduleRetry();
            return;
        }
        webView.loadUrl(lastRequestedUrl);
    }

    private void showConnectionError(String message) {
        progressBar.setVisibility(View.GONE);
        errorMessage.setText(message);
        if (hasCommittedPage) {
            webView.setVisibility(View.VISIBLE);
            errorOverlay.setVisibility(View.GONE);
        } else {
            webView.setVisibility(View.INVISIBLE);
            errorOverlay.setVisibility(View.VISIBLE);
        }
    }

    private void scheduleRetry() {
        retryHandler.removeCallbacks(retryRunnable);
        long[] delays = {1200L, 2500L, 4500L, 7000L, 10000L, 15000L};
        long delay = delays[Math.min(retryAttempts, delays.length - 1)];
        if (retryAttempts < Integer.MAX_VALUE) retryAttempts += 1;
        retryHandler.postDelayed(retryRunnable, delay);
    }

    private boolean isNetworkConnected() {
        ConnectivityManager manager = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        if (manager == null) return true;
        Network network = manager.getActiveNetwork();
        if (network == null) return false;
        NetworkCapabilities capabilities = manager.getNetworkCapabilities(network);
        return capabilities != null
                && capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                && capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED);
    }

    private String resolveLaunchUrl(Intent intent) {
        Uri data = intent == null ? null : intent.getData();
        if (data != null && "https".equalsIgnoreCase(data.getScheme()) && HOME_HOST.equalsIgnoreCase(data.getHost())) {
            return data.toString();
        }
        return HOME_URL;
    }

    private boolean isInternal(Uri uri) {
        return uri != null
                && "https".equalsIgnoreCase(uri.getScheme())
                && HOME_HOST.equalsIgnoreCase(uri.getHost());
    }

    private void openExternal(String url) {
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            startActivity(intent);
        } catch (Exception e) {
            Toast.makeText(this, "Impossible d’ouvrir ce lien.", Toast.LENGTH_SHORT).show();
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        loadWithRecovery(resolveLaunchUrl(intent));
    }

    @Override
    protected void onResume() {
        super.onResume();
        dispatchNotificationStateToWeb();
        if (webView != null && isNetworkConnected() && (!hasCommittedPage || errorOverlay.getVisibility() == View.VISIBLE)) {
            retryAttempts = 0;
            loadWithRecovery(lastRequestedUrl);
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        if (webView != null) webView.saveState(outState);
        super.onSaveInstanceState(outState);
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        if (!hasCommittedPage && errorOverlay != null && errorOverlay.getVisibility() == View.VISIBLE) {
            finishAndRemoveTask();
            return;
        }
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
            return;
        }
        finishAndRemoveTask();
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != FILE_CHOOSER_REQUEST || fileCallback == null) return;

        Uri[] result = null;
        if (resultCode == RESULT_OK) {
            if (data != null && data.getClipData() != null) {
                int count = data.getClipData().getItemCount();
                result = new Uri[count];
                for (int i = 0; i < count; i++) result[i] = data.getClipData().getItemAt(i).getUri();
            } else if (data != null && data.getData() != null) {
                result = new Uri[]{data.getData()};
            }
        }

        fileCallback.onReceiveValue(result);
        fileCallback = null;
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode != NOTIFICATION_PERMISSION_REQUEST) return;
        boolean granted = grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED;
        dispatchNotificationStateToWeb();
        if (granted) {
            showLocalNotification(
                    "Notifications Maison Jiya activées",
                    "Les alertes Android sont maintenant autorisées sur cet appareil."
            );
        }
    }

    @Override
    protected void onDestroy() {
        retryHandler.removeCallbacksAndMessages(null);
        ConnectivityManager manager = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        if (manager != null && networkCallback != null) {
            try {
                manager.unregisterNetworkCallback(networkCallback);
            } catch (Exception ignored) {
                // La callback peut déjà être détachée par Android.
            }
            networkCallback = null;
        }
        if (webView != null) {
            webView.removeJavascriptInterface("MaisonJiyaNative");
            webView.stopLoading();
            webView.setWebChromeClient(null);
            webView.setWebViewClient(null);
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }

    private class MaisonJiyaWebViewClient extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            if (isInternal(uri)) return false;
            openExternal(uri.toString());
            return true;
        }

        @Override
        public void onPageStarted(WebView view, String url, Bitmap favicon) {
            if (url != null && url.startsWith("https://" + HOME_HOST)) lastRequestedUrl = url;
            progressBar.setVisibility(View.VISIBLE);
            super.onPageStarted(view, url, favicon);
        }

        @Override
        public void onPageCommitVisible(WebView view, String url) {
            retryHandler.removeCallbacks(retryRunnable);
            retryAttempts = 0;
            hasCommittedPage = true;
            errorOverlay.setVisibility(View.GONE);
            webView.setVisibility(View.VISIBLE);
            super.onPageCommitVisible(view, url);
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            view.evaluateJavascript(
                    "(function(){" +
                    "var m=document.querySelector('meta[name=viewport]');" +
                    "if(!m){m=document.createElement('meta');m.name='viewport';document.head.appendChild(m);}" +
                    "m.content='width=device-width,initial-scale=1,viewport-fit=cover';" +
                    "var r=document.documentElement;r.classList.add('maison-jiya-native-app');" +
                    "function s(){r.style.setProperty('--mj-native-width',window.innerWidth+'px');r.style.setProperty('--mj-native-height',window.innerHeight+'px');}" +
                    "s();if(!window.__mjNativeResize){window.__mjNativeResize=true;window.addEventListener('resize',s,{passive:true});window.addEventListener('orientationchange',s,{passive:true});}" +
                    "})();",
                    null
            );
            dispatchNotificationStateToWeb();
            super.onPageFinished(view, url);
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
            if (request.isForMainFrame()) {
                view.stopLoading();
                showConnectionError("Le serveur n’a pas répondu. Nouvelle tentative automatique en cours…");
                scheduleRetry();
                return;
            }
            super.onReceivedError(view, request, error);
        }

        @Override
        public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse errorResponse) {
            if (request.isForMainFrame() && errorResponse.getStatusCode() >= 500) {
                view.stopLoading();
                showConnectionError("Maison Jiya est momentanément indisponible. Nouvelle tentative automatique…");
                scheduleRetry();
                return;
            }
            super.onReceivedHttpError(view, request, errorResponse);
        }

        @Override
        public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
            handler.cancel();
            showConnectionError("Connexion sécurisée impossible. Nouvelle tentative automatique…");
            scheduleRetry();
        }

        @Override
        public void onSafeBrowsingHit(WebView view, WebResourceRequest request, int threatType, SafeBrowsingResponse callback) {
            callback.backToSafety(true);
        }
    }
}
