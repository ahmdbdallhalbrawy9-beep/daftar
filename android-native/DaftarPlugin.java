package com.daftar.wallet;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/** Background keep-alive + limit notifications for the web app (JS name: "Daftar"). */
@CapacitorPlugin(
    name = "Daftar",
    permissions = {
        @Permission(strings = { Manifest.permission.POST_NOTIFICATIONS }, alias = "notifications"),
        @Permission(strings = { Manifest.permission.READ_SMS }, alias = "smsRead"),
        @Permission(strings = { Manifest.permission.RECEIVE_SMS }, alias = "smsReceive")
    }
)
public class DaftarPlugin extends Plugin {
    static final String PREFS = "daftar_native";
    static final String LIMITS_CHANNEL = "limits";

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private boolean notificationsOk() {
        return NotificationManagerCompat.from(getContext()).areNotificationsEnabled();
    }

    private boolean ignoringBattery() {
        try {
            PowerManager pm = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
            return pm != null && pm.isIgnoringBatteryOptimizations(getContext().getPackageName());
        } catch (Exception e) {
            return false;
        }
    }

    private JSObject statusObject() {
        JSObject r = new JSObject();
        r.put("notif", notificationsOk());
        r.put("battery", ignoringBattery());
        r.put("keepalive", prefs().getBoolean("keepalive", false));
        r.put("smsOk", getPermissionState("smsRead") == PermissionState.GRANTED && getPermissionState("smsReceive") == PermissionState.GRANTED);
        SharedPreferences p = prefs();
        r.put("hasAuth", !p.getString("refresh", "").isEmpty() && !p.getString("uid", "").isEmpty());
        r.put("lastUpload", p.getLong("upload_ts", 0));
        r.put("uploadErr", p.getString("upload_err", ""));
        return r;
    }

    @PluginMethod
    public void status(PluginCall call) {
        call.resolve(statusObject());
    }

    @PluginMethod
    public void setKeepAlive(PluginCall call) {
        boolean on = call.getBoolean("on", true);
        prefs().edit().putBoolean("keepalive", on).apply();
        if (on) KeepAliveService.start(getContext());
        else KeepAliveService.stop(getContext());
        call.resolve(statusObject());
    }

    /** The web app hands over what the background upload needs to sign in (kept private on this phone). */
    @PluginMethod
    public void setSyncAuth(PluginCall call) {
        prefs().edit()
            .putString("api_key", call.getString("apiKey", ""))
            .putString("project", call.getString("projectId", ""))
            .putString("uid", call.getString("uid", ""))
            .putString("device", call.getString("deviceId", ""))
            .putString("refresh", call.getString("refreshToken", ""))
            .remove("id_token").remove("id_exp").putBoolean("auth_bad", false)
            .apply();
        UploadJobService.schedulePeriodic(getContext());
        UploadJobService.scheduleSoon(getContext(), 3000);
        call.resolve(statusObject());
    }

    @PluginMethod
    public void clearSyncAuth(PluginCall call) {
        prefs().edit().remove("refresh").remove("uid").remove("id_token").remove("id_exp").remove("upload_sig").apply();
        call.resolve(statusObject());
    }

    @PluginMethod
    public void uploadNow(PluginCall call) {
        UploadJobService.scheduleSoon(getContext(), 500);
        call.resolve(statusObject());
    }

    @PluginMethod
    public void requestSmsPermissions(PluginCall call) {
        if (getPermissionState("smsRead") != PermissionState.GRANTED || getPermissionState("smsReceive") != PermissionState.GRANTED) {
            requestPermissionForAliases(new String[] { "smsRead", "smsReceive" }, call, "smsPermResult");
        } else {
            call.resolve(statusObject());
        }
    }

    @PermissionCallback
    private void smsPermResult(PluginCall call) {
        UploadJobService.scheduleSoon(getContext(), 1000);
        call.resolve(statusObject());
    }

    @PluginMethod
    public void requestNotifPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 33 && getPermissionState("notifications") != PermissionState.GRANTED) {
            requestPermissionForAlias("notifications", call, "notifPermResult");
        } else {
            call.resolve(statusObject());
        }
    }

    @PermissionCallback
    private void notifPermResult(PluginCall call) {
        call.resolve(statusObject());
    }

    @PluginMethod
    public void requestBatteryExemption(PluginCall call) {
        try {
            Intent i = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + getContext().getPackageName()));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
        } catch (Exception e) {
            try {
                Intent i = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(i);
            } catch (Exception e2) {
                // nothing more we can do; the status line tells the owner to do it by hand
            }
        }
        call.resolve(statusObject());
    }

    /** Shows one notification (same id again replaces it). */
    @PluginMethod
    public void notify(PluginCall call) {
        try {
            Context c = getContext();
            int id = call.getInt("id", 100);
            String title = call.getString("title", "");
            String body = call.getString("body", "");
            NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
            if (Build.VERSION.SDK_INT >= 26 && nm != null) {
                NotificationChannel ch = new NotificationChannel(LIMITS_CHANNEL, "تنبيهات الليميت", NotificationManager.IMPORTANCE_HIGH);
                nm.createNotificationChannel(ch);
            }
            Intent open = c.getPackageManager().getLaunchIntentForPackage(c.getPackageName());
            PendingIntent pi = open == null ? null
                : PendingIntent.getActivity(c, id, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
            android.app.Notification n = new NotificationCompat.Builder(c, LIMITS_CHANNEL)
                .setSmallIcon(android.R.drawable.stat_sys_warning)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setAutoCancel(true)
                .setContentIntent(pi)
                .build();
            NotificationManagerCompat.from(c).notify(id, n);
            call.resolve();
        } catch (SecurityException e) {
            call.reject("no notification permission");
        } catch (Exception e) {
            call.reject("notify failed: " + e.getMessage());
        }
    }
}
