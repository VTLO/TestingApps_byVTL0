package com.vtlo.lightning;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.content.res.AssetFileDescriptor;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.media.PlaybackParams;
import android.os.Handler;
import android.os.Looper;
import android.view.HapticFeedbackConstants;
import android.view.Surface;
import android.view.View;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import java.util.Locale;

/**
 * Operation Lightning — full-screen, offline WebView shell.
 * Provides: edge-to-edge window with real inset values pushed to CSS,
 * haptics bridge, accelerometer tilt feed, back-button routing, external link hand-off.
 */
public class MainActivity extends Activity implements SensorEventListener {

    private static final String START_URL = "file:///android_asset/www/index.html";

    private WebView web;
    private FrameLayout root;
    private Vibrator vibrator;
    private SensorManager sensors;
    private Sensor accel;

    // ── audio : piste d'ambiance (boucle) + voix préenregistrées ──
    private MediaPlayer bgPlayer, narPlayer, fxPlayer;
    private float bgVol = 0.6f, bgTarget = 0.6f;
    private boolean bgReady = false, audioPausedByApp = false;
    private final Handler ui = new Handler(Looper.getMainLooper());
    private Runnable rampTask;

    private int insT, insR, insB, insL;
    private boolean pageReady = false;

    // tilt filtering
    private float fx, fy, baseY = Float.NaN;
    private float lastSentX = 9, lastSentY = 9;
    private long lastSentAt = 0;

