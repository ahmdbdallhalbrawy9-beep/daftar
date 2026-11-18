package com.daftar.wallet;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** After a restart: keep-alive service if the owner switched it on, and the SMS upload jobs. */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || !Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) return;
        boolean on = context.getSharedPreferences(DaftarPlugin.PREFS, Context.MODE_PRIVATE).getBoolean("keepalive", false);
        if (on) KeepAliveService.start(context);
        UploadJobService.schedulePeriodic(context);   // catches SMS that arrived while the phone was off
        UploadJobService.scheduleSoon(context, 20000);
    }
}
