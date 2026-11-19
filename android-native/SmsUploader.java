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
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.locks.ReentrantLock;

/**
 * Uploads this phone's Vodafone Cash SMS to the owner's Firestore account without the web app running. It
 * writes `users/<uid>/settings/rawsms_<deviceId>` = {ts, items:{key:{a,b,d}}} through the Firestore REST API,
 * signed in with the refresh token the web app handed over (setSyncAuth). Two sources go into `items`:
 *  - the SMS inbox (last 14 days, key `m<_id>`, `d` = the inbox date), read here;
 *  - SmsOutbox DIRECT entries (key `o<hash>`, `d` = the time the broadcast arrived): messages with an operation
 *    number, so their id does not depend on `d`.
 * The web app on any phone turns those raw messages into pending items with the same parser it uses for its own
 * scan (rawInbox / parseSms), so a message gets the same id however it arrived; this class never builds an id.
 * Entries stay in the outbox until Firestore answered 200, and the job is re-tried until then.
 */
final class SmsUploader {
    static final int OK = 0;      // done (or nothing to do)
    static final int RETRY = 1;   // no network / server hiccup / something still queued: try again later
    static final int FAIL = 2;    // wrong setup (e.g. refresh token no longer valid): do not loop

    private static final long WINDOW_MS = 14L * 24 * 3600 * 1000;
    private static final int LIMIT = 200;
    /** An inbox row belongs to a queued FROM_INBOX message when the text matches and it was stored this close in time. */
    private static final long MATCH_MS = 10L * 60 * 1000;
    /** Keep re-trying a FROM_INBOX message this long through the job's backoff; after that only the periodic job looks. */
    private static final long WAIT_RETRY_MS = 2L * 3600 * 1000;

    /** The receiver's quick upload and the jobs run in the same process; one at a time so they never overwrite each other. */
    private static final ReentrantLock LOCK = new ReentrantLock();

    private SmsUploader() {}

    private static final class Row {
        long id;
        String address;
        String body;
        long date;
    }

    /** Full run (job): normal network timeouts. */
    static int run(Context c) {
        LOCK.lock();
        try {
            return runLocked(c, false);
        } finally {
            LOCK.unlock();
        }
    }

