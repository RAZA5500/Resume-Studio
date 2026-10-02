package com.resumestudio.app;

import android.content.Context;
import android.graphics.Color;
import android.os.Handler;
import android.os.Looper;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Small native helpers for the web app (src/app/core/native/app-native.ts):
 *  - print: Android's print service, whose "Save as PDF" printer gives the same text based PDF
 *    the browser print dialog gives on the website (a WebView has no window.print()).
 *  - setBackgroundColor: colours the area behind the status and navigation bars to match the
 *    app theme (the web view itself is kept clear of the bars).
 */
@CapacitorPlugin(name = "AppNative")
public class AppNativePlugin extends Plugin {

    /** Fonts and images in the page need a moment after onPageFinished before printing. */
    private static final long PRINT_DELAY_MS = 700;

    /** Kept until the next print so the page is not garbage collected while the print UI renders it. */
    private WebView printView;

    @PluginMethod
    public void print(PluginCall call) {
        String html = call.getString("html");
        if (html == null || html.isEmpty()) {
            call.reject("html is required");
            return;
        }
        String name = sanitize(call.getString("name", "ResumeStudio"));

        getActivity().runOnUiThread(() -> {
            WebView view = new WebView(getContext());
            view.getSettings().setJavaScriptEnabled(false);
            view.setWebViewClient(new WebViewClient() {
                private boolean started = false;

                @Override
                public void onPageFinished(WebView webView, String url) {
                    if (started) return;
                    started = true;
                    new Handler(Looper.getMainLooper()).postDelayed(() -> {
                        try {
                            PrintManager printManager = (PrintManager) getContext().getSystemService(Context.PRINT_SERVICE);
                            PrintDocumentAdapter adapter = webView.createPrintDocumentAdapter(name);
                            PrintAttributes attributes = new PrintAttributes.Builder()
                                .setMediaSize(PrintAttributes.MediaSize.ISO_A4)
                                .setMinMargins(PrintAttributes.Margins.NO_MARGINS)
                                .build();
                            printManager.print(name, adapter, attributes);
                            call.resolve();
                        } catch (Exception e) {
                            call.reject("Printing is not available", e);
                        }
                    }, PRINT_DELAY_MS);
                }
            });
            printView = view;
            view.loadDataWithBaseURL("https://localhost/", html, "text/html", "UTF-8", null);
        });
    }

    @PluginMethod
    public void setBackgroundColor(PluginCall call) {
        final int color;
        try {
            color = Color.parseColor(call.getString("color", "#0a0c10"));
        } catch (IllegalArgumentException e) {
            call.reject("Invalid color");
            return;
        }
        getActivity().runOnUiThread(() -> {
            getActivity().getWindow().getDecorView().setBackgroundColor(color);
            getBridge().getWebView().setBackgroundColor(color);
            call.resolve();
        });
    }

    private static String sanitize(String name) {
        String clean = name == null ? "" : name.replaceAll("[\\\\/:*?\"<>|]+", "").trim();
        return clean.isEmpty() ? "ResumeStudio" : clean;
    }
}
