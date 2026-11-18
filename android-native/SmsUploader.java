package com.daftar.wallet;

import android.content.Context;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.net.Uri;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;

/**
 * Uploads this phone's recent Vodafone Cash SMS to the owner's Firestore account without the web app
 * running: it reads the SMS inbox, and writes `users/<uid>/settings/rawsms_<deviceId>` through the
 * Firestore REST API, signed in with the refresh token the web app handed over (setSyncAuth).
 * The web app on any phone turns those raw messages into pending items with the same parser it uses
 * for its own scan, so a message looks identical (same id) however it arrived.
 */
final class SmsUploader {
    static final int OK = 0;      // done (or nothing to do)
    static final int RETRY = 1;   // no network / server hiccup: try again later
    static final int FAIL = 2;    // wrong setup (e.g. refresh token no longer valid): do not loop

    private static final long WINDOW_MS = 14L * 24 * 3600 * 1000;
    private static final int LIMIT = 200;

    private SmsUploader() {}

    static int run(Context c) {
        SharedPreferences p = c.getSharedPreferences(DaftarPlugin.PREFS, Context.MODE_PRIVATE);
        String apiKey = p.getString("api_key", "");
        String project = p.getString("project", "");
        String uid = p.getString("uid", "");
        String device = p.getString("device", "");
        String refresh = p.getString("refresh", "");
        if (apiKey.isEmpty() || project.isEmpty() || uid.isEmpty() || device.isEmpty() || refresh.isEmpty()) return OK;
        if (c.checkSelfPermission(android.Manifest.permission.READ_SMS) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
            note(p, 0, "no-sms-permission");
            return OK;
        }
        try {
            JSONObject items = new JSONObject();
            long newest = 0;
            int count = 0;
            Cursor cur = null;
            try {
                long since = System.currentTimeMillis() - WINDOW_MS;
                cur = c.getContentResolver().query(
                    Uri.parse("content://sms/inbox"),
                    new String[] { "_id", "address", "body", "date" },
                    "date>? AND address LIKE ?",
                    new String[] { String.valueOf(since), "%VF%" },
                    "date DESC LIMIT " + LIMIT);
                while (cur != null && cur.moveToNext()) {
                    JSONObject m = new JSONObject();
                    m.put("a", field(new JSONObject(), "stringValue", cur.getString(1) == null ? "" : cur.getString(1)));
                    m.put("b", field(new JSONObject(), "stringValue", cur.getString(2) == null ? "" : cur.getString(2)));
                    m.put("d", field(new JSONObject(), "integerValue", String.valueOf(cur.getLong(3))));
                    items.put("m" + cur.getLong(0), new JSONObject().put("mapValue", new JSONObject().put("fields", m)));
                    newest = Math.max(newest, cur.getLong(3));
                    count++;
                }
            } finally {
                if (cur != null) cur.close();
            }
            // nothing new since the last successful upload: skip the write (a refresh is forced once a day)
            String sig = count + ":" + newest;
            long lastOk = p.getLong("upload_ts", 0);
            if (sig.equals(p.getString("upload_sig", "")) && System.currentTimeMillis() - lastOk < 24L * 3600 * 1000) return OK;

            String idToken = idToken(p, apiKey, refresh);
            if (idToken == null) return p.getBoolean("auth_bad", false) ? FAIL : RETRY;

            String doc = "projects/" + project + "/databases/(default)/documents/users/" + uid + "/settings/rawsms_" + device;
            JSONObject fields = new JSONObject();
            fields.put("ts", field(new JSONObject(), "integerValue", String.valueOf(System.currentTimeMillis())));
            fields.put("items", new JSONObject().put("mapValue", new JSONObject().put("fields", items)));
            JSONObject write = new JSONObject().put("update", new JSONObject().put("name", doc).put("fields", fields));
            JSONObject body = new JSONObject().put("writes", new org.json.JSONArray().put(write));
            String url = "https://firestore.googleapis.com/v1/projects/" + project + "/databases/(default)/documents:commit";
            int code = post(url, body.toString(), "application/json", idToken, null);
            if (code == 200) {
                p.edit().putLong("upload_ts", System.currentTimeMillis()).putString("upload_sig", sig)
                    .putInt("upload_count", count).putString("upload_err", "").apply();
                return OK;
            }
            if (code == 401 || code == 403) {
                p.edit().remove("id_token").remove("id_exp").apply();
                note(p, code, "firestore-" + code);
                return code == 401 ? RETRY : FAIL;
            }
            note(p, code, "firestore-" + code);
            return RETRY;
        } catch (java.io.IOException e) {
            note(p, -1, "network");
            return RETRY;
        } catch (Exception e) {
            note(p, -2, "error: " + e.getClass().getSimpleName());
            return FAIL;
        }
    }