    /** Quick run (SmsReceiver, inside goAsync()): short timeouts, gives up fast if another upload is running. */
    static int runFast(Context c) {
        boolean got = false;
        try {
            got = LOCK.tryLock(1, TimeUnit.SECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
        if (!got) return RETRY;
        try {
            return runLocked(c, true);
        } finally {
            LOCK.unlock();
        }
    }

    private static String norm(String s) {
        return s == null ? "" : s.replaceAll("\\s+", " ").trim();
    }

    private static int runLocked(Context c, boolean fast) {
        SharedPreferences p = c.getSharedPreferences(DaftarPlugin.PREFS, Context.MODE_PRIVATE);
        p.edit().putLong("run_ts", System.currentTimeMillis()).apply();
        String apiKey = p.getString("api_key", "");
        String project = p.getString("project", "");
        String uid = p.getString("uid", "");
        String device = p.getString("device", "");
        String refresh = p.getString("refresh", "");
        if (apiKey.isEmpty() || project.isEmpty() || uid.isEmpty() || device.isEmpty() || refresh.isEmpty()) return OK;
        // the quick path must fit well inside the receiver's ~8 s hold (SmsReceiver.HOLD_MS); anything unfinished is left to the jobs
        int connectMs = fast ? 2500 : 15000;
        int readMs = fast ? 3000 : 20000;
        try {
            long now = System.currentTimeMillis();

            // the durable queue (an outbox problem must never block the plain inbox upload)
            SmsOutbox ob = null;
            List<SmsOutbox.Entry> direct = new ArrayList<SmsOutbox.Entry>();
            List<SmsOutbox.Entry> waiting = new ArrayList<SmsOutbox.Entry>();
            try {
                ob = SmsOutbox.get(c);
                ob.prune(now);
                direct = ob.direct(uid, now - WINDOW_MS);
                waiting = ob.waiting(uid);
            } catch (Exception e) {
                ob = null;
            }

            // the phone's SMS inbox (needs READ_SMS; without it the queued direct messages are still uploaded)
            List<Row> rows = new ArrayList<Row>();
            boolean canRead = c.checkSelfPermission(android.Manifest.permission.READ_SMS) == android.content.pm.PackageManager.PERMISSION_GRANTED;
            if (canRead) {
                Cursor cur = null;
                try {
                    cur = c.getContentResolver().query(
                        Uri.parse("content://sms/inbox"),
                        new String[] { "_id", "address", "body", "date" },
                        "date>? AND address LIKE ?",
                        new String[] { String.valueOf(now - WINDOW_MS), "%VF%" },
                        "date DESC LIMIT " + LIMIT);
                    while (cur != null && cur.moveToNext()) {
                        Row r = new Row();
                        r.id = cur.getLong(0);
                        r.address = cur.getString(1) == null ? "" : cur.getString(1);
                        r.body = cur.getString(2) == null ? "" : cur.getString(2);
                        r.date = cur.getLong(3);
                        rows.add(r);
                    }
                } finally {
                    if (cur != null) cur.close();
                }
            } else {
                note(p, 0, "no-sms-permission");
            }

            JSONObject items = new JSONObject();
            long newest = 0;
            for (Row r : rows) {
                JSONObject m = new JSONObject();
                m.put("a", field(new JSONObject(), "stringValue", r.address));
                m.put("b", field(new JSONObject(), "stringValue", r.body));
                m.put("d", field(new JSONObject(), "integerValue", String.valueOf(r.date)));
                items.put("m" + r.id, new JSONObject().put("mapValue", new JSONObject().put("fields", m)));
                newest = Math.max(newest, r.date);
            }

            // queued messages with an operation number: upload the text as received
            List<String> toMark = new ArrayList<String>();
            boolean unsent = false;
            long newestDirect = 0;
            for (SmsOutbox.Entry e : direct) {
                JSONObject m = new JSONObject();
                m.put("a", field(new JSONObject(), "stringValue", e.address));
                m.put("b", field(new JSONObject(), "stringValue", e.body));
                m.put("d", field(new JSONObject(), "integerValue", String.valueOf(e.date)));
                items.put(e.key, new JSONObject().put("mapValue", new JSONObject().put("fields", m)));
                newestDirect = Math.max(newestDirect, e.date);
                if (!e.sent) { toMark.add(e.key); unsent = true; }
            }

            // queued airtime messages: done once their inbox row (which carries the date the id is made from) is in the upload
            boolean[] used = new boolean[rows.size()];
            int stillWaiting = 0;
            boolean youngWaiting = false;
            for (SmsOutbox.Entry w : waiting) {
                boolean hit = false;
                for (int i = 0; i < rows.size() && !hit; i++) {
                    Row r = rows.get(i);
                    if (used[i]) continue;
                    if (norm(r.address).equalsIgnoreCase(norm(w.address)) && norm(r.body).equals(norm(w.body))
                        && Math.abs(r.date - w.date) <= MATCH_MS) {
                        used[i] = true;
                        hit = true;
                    }
                }
                if (hit) { toMark.add(w.key); unsent = true; }
                else {
                    stillWaiting++;
                    if (now - w.date < WAIT_RETRY_MS) youngWaiting = true;
                }
            }
            // without READ_SMS no inbox row can ever match: do not spin the job, the hourly one looks again
            int after = (youngWaiting && canRead) ? RETRY : OK;
            p.edit().putInt("outbox_waiting", stillWaiting).apply();

            // nothing new since the last successful upload: skip the write (a refresh is forced once a day)
            String sig = rows.size() + ":" + newest + ":" + direct.size() + ":" + newestDirect;
            long lastOk = p.getLong("upload_ts", 0);
            if (!unsent && sig.equals(p.getString("upload_sig", "")) && now - lastOk < 24L * 3600 * 1000) return after;

            String idToken = idToken(p, apiKey, refresh, connectMs, readMs);
            if (idToken == null) return p.getBoolean("auth_bad", false) ? FAIL : RETRY;

            String doc = "projects/" + project + "/databases/(default)/documents/users/" + uid + "/settings/rawsms_" + device;
            JSONObject fields = new JSONObject();
            fields.put("ts", field(new JSONObject(), "integerValue", String.valueOf(System.currentTimeMillis())));
            fields.put("items", new JSONObject().put("mapValue", new JSONObject().put("fields", items)));
            JSONObject write = new JSONObject().put("update", new JSONObject().put("name", doc).put("fields", fields));
            JSONObject body = new JSONObject().put("writes", new org.json.JSONArray().put(write));
            String url = "https://firestore.googleapis.com/v1/projects/" + project + "/databases/(default)/documents:commit";
            int code = post(url, body.toString(), "application/json", idToken, null, connectMs, readMs);
            if (code == 200) {
                // only now is it safe to forget what was queued
                if (ob != null) {
                    try { ob.markSent(toMark); } catch (Exception e) { /* re-sent next time: the same keys overwrite themselves */ }
                }
                p.edit().putLong("upload_ts", System.currentTimeMillis()).putString("upload_sig", sig)
                    .putInt("upload_count", rows.size() + direct.size()).putString("upload_err", "").apply();
                return after;
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
            // never give up on queued messages because of one unexpected error: the job backs off and tries again
            note(p, -2, "error: " + e.getClass().getSimpleName());
            return RETRY;
        }
    }

    private static JSONObject field(JSONObject o, String type, String v) throws org.json.JSONException {
        return o.put(type, v);
    }

    private static void note(SharedPreferences p, int code, String err) {
        p.edit().putString("upload_err", err).apply();
    }

    /** Returns a valid Firebase ID token (cached until shortly before it expires), or null. */
    private static String idToken(SharedPreferences p, String apiKey, String refresh, int connectMs, int readMs) throws java.io.IOException, org.json.JSONException {
        String cached = p.getString("id_token", "");
        if (!cached.isEmpty() && System.currentTimeMillis() < p.getLong("id_exp", 0) - 120000) return cached;
        String form = "grant_type=refresh_token&refresh_token=" + URLEncoder.encode(refresh, "UTF-8");
        String[] out = new String[1];
        int code = post("https://securetoken.googleapis.com/v1/token?key=" + URLEncoder.encode(apiKey, "UTF-8"),
            form, "application/x-www-form-urlencoded", null, out, connectMs, readMs);
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
    private static int post(String url, String body, String type, String bearer, String[] out, int connectMs, int readMs) throws java.io.IOException {
        HttpURLConnection h = (HttpURLConnection) new URL(url).openConnection();
        try {
            h.setRequestMethod("POST");
            h.setConnectTimeout(connectMs);
            h.setReadTimeout(readMs);
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
