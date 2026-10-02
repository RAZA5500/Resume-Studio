package com.resumestudio.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // App-specific native helpers (printing, system bar colour) — see AppNativePlugin.
        registerPlugin(AppNativePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