    private static JSONObject field(JSONObject o, String type, String v) throws org.json.JSONException {
        return o.put(type, v);
    }

    private static void note(SharedPreferences p, int code, String err) {
        p.edit().putString("upload_err", err).apply();
    }

    /** Returns a valid Firebase ID token (cached until shortly before it expires), or null. */
    private static String idToken(SharedPreferences p, String apiKey, String refresh) throws java.io.IOException, org.json.JSONException {
        String cached = p.getString("id_token", "");
        if (!cached.isEmpty() && System.currentTimeMillis() < p.getLong("id_exp", 0) - 120000) return cached;
        String form = "grant_type=refresh_token&refresh_token=" + URLEncoder.encode(refresh, "UTF-8");
        String[] out = new String[1];
        int code = post("https://securetoken.googleapis.com/v1/token?key=" + URLEncoder.encode(apiKey, "UTF-8"),
            form, "application/x-www-form-urlencoded", null, out);
        if (code == 200 && out[0] != null) {
            JSONObject j = new JSONObject(out[0]);
            String id = j.optString("id_token", "");
            String newRefresh = j.optString("refresh_token", refresh);
            long ttl = Long.parseLong(j.optString("expires_in", "3600")) * 1000L;
            if (!id.isEmpty()) {
                p.edit().putString("id_token", id).putLong("id_exp", System.currentTimeMillis() + ttl)
                    .putString("refresh", newRefresh).putBoolean("auth_bad", false).apply();
                return id;
            }
        }
        if (code == 400 || code == 401) {
            // the account's login changed (password reset / signed out everywhere): the owner has to open the app once
            p.edit().putBoolean("auth_bad", true).putString("upload_err", "login-expired").apply();
        } else {
            p.edit().putString("upload_err", "token-" + code).apply();
        }
        return null;
    }

    /** @return HTTP status code; the response body goes into out[0] when given. */
    private static int post(String url, String body, String type, String bearer, String[] out) throws java.io.IOException {
        HttpURLConnection h = (HttpURLConnection) new URL(url).openConnection();
        try {
            h.setRequestMethod("POST");
            h.setConnectTimeout(15000);
            h.setReadTimeout(20000);
            h.setDoOutput(true);
            h.setRequestProperty("Content-Type", type);
            if (bearer != null) h.setRequestProperty("Authorization", "Bearer " + bearer);
            byte[] bytes = body.getBytes("UTF-8");
            h.setFixedLengthStreamingMode(bytes.length);
            try (OutputStream os = h.getOutputStream()) { os.write(bytes); }
            int code = h.getResponseCode();
            if (out != null) {
                InputStream is = code >= 400 ? h.getErrorStream() : h.getInputStream();
                if (is != null) {
                    StringBuilder sb = new StringBuilder();
                    try (BufferedReader r = new BufferedReader(new InputStreamReader(is, "UTF-8"))) {
                        String line;
                        while ((line = r.readLine()) != null) sb.append(line);
                    }
                    out[0] = sb.toString();
                }
            }
            return code;
        } finally {
            h.disconnect();
        }
    }
}
