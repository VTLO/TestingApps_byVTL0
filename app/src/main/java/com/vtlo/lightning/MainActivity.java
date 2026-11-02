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
import android.content.SharedPreferences;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.speech.tts.Voice;
import org.json.JSONArray;
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

import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Set;

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

    // ── synthèse vocale ──
    private TextToSpeech tts;
    private volatile String ttsState = "init";          // init | ok | nofr | error
    private final List<Voice> frVoices = new ArrayList<Voice>();
    private int voiceIdx = 0;
    private float ttsRate = 1f;
    private SharedPreferences prefs;

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

        prefs = getSharedPreferences("vtlo", MODE_PRIVATE);
        ttsRate = prefs.getFloat("rate", 1f);
        vibrator = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
        sensors = (SensorManager) getSystemService(Context.SENSOR_SERVICE);
        if (sensors != null) accel = sensors.getDefaultSensor(Sensor.TYPE_ACCELEROMETER);

        root = new FrameLayout(this);
        root.setBackgroundColor(0xFF04080F);
        setContentView(root);

        buildWebView();
        initTts();

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


    // ───────────── synthèse vocale (fr-FR) ─────────────
    private void initTts() {
        tts = new TextToSpeech(getApplicationContext(), new TextToSpeech.OnInitListener() {
            @Override public void onInit(int status) { onTtsInit(status); }
        });
    }

    private int voiceScore(Voice v) {
        String n = v.getName().toLowerCase(Locale.ROOT);
        int sc = 0;
        if ("FR".equalsIgnoreCase(v.getLocale().getCountry())) sc += 20;
        if (n.contains("female") || n.contains("femme")) sc += 60;
        else if (n.contains("male")) sc -= 60;
        // Voix Google fr-FR : fra / frc / vlf = féminines, frb / frd = masculines
        if (n.contains("-x-fra") || n.contains("-x-frc") || n.contains("-x-vlf")) sc += 40;
        if (n.contains("-x-frb") || n.contains("-x-frd")) sc -= 40;
        if (!v.isNetworkConnectionRequired()) sc += 10;
        sc += v.getQuality() / 100;
        return sc;
    }

    private void onTtsInit(int status) {
        if (status != TextToSpeech.SUCCESS || tts == null) { ttsState = "error"; return; }
        int r = tts.setLanguage(Locale.FRANCE);
        if (r == TextToSpeech.LANG_MISSING_DATA || r == TextToSpeech.LANG_NOT_SUPPORTED) { ttsState = "nofr"; return; }
        tts.setPitch(1.05f);
        tts.setSpeechRate(ttsRate);
        tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
            @Override public void onStart(String id) { callJs("window.__tts&&window.__tts.onStart(" + safeId(id) + ")"); }
            @Override public void onDone(String id) { callJs("window.__tts&&window.__tts.onDone(" + safeId(id) + ")"); }
            @Override public void onError(String id) { callJs("window.__tts&&window.__tts.onError(" + safeId(id) + ")"); }
        });
        frVoices.clear();
        try {
            Set<Voice> all = tts.getVoices();
            if (all != null) {
                for (Voice v : all) {
                    String lang = v.getLocale().getLanguage();
                    if (!"fr".equals(lang)) continue;
                    if (v.getFeatures() != null && v.getFeatures().contains("notInstalled")) continue;
                    frVoices.add(v);
                }
            }
        } catch (Exception ignored) { }
        Collections.sort(frVoices, new Comparator<Voice>() {
            @Override public int compare(Voice a, Voice b) { return voiceScore(b) - voiceScore(a); }
        });
        String saved = prefs.getString("voice", "");
        voiceIdx = 0;
        for (int i = 0; i < frVoices.size(); i++) if (frVoices.get(i).getName().equals(saved)) voiceIdx = i;
        applyVoice();
        ttsState = "ok";
    }

    private void applyVoice() {
        if (tts == null || frVoices.isEmpty()) return;
        try {
            Voice v = frVoices.get(voiceIdx % frVoices.size());
            tts.setVoice(v);
            prefs.edit().putString("voice", v.getName()).apply();
        } catch (Exception ignored) { }
    }

    private static String safeId(String id) {
        try { return String.valueOf(Integer.parseInt(id)); } catch (Exception e) { return "-1"; }
    }

    private void callJs(final String js) {
        if (web == null) return;
        web.post(new Runnable() { @Override public void run() { if (web != null) web.evaluateJavascript(js, null); } });
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


        @JavascriptInterface public String ttsStatus() { return ttsState; }

        @JavascriptInterface public float ttsGetRate() { return ttsRate; }

        @JavascriptInterface public void ttsSpeak(String json, float rate) {
            if (tts == null || !"ok".equals(ttsState)) return;
            try {
                ttsRate = Math.max(0.5f, Math.min(2f, rate));
                prefs.edit().putFloat("rate", ttsRate).apply();
                tts.setSpeechRate(ttsRate);
                tts.setPitch(1.05f);
                JSONArray arr = new JSONArray(json);
                for (int i = 0; i < arr.length(); i++) {
                    String t = arr.getString(i);
                    if (t.length() > 3900) t = t.substring(0, 3900);
                    tts.speak(t, i == 0 ? TextToSpeech.QUEUE_FLUSH : TextToSpeech.QUEUE_ADD, null, String.valueOf(i));
                }
            } catch (Exception e) {
                callJs("window.__tts&&window.__tts.onError(-1)");
            }
        }

        @JavascriptInterface public void ttsStop() { if (tts != null) { try { tts.stop(); } catch (Exception ignored) { } } }

        @JavascriptInterface public String ttsNextVoice() {
            if (frVoices.isEmpty()) return "1/1";
            voiceIdx = (voiceIdx + 1) % frVoices.size();
            applyVoice();
            return (voiceIdx + 1) + "/" + frVoices.size();
        }

        @JavascriptInterface public String ttsVoiceInfo() {
            return frVoices.isEmpty() ? "" : (voiceIdx + 1) + "/" + frVoices.size();
        }

        @JavascriptInterface public void ttsInstall() {
            try {
                Intent i = new Intent(TextToSpeech.Engine.ACTION_INSTALL_TTS_DATA);
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(i);
            } catch (Exception e) {
                try { startActivity(new Intent(android.provider.Settings.ACTION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); } catch (Exception ignored) { }
            }
        }

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
        if (web != null) web.onResume();
        if (sensors != null && accel != null) sensors.registerListener(this, accel, SensorManager.SENSOR_DELAY_GAME);
    }

    @Override
    protected void onPause() {
        if (sensors != null) sensors.unregisterListener(this);
        if (web != null) web.onPause();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        if (tts != null) { try { tts.stop(); tts.shutdown(); } catch (Exception ignored) { } tts = null; }
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
