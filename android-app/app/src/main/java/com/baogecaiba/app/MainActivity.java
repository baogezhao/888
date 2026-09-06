package com.baogecaiba.app;

import android.app.Activity;
import android.Manifest;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.ViewGroup;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.ProgressBar;

import com.google.firebase.messaging.FirebaseMessaging;

public class MainActivity extends Activity {
    private static final String HOME_URL = "https://baogezhao.github.io/888/";
    private static final int NOTIFICATION_PERMISSION_REQUEST = 1001;
    private WebView webView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        ViewGroup root = new android.widget.FrameLayout(this);
        webView = new WebView(this);
        ProgressBar progress = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        progress.setMax(100);

        root.addView(webView, new ViewGroup.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ));
        root.addView(progress, new ViewGroup.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            8
        ));
        setContentView(root);

        BaogeMessagingService.createNotificationChannel(this);
        FirebaseMessaging.getInstance().subscribeToTopic("all_users");
        askNotificationPermission();

        webView.setBackgroundColor(Color.rgb(247, 248, 250));
        webView.getSettings().setJavaScriptEnabled(true);
        webView.getSettings().setDomStorageEnabled(true);
        webView.getSettings().setBuiltInZoomControls(false);
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return false;
            }
        });
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int newProgress) {
                progress.setProgress(newProgress);
                progress.setVisibility(newProgress == 100 ? android.view.View.GONE : android.view.View.VISIBLE);
            }
        });

        if (savedInstanceState == null) webView.loadUrl(getNotificationUrl(getIntent()));
        else webView.restoreState(savedInstanceState);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        if (webView != null) webView.loadUrl(getNotificationUrl(intent));
    }

    private String getNotificationUrl(Intent intent) {
        if (intent == null) return HOME_URL;
        String candidate = intent.getStringExtra("url");
        if (candidate == null || candidate.trim().isEmpty()) {
            candidate = intent.getStringExtra("article_url");
        }
        if ((candidate == null || candidate.trim().isEmpty()) && intent.getData() != null) {
            candidate = intent.getData().toString();
        }
        if (candidate == null) return HOME_URL;

        Uri uri = Uri.parse(candidate.trim());
        boolean trusted = "https".equalsIgnoreCase(uri.getScheme())
            && "baogezhao.github.io".equalsIgnoreCase(uri.getHost())
            && uri.getPath() != null
            && (uri.getPath().equals("/888") || uri.getPath().startsWith("/888/"));
        return trusted ? uri.toString() : HOME_URL;
    }

    private void askNotificationPermission() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU
                || checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) {
            return;
        }

        if (shouldShowRequestPermissionRationale(Manifest.permission.POST_NOTIFICATIONS)) {
            new AlertDialog.Builder(this)
                .setTitle("开启文章更新提醒")
                .setMessage("允许通知后，新文章发布时宝哥彩吧会及时提醒你。")
                .setPositiveButton("开启通知", (dialog, which) -> requestNotificationPermission())
                .setNegativeButton("暂不开启", null)
                .show();
        } else {
            requestNotificationPermission();
        }
    }

    private void requestNotificationPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, NOTIFICATION_PERMISSION_REQUEST);
        }
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        webView.saveState(outState);
        super.onSaveInstanceState(outState);
    }
}
