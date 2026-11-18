package com.daftar.wallet;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.provider.Telephony;
import android.telephony.SmsMessage;

/** Wakes up when an SMS arrives; for a Vodafone Cash one it schedules an upload a few seconds later. */
public class SmsReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        try {
            if (intent == null || !Telephony.Sms.Intents.SMS_RECEIVED_ACTION.equals(intent.getAction())) return;
            SmsMessage[] msgs = Telephony.Sms.Intents.getMessagesFromIntent(intent);
            if (msgs == null) return;
            for (SmsMessage m : msgs) {
                String from = m == null ? null : m.getOriginatingAddress();
                if (from != null && from.toUpperCase().contains("VF")) {
                    UploadJobService.scheduleSoon(context, 8000);
                    return;
                }
            }
        } catch (Exception e) {
            // never crash on an incoming SMS
        }
    }
}