    @SuppressLint({"SetJavaScriptEnabled", "ClickableViewAccessibility"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        Window w = getWindow();
        w.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        w.setStatusBarColor(Color.TRANSPARENT);
        w.setNavigationBarColor(Color.TRANSPARENT);
        if (Build.VERSION.SDK_INT >= 28) {
            w.getAttributes().layoutInDisplayCutoutMode =
                    WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
        }
        if (Build.VERSION.SDK_INT >= 29) {
            w.setNavigationBarContrastEnforced(false);
            w.setStatusBarContrastEnforced(false);
        }
        if (Build.VERSION.SDK_INT >= 30) {
            w.setDecorFitsSystemWindows(false);
        } else {
            w.getDecorView().setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
        }

        vibrator = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
        sensors = (SensorManager) getSystemService(Context.SENSOR_SERVICE);
        if (sensors != null) accel = sensors.getDefaultSensor(Sensor.TYPE_ACCELEROMETER);

        root = new FrameLayout(this);
        root.setBackgroundColor(0xFF04080F);
        setContentView(root);

        buildWebView();

        root.setOnApplyWindowInsetsListener(new View.OnApplyWindowInsetsListener() {
            @Override
            public WindowInsets onApplyWindowInsets(View v, WindowInsets insets) {
                readInsets(insets);
                pushInsets();
                return insets;
            }
        });
        root.requestApplyInsets();
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void buildWebView() {
        web = new WebView(this);
        web.setBackgroundColor(0xFF04080F);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.setVerticalScrollBarEnabled(false);
        web.setHorizontalScrollBarEnabled(false);
        web.setLayerType(View.LAYER_TYPE_HARDWARE, null);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(false);
        s.setAllowFileAccessFromFileURLs(true);      // local @font-face from assets
        s.setAllowUniversalAccessFromFileURLs(false);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setTextZoom(100);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(false);

        web.addJavascriptInterface(new Bridge(), "AndroidFX");

        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                Uri u = req.getUrl();
                String sch = u.getScheme();
                if ("file".equals(sch)) return false;
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, u).addCategory(Intent.CATEGORY_BROWSABLE));
                } catch (Exception ignored) { }
                return true;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                pageReady = true;
                pushInsets();
            }

            @Override
            public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                // Renderer died (low memory etc.) — rebuild the view cleanly instead of crashing.
                runOnUiThread(new Runnable() {
                    @Override public void run() {
                        root.removeAllViews();
                        try { web.destroy(); } catch (Exception ignored) { }
                        pageReady = false;
                        buildWebView();
                    }
                });
                return true;
            }
        });

        root.addView(web, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        web.loadUrl(START_URL);
    }



    private void callJs(final String js) {
        if (web == null) return;
        web.post(new Runnable() { @Override public void run() { if (web != null) web.evaluateJavascript(js, null); } });
    }

    // ───────────── audio natif ─────────────
    private AudioAttributes mediaAttrs() {
        return new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_MUSIC).build();
    }
    private MediaPlayer openAsset(String path) throws Exception {
        AssetFileDescriptor fd = getAssets().openFd(path);       // fichiers .mp3 stockés non compressés dans l'APK
        MediaPlayer mp = new MediaPlayer();
        mp.setAudioAttributes(mediaAttrs());
        mp.setDataSource(fd.getFileDescriptor(), fd.getStartOffset(), fd.getLength());
        fd.close();
        return mp;
    }
    private void releaseBg() {
        bgReady = false;
        if (rampTask != null) ui.removeCallbacks(rampTask);
        if (bgPlayer != null) { try { bgPlayer.release(); } catch (Exception ignored) { } bgPlayer = null; }
    }
    private void releaseFx() {
        if (fxPlayer != null) { try { fxPlayer.release(); } catch (Exception ignored) { } fxPlayer = null; }
    }
    private void releaseNar() {
        if (narPlayer != null) { try { narPlayer.release(); } catch (Exception ignored) { } narPlayer = null; }
    }
    private void rampBg(final float to, final int ms) {
        if (rampTask != null) ui.removeCallbacks(rampTask);
        final float from = bgVol; final long t0 = System.currentTimeMillis(); final int d = Math.max(1, ms);
        bgTarget = to;
        rampTask = new Runnable() {
            @Override public void run() {
                float k = Math.min(1f, (System.currentTimeMillis() - t0) / (float) d);
                bgVol = from + (to - from) * k;
                if (bgPlayer != null) { try { bgPlayer.setVolume(bgVol, bgVol); } catch (Exception ignored) { } }
                if (k < 1f) ui.postDelayed(this, 40);
            }
        };
        ui.post(rampTask);
    }

    // ───────────── insets ─────────────
    @SuppressWarnings("deprecation")
    private void readInsets(WindowInsets in) {
        if (Build.VERSION.SDK_INT >= 30) {
            android.graphics.Insets i = in.getInsets(
                    WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
            insT = i.top; insR = i.right; insB = i.bottom; insL = i.left;
        } else {
            insT = in.getSystemWindowInsetTop(); insR = in.getSystemWindowInsetRight();
            insB = in.getSystemWindowInsetBottom(); insL = in.getSystemWindowInsetLeft();
        }
    }

    private void pushInsets() {
        if (web == null || !pageReady) return;
        float d = getResources().getDisplayMetrics().density;
        final String js = String.format(Locale.US,
                "window.__setInsets&&window.__setInsets(%.2f,%.2f,%.2f,%.2f)",
                insT / d, insR / d, insB / d, insL / d);
        web.post(new Runnable() { @Override public void run() { web.evaluateJavascript(js, null); } });
    }

    // ───────────── JS bridge ─────────────
    class Bridge {
        @JavascriptInterface
        public void vibrate(String pattern) {
            if (vibrator == null || !vibrator.hasVibrator()) return;
            try {
                String[] parts = pattern.split(",");
                long[] t = new long[parts.length];
                for (int i = 0; i < parts.length; i++) t[i] = Math.max(0, Math.min(400, Long.parseLong(parts[i].trim())));
                if (t.length == 1) {
                    long ms = Math.max(5, t[0]);
                    if (Build.VERSION.SDK_INT >= 26) vibrator.vibrate(VibrationEffect.createOneShot(ms, VibrationEffect.DEFAULT_AMPLITUDE));
                    else vibrator.vibrate(ms);
                } else {
                    if (Build.VERSION.SDK_INT >= 26) vibrator.vibrate(VibrationEffect.createWaveform(t, -1));
                    else vibrator.vibrate(t, -1);
                }
            } catch (Exception ignored) { }
        }



        // ── piste d'ambiance ──
        @JavascriptInterface public void bgStart(final String path, final float vol) {
            ui.post(new Runnable() { @Override public void run() {
                releaseBg();
                try {
                    bgPlayer = openAsset(path); bgPlayer.setLooping(true); bgVol = vol; bgPlayer.setVolume(vol, vol);
                    bgPlayer.setOnPreparedListener(new MediaPlayer.OnPreparedListener() {
                        @Override public void onPrepared(MediaPlayer mp) { bgReady = true; try { mp.start(); } catch (Exception ignored) { } }
                    });
                    bgPlayer.setOnErrorListener(new MediaPlayer.OnErrorListener() {
                        @Override public boolean onError(MediaPlayer mp, int what, int extra) { releaseBg(); callJs("window.__snd&&window.__snd.onFail('bg')"); return true; }
                    });
                    bgPlayer.prepareAsync();
                } catch (Exception e) { releaseBg(); callJs("window.__snd&&window.__snd.onFail('bg')"); }
            } });
        }
        @JavascriptInterface public void bgVolume(final float v, final int ms) { ui.post(new Runnable() { @Override public void run() { rampBg(v, ms); } }); }
        @JavascriptInterface public void bgStop(final int fadeMs) {
            ui.post(new Runnable() { @Override public void run() {
                rampBg(0f, fadeMs);
                ui.postDelayed(new Runnable() { @Override public void run() { releaseBg(); } }, fadeMs + 120);
            } });
        }
        @JavascriptInterface public void bgPause() { ui.post(new Runnable() { @Override public void run() { try { if (bgPlayer != null && bgReady && bgPlayer.isPlaying()) bgPlayer.pause(); } catch (Exception ignored) { } } }); }
        @JavascriptInterface public void bgResume() { ui.post(new Runnable() { @Override public void run() { try { if (bgPlayer != null && bgReady) bgPlayer.start(); } catch (Exception ignored) { } } }); }
        @JavascriptInterface public int bgPos() { try { return (bgPlayer != null && bgReady) ? bgPlayer.getCurrentPosition() : -1; } catch (Exception e) { return -1; } }

        // ── voix préenregistrées ──
        @JavascriptInterface public void say(final String path, final float rate, final int token) {
            ui.post(new Runnable() { @Override public void run() {
                releaseNar();
                try {
                    final MediaPlayer mp = openAsset(path); narPlayer = mp;
                    mp.setVolume(1f, 1f);
                    mp.setOnCompletionListener(new MediaPlayer.OnCompletionListener() {
                        @Override public void onCompletion(MediaPlayer m) { if (narPlayer == m) { releaseNar(); } callJs("window.__snd&&window.__snd.onEnd(" + token + ")"); }
                    });
                    mp.setOnErrorListener(new MediaPlayer.OnErrorListener() {
                        @Override public boolean onError(MediaPlayer m, int what, int extra) { if (narPlayer == m) releaseNar(); callJs("window.__snd&&window.__snd.onEnd(" + token + ")"); return true; }
                    });
                    mp.setOnPreparedListener(new MediaPlayer.OnPreparedListener() {
                        @Override public void onPrepared(MediaPlayer m) {
                            try {
                                m.start();
                                if (Build.VERSION.SDK_INT >= 23 && Math.abs(rate - 1f) > 0.01f) m.setPlaybackParams(new PlaybackParams().setSpeed(rate));
                            } catch (Exception ignored) { }
                        }
                    });
                    mp.prepareAsync();
                } catch (Exception e) { callJs("window.__snd&&window.__snd.onEnd(" + token + ")"); }
            } });
        }

        // ── effets forts du scénario (transmission forcée, blackout) : volume maximal, par-dessus tout ──
        @JavascriptInterface public void fxPlay(final String path, final float vol, final int token) {
            ui.post(new Runnable() { @Override public void run() {
                releaseFx();
                try {
                    final MediaPlayer mp = openAsset(path); fxPlayer = mp; mp.setVolume(vol, vol);
                    mp.setOnCompletionListener(new MediaPlayer.OnCompletionListener() {
                        @Override public void onCompletion(MediaPlayer m) { if (fxPlayer == m) releaseFx(); callJs("window.__snd&&window.__snd.onFxEnd(" + token + ")"); }
                    });
                    mp.setOnErrorListener(new MediaPlayer.OnErrorListener() {
                        @Override public boolean onError(MediaPlayer m, int what, int extra) { if (fxPlayer == m) releaseFx(); callJs("window.__snd&&window.__snd.onFxEnd(" + token + ")"); return true; }
                    });
                    mp.setOnPreparedListener(new MediaPlayer.OnPreparedListener() { @Override public void onPrepared(MediaPlayer m) { try { m.start(); } catch (Exception ignored) { } } });
                    mp.prepareAsync();
                } catch (Exception e) { callJs("window.__snd&&window.__snd.onFxEnd(" + token + ")"); }
            } });
        }
        @JavascriptInterface public void fxStop() { ui.post(new Runnable() { @Override public void run() { releaseFx(); } }); }

        @JavascriptInterface public void sayStop() { ui.post(new Runnable() { @Override public void run() { releaseNar(); } }); }
        @JavascriptInterface public void sayPause() { ui.post(new Runnable() { @Override public void run() { try { if (narPlayer != null && narPlayer.isPlaying()) narPlayer.pause(); } catch (Exception ignored) { } } }); }
        @JavascriptInterface public void sayResume() { ui.post(new Runnable() { @Override public void run() { try { if (narPlayer != null) narPlayer.start(); } catch (Exception ignored) { } } }); }

        @JavascriptInterface
        public void tick() {
            web.post(new Runnable() { @Override public void run() {
                web.performHapticFeedback(
                        Build.VERSION.SDK_INT >= 27 ? HapticFeedbackConstants.CLOCK_TICK : HapticFeedbackConstants.VIRTUAL_KEY);
            } });
        }
    }

    // ───────────── tilt sensor → JS ─────────────
    @Override
    public void onSensorChanged(SensorEvent e) {
        if (e.sensor.getType() != Sensor.TYPE_ACCELEROMETER || !pageReady) return;
        float ax = e.values[0], ay = e.values[1];
        int rot = getWindowManager().getDefaultDisplay().getRotation();
        float sx, sy;
        switch (rot) {
            case Surface.ROTATION_90:  sx = -ay; sy =  ax; break;
            case Surface.ROTATION_180: sx = -ax; sy = -ay; break;
            case Surface.ROTATION_270: sx =  ay; sy = -ax; break;
            default:                   sx =  ax; sy =  ay; break;
        }
        // low-pass
        fx += (sx - fx) * 0.12f;
        fy += (sy - fy) * 0.12f;
        if (Float.isNaN(baseY)) { baseY = fy; }
        baseY += (fy - baseY) * 0.004f;                 // slowly re-centre on how the phone is held
        float tx = Math.max(-1f, Math.min(1f, -fx / 4.5f));
        float ty = Math.max(-1f, Math.min(1f, (fy - baseY) / 4.5f));
        long now = System.currentTimeMillis();
        if (now - lastSentAt < 40) return;               // ≤ 25 Hz
        if (Math.abs(tx - lastSentX) < 0.02f && Math.abs(ty - lastSentY) < 0.02f) return;
        lastSentAt = now; lastSentX = tx; lastSentY = ty;
        final String js = String.format(Locale.US, "window.__tilt&&window.__tilt(%.3f,%.3f)", tx, ty);
        web.evaluateJavascript(js, null);
    }

    @Override public void onAccuracyChanged(Sensor sensor, int accuracy) { }

    // ───────────── lifecycle ─────────────
    @Override
    protected void onResume() {
        super.onResume();
        try { if (audioPausedByApp) { if (bgPlayer != null) bgPlayer.start(); if (narPlayer != null) narPlayer.start(); if (fxPlayer != null) fxPlayer.start(); } audioPausedByApp = false; } catch (Exception ignored) { }
        if (web != null) web.onResume();
        if (sensors != null && accel != null) sensors.registerListener(this, accel, SensorManager.SENSOR_DELAY_GAME);
    }

    @Override
    protected void onPause() {
        try { if (bgPlayer != null && bgReady && bgPlayer.isPlaying()) { bgPlayer.pause(); audioPausedByApp = true; } if (narPlayer != null && narPlayer.isPlaying()) { narPlayer.pause(); audioPausedByApp = true; } if (fxPlayer != null && fxPlayer.isPlaying()) { fxPlayer.pause(); audioPausedByApp = true; } } catch (Exception ignored) { }
        if (sensors != null) sensors.unregisterListener(this);
        if (web != null) web.onPause();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        releaseBg(); releaseNar(); releaseFx();
        if (web != null) { root.removeAllViews(); web.destroy(); web = null; }
        super.onDestroy();
    }

    @Override
    public void onBackPressed() {
        if (web == null) { super.onBackPressed(); return; }
        web.evaluateJavascript("(window.__lxBack&&window.__lxBack())?1:0", new android.webkit.ValueCallback<String>() {
            @Override public void onReceiveValue(String v) {
                if (!"1".equals(v)) finish();
            }
        });
    }
}
