package com.daftar.wallet;

import android.app.job.JobInfo;
import android.app.job.JobParameters;
import android.app.job.JobScheduler;
import android.app.job.JobService;
import android.content.ComponentName;
import android.content.Context;
import android.os.Build;

/** Runs SmsUploader off the main thread when the system says the phone is online. */
public class UploadJobService extends JobService {
    static final int ONE_SHOT = 71;
    static final int PERIODIC = 72;
    static final int EXPEDITED = 73;
    private static final long PERIODIC_MS = 60L * 60 * 1000;

    /** One upload soon (after the SMS has landed in the inbox); waits for a network and retries with backoff. */
    static void scheduleSoon(Context c, long delayMs) {
        try {
            JobScheduler js = (JobScheduler) c.getSystemService(Context.JOB_SCHEDULER_SERVICE);
            if (js == null) return;
            js.schedule(new JobInfo.Builder(ONE_SHOT, new ComponentName(c, UploadJobService.class))
                .setMinimumLatency(delayMs)
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                .setBackoffCriteria(30000, JobInfo.BACKOFF_POLICY_LINEAR)
                .setPersisted(true)
                .build());
        } catch (Exception e) {
            // never crash the app because the system refused a job
        }
    }

    /**
     * An upload as soon as possible, ahead of Doze/standby deferral where the system allows it (Android 11+,
     * expedited jobs have a quota; over quota they run as a normal job). Older Android: nothing here, the
     * persisted job from scheduleSoon covers it.
     */
    static void scheduleNow(Context c) {
        if (Build.VERSION.SDK_INT < 30) return;
        try {
            JobScheduler js = (JobScheduler) c.getSystemService(Context.JOB_SCHEDULER_SERVICE);
            if (js == null) return;
            js.schedule(new JobInfo.Builder(EXPEDITED, new ComponentName(c, UploadJobService.class))
                .setExpedited(true)
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                .build());
        } catch (Exception e) {
            // expedited jobs have extra rules; if the system refuses, the persisted job still runs
        }
    }

    /** Safety net: every hour, in case a message arrived while the receiver was blocked (also re-tries anything queued). */
    static void schedulePeriodic(Context c) {
        try {
            JobScheduler js = (JobScheduler) c.getSystemService(Context.JOB_SCHEDULER_SERVICE);
            if (js == null) return;
            for (JobInfo j : js.getAllPendingJobs()) {
                if (j.getId() == PERIODIC && j.getIntervalMillis() == PERIODIC_MS) return;
            }
            js.schedule(new JobInfo.Builder(PERIODIC, new ComponentName(c, UploadJobService.class))
                .setPeriodic(PERIODIC_MS)
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                .setPersisted(true)
                .build());
        } catch (Exception e) {
            // ignore
        }
    }

    @Override
    public boolean onStartJob(final JobParameters params) {
        final Context c = getApplicationContext();
        new Thread(new Runnable() {
            @Override
            public void run() {
                int r;
                try { r = SmsUploader.run(c); } catch (Throwable t) { r = SmsUploader.RETRY; }
                jobFinished(params, r == SmsUploader.RETRY);
            }
        }).start();
        return true;
    }

    @Override
    public boolean onStopJob(JobParameters params) {
        return true;
    }
}
