package com.daftar.wallet;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;

import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.List;

/**
 * Durable local queue of the Vodafone Cash SMS that SmsReceiver saw. A message is written here the moment it
 * arrives (before any network call), and only marked sent after Firestore answered 200, so a killed process or a
 * lost connection never loses it; the upload is re-tried (by the job) until it succeeds.
 *
 * Two kinds, because of how the web app derives the id of a message (domain/sms.js, parseSms):
 *  - DIRECT: the id comes from the "رقم العملية" in the text, so the text can be uploaded as it is.
 *  - FROM_INBOX: the id is a hash of the SMS date + text (airtime "شحن رصيد", no operation number). The date must be
 *    the one the phone's SMS inbox stores, so these are NOT uploaded from here; they stay queued until the matching
 *    inbox row shows up, and that row (with its own date) is what gets uploaded.
 */
final class SmsOutbox extends SQLiteOpenHelper {
    static final int DIRECT = 0;
    static final int FROM_INBOX = 1;

    /** How long sent entries are kept (they are re-sent with every full upload, same 14 days as the inbox window). */
    static final long KEEP_MS = 14L * 24 * 3600 * 1000;
    /** Unsent entries are kept longer than that; they are never dropped just because an upload failed. */
    static final long KEEP_UNSENT_MS = 30L * 24 * 3600 * 1000;

    static final class Entry {
        String key;
        String uid;
        String address;
        String body;
        long date;
        int kind;
        boolean sent;
    }

    private static SmsOutbox instance;

    static synchronized SmsOutbox get(Context c) {
        if (instance == null) instance = new SmsOutbox(c.getApplicationContext());
        return instance;
    }

    private SmsOutbox(Context c) {
        super(c, "daftar_outbox.db", null, 1);
    }

    @Override
    public void onCreate(SQLiteDatabase db) {
        db.execSQL("CREATE TABLE outbox (k TEXT PRIMARY KEY, uid TEXT NOT NULL, a TEXT NOT NULL, b TEXT NOT NULL, "
            + "d INTEGER NOT NULL, kind INTEGER NOT NULL, sent INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL)");
    }

    @Override
    public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {
        // version 1 only
    }

    /**
     * True when the message's id is derived from its inbox date (airtime): the loose test "contains شحن" is a
     * superset of the one parseSms uses ("تم شحن رصيد …"), so a message is never sent the direct way by mistake;
     * a wrongly-deferred one just goes through the inbox like before.
     */
    static boolean dateKeyed(String body) {
        return body != null && body.indexOf("شحن") >= 0;
    }

    private static String keyOf(String address, String body, long date) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-1");
            byte[] h = md.digest((address + "|" + date + "|" + body).getBytes("UTF-8"));
            StringBuilder sb = new StringBuilder("o");
            for (byte b : h) sb.append(String.format("%02x", b & 0xff));
            return sb.toString();
        } catch (Exception e) {
            return "o" + Math.abs((address + "|" + date + "|" + body).hashCode()) + "x" + date;
        }
    }

    /** Stores a message; the same (sender, text, time) twice is one entry. */
    boolean add(String uid, String address, String body, long date, int kind) {
        ContentValues v = new ContentValues();
        v.put("k", keyOf(address, body, date));
        v.put("uid", uid == null ? "" : uid);
        v.put("a", address);
        v.put("b", body);
        v.put("d", date);
        v.put("kind", kind);
        v.put("sent", 0);
        v.put("created", System.currentTimeMillis());
        return getWritableDatabase().insertWithOnConflict("outbox", null, v, SQLiteDatabase.CONFLICT_IGNORE) != -1;
    }

    private List<Entry> query(String where, String[] args) {
        List<Entry> out = new ArrayList<Entry>();
        Cursor cur = null;
        try {
            cur = getReadableDatabase().query("outbox", new String[] { "k", "uid", "a", "b", "d", "kind", "sent" },
                where, args, null, null, "d ASC");
            while (cur.moveToNext()) {
                Entry e = new Entry();
                e.key = cur.getString(0);
                e.uid = cur.getString(1);
                e.address = cur.getString(2);
                e.body = cur.getString(3);
                e.date = cur.getLong(4);
                e.kind = cur.getInt(5);
                e.sent = cur.getInt(6) != 0;
                out.add(e);
            }
        } finally {
            if (cur != null) cur.close();
        }
        return out;
    }

    /** DIRECT entries of this account: those inside the window (every full upload re-writes them) and any not sent yet. */
    List<Entry> direct(String uid, long since) {
        return query("kind=? AND (d>? OR sent=0) AND (uid=? OR uid='')", new String[] { String.valueOf(DIRECT), String.valueOf(since), uid });
    }

    /** FROM_INBOX entries still waiting for their inbox row. */
    List<Entry> waiting(String uid) {
        return query("kind=? AND sent=0 AND (uid=? OR uid='')", new String[] { String.valueOf(FROM_INBOX), uid });
    }

    void markSent(List<String> keys) {
        if (keys == null || keys.isEmpty()) return;
        SQLiteDatabase db = getWritableDatabase();
        db.beginTransaction();
        try {
            for (String k : keys) {
                ContentValues v = new ContentValues();
                v.put("sent", 1);
                db.update("outbox", v, "k=?", new String[] { k });
            }
            db.setTransactionSuccessful();
        } finally {
            db.endTransaction();
        }
    }

    /** @return {DIRECT entries not sent yet, FROM_INBOX entries still waiting} for this account. */
    int[] counts(String uid) {
        int[] r = new int[2];
        for (Entry e : query("sent=0 AND (uid=? OR uid='')", new String[] { uid })) {
            if (e.kind == DIRECT) r[0]++;
            else r[1]++;
        }
        return r;
    }

    void prune(long now) {
        SQLiteDatabase db = getWritableDatabase();
        db.delete("outbox", "sent=1 AND d<?", new String[] { String.valueOf(now - KEEP_MS) });
        db.delete("outbox", "sent=0 AND d<?", new String[] { String.valueOf(now - KEEP_UNSENT_MS) });
    }
}
