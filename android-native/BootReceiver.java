package com.daftar.wallet;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Starts the keep-alive service again after the phone restarts (unless the owner switched it off). */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || !Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) return;
        boolean on = context.getSharedPreferences(DaftarPlugin.PREFS, Context.MODE_PRIVATE).getBoolean("keepalive", true);
        if (on) KeepAliveService.start(context);
    }
}
