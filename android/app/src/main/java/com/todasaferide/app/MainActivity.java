package com.todasaferide.app;

import android.os.Bundle;
import android.view.WindowManager;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    // The screen stays on while this app is in front.
    //
    // lib/keepAwake.ts already asks for this through the Screen Wake Lock API,
    // and that works in a mobile browser — but Android's WebView, which is what
    // the installed app runs in, does not offer that API at all. So the APK was
    // the one build with no way to say "not now" to the sleep timer.
    //
    // Pilot testing 2026-09-29 measured what that costs. The driver, on the
    // APK, had his own phone reporting its last GPS fix as 24 seconds old; the
    // passenger, in Safari on an iPhone, stayed at 4 seconds — same trip, same
    // network, same minute. Android throttles timers and the location watch on
    // a page whose screen has gone dark, and a driver with the phone mounted is
    // not touching it for minutes at a time.
    //
    // The flag is scoped to this activity and to the foreground: leave the app
    // and the phone sleeps as it normally would.
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    }
}
