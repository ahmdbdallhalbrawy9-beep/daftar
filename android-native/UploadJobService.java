package com.daftar.wallet;

import android.app.job.JobInfo;
import android.app.job.JobParameters;
import android.app.job.JobScheduler;
import android.app.job.JobService;
import android.content.ComponentName;
import android.content.Context;

/** Runs SmsUploader off the main thread when the system says the phone is online. */
public class UploadJobService extends JobService {
    static final int ONE_SHOT = 71;
    static final int PERIODIC = 72;

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

    /** Safety net: every few hours, in case a message arrived while the receiver was blocked. */
    static void schedulePeriodic(Context c) {
        try {
            JobScheduler js = (JobScheduler) c.getSystemService(Context.JOB_SCHEDULER_SERVICE);
            if (js == null) return;
            for (JobInfo j : js.getAllPendingJobs()) if (j.getId() == PERIODIC) return;
            js.schedule(new JobInfo.Builder(PERIODIC, new ComponentName(c, UploadJobService.class))
                .setPeriodic(4L * 3600 * 1000)
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
                try { r = SmsUploader.run(c); } catch (Throwable t) { r = SmsUploader.FAIL; }
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
