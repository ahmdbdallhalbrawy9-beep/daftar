package com.daftar.wallet;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.provider.Telephony;
import android.telephony.SmsMessage;

import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Wakes up when an SMS arrives. For a Vodafone Cash one it
 *  1. saves it in the SmsOutbox right away (local, durable, before any network),
 *  2. schedules a safety-net job (persisted, retried with backoff by the system),
 *  3. for a message with an operation number, uploads it straight away inside goAsync(); if that does not
 *     finish (no network, slow phone, killed process) an expedited job (Android 11+) and the job from step 2 do it.
 * Airtime messages ("شحن", no operation number) are not uploaded from here: their id depends on the date the phone's
 * SMS inbox stores, so the job waits for the inbox row and uploads that (see SmsOutbox / SmsUploader).
 */
public class SmsReceiver extends BroadcastReceiver {
    /** How long the receiver is held open for the quick upload (the system's limit is about 10 s). */
    private static final long HOLD_MS = 8000;

    @Override
    public void onReceive(Context context, Intent intent) {
        try {
            if (intent == null || !Telephony.Sms.Intents.SMS_RECEIVED_ACTION.equals(intent.getAction())) return;
            SmsMessage[] msgs = Telephony.Sms.Intents.getMessagesFromIntent(intent);
            if (msgs == null || msgs.length == 0) return;
            // one broadcast is one SMS; a long one arrives as several parts from the same sender
            String from = null;
            StringBuilder sb = new StringBuilder();
            for (SmsMessage m : msgs) {
                if (m == null) continue;
                if (from == null) from = m.getOriginatingAddress();
                String part = m.getMessageBody();
                if (part != null) sb.append(part);
            }
            if (from == null || !from.toUpperCase().contains("VF")) return;

            final Context app = context.getApplicationContext();
            final String text = sb.toString();
            final long now = System.currentTimeMillis();
            SharedPreferences p = app.getSharedPreferences(DaftarPlugin.PREFS, Context.MODE_PRIVATE);
            p.edit().putLong("recv_ts", now).apply();

            final boolean waitForInbox = SmsOutbox.dateKeyed(text);
            try {
                SmsOutbox.get(app).add(p.getString("uid", ""), from, text, now,
                    waitForInbox ? SmsOutbox.FROM_INBOX : SmsOutbox.DIRECT);
            } catch (Exception e) {
                // the plain inbox upload below still covers it
            }

            // safety net: runs even if the quick upload below does not finish (the SMS has landed in the inbox by then)
            UploadJobService.scheduleSoon(app, 8000);
            if (waitForInbox) return;

            // The system gives a receiver about 10 s; the upload is best-effort inside that. The message is already in
            // the outbox, so if it is not done in time the receiver is released and the jobs finish the work.
            final PendingResult pr = goAsync();
            final AtomicBoolean released = new AtomicBoolean(false);
            final Thread worker = new Thread(new Runnable() {
                @Override
                public void run() {
                    int r = SmsUploader.RETRY;
                    try {
                        r = SmsUploader.runFast(app);
                    } catch (Throwable e) {
                        r = SmsUploader.RETRY;
                    }
                    try {
                        if (r != SmsUploader.OK) UploadJobService.scheduleNow(app);
                    } catch (Throwable e) {
                        // the persisted job from above is still there
                    }
                }
            });
            Thread guard = new Thread(new Runnable() {
                @Override
                public void run() {
                    try {
                        worker.start();
                        worker.join(HOLD_MS);
                    } catch (Throwable e) {
                        // release below
                    }
                    if (pr != null && released.compareAndSet(false, true)) pr.finish();
                }
            });
            guard.start();
        } catch (Exception e) {
            // never crash on an incoming SMS
        }
    }
}
