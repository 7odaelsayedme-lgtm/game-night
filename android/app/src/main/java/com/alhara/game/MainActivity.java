package com.alhara.game;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/** A full-screen window onto the live game, so it is always the newest version. */
public class MainActivity extends Activity {
  private static final String HOST = "game-night-yl5d.onrender.com";
  private static final String HOME = "https://" + HOST + "/alhara/";
  private static final String OFFLINE =
      "<!doctype html><html dir='rtl'><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'></head>"
    + "<body style='margin:0;height:100vh;display:grid;place-items:center;background:#ffc93c;font-family:sans-serif;color:#2b1a12;text-align:center'>"
    + "<div><div style='font-size:64px'>📡</div><h2>اللعبة محتاجة إنترنت</h2><p>اتأكد إن النت شغّال وجرّب تاني.<br>أول فتحة ممكن تاخد دقيقة لحد ما السيرفر يصحى.</p>"
    + "<button onclick=\"location.href='" + HOME + "'\" style='font-size:22px;padding:12px 28px;border-radius:999px;border:3px solid #2b1a12;background:#ff5d8f;color:#fff'>جرّب تاني</button></div></body></html>";

  private WebView web;

  @Override protected void onCreate(Bundle saved) {
    super.onCreate(saved);
    getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    web = new WebView(this);
    web.setBackgroundColor(Color.parseColor("#ffc93c"));
    WebSettings s = web.getSettings();
    s.setJavaScriptEnabled(true);
    s.setDomStorageEnabled(true);
    s.setDatabaseEnabled(true);
    s.setMediaPlaybackRequiresUserGesture(false);
    s.setUseWideViewPort(true);
    s.setLoadWithOverviewMode(true);
    s.setCacheMode(WebSettings.LOAD_DEFAULT);
    web.setWebViewClient(new WebViewClient() {
      @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
        Uri u = r.getUrl();
        if (HOST.equals(u.getHost())) return false;
        try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception ignored) {}
        return true;
      }
      @Override public void onReceivedError(WebView v, WebResourceRequest r, WebResourceError e) {
        if (r.isForMainFrame()) v.loadDataWithBaseURL(HOME, OFFLINE, "text/html", "UTF-8", null);
      }
    });
    web.setWebChromeClient(new WebChromeClient());
    setContentView(web);
    hideBars();
    if (saved != null) web.restoreState(saved);
    else web.loadUrl(startUrl(getIntent()));
  }

  private String startUrl(Intent i) {
    Uri d = i != null ? i.getData() : null;
    return d != null && HOST.equals(d.getHost()) ? d.toString() : HOME;
  }

  @Override protected void onNewIntent(Intent i) {
    super.onNewIntent(i);
    if (i != null && i.getData() != null) web.loadUrl(startUrl(i));
  }

  @Override protected void onSaveInstanceState(Bundle out) { super.onSaveInstanceState(out); web.saveState(out); }
  @Override protected void onPause() { super.onPause(); web.onPause(); }
  @Override protected void onResume() { super.onResume(); web.onResume(); hideBars(); }
  @Override public void onWindowFocusChanged(boolean f) { super.onWindowFocusChanged(f); if (f) hideBars(); }

  @Override public void onBackPressed() {
    if (web.canGoBack()) web.goBack(); else super.onBackPressed();
  }

  @SuppressWarnings("deprecation")
  private void hideBars() {
    getWindow().getDecorView().setSystemUiVisibility(
        View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
      | View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
  }
}
