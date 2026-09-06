package com.baogecaiba.app;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

public class BaogeMessagingService extends FirebaseMessagingService {
    public static final String CHANNEL_ID = "article_updates";
    private static final String HOME_URL = "https://baogezhao.github.io/888/";

    public static void createNotificationChannel(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            "文章更新",
            NotificationManager.IMPORTANCE_DEFAULT
        );
        channel.setDescription("宝哥彩吧新文章与重要消息提醒");
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager != null) manager.createNotificationChannel(channel);
    }

    @Override
    public void onMessageReceived(RemoteMessage message) {
        super.onMessageReceived(message);
        createNotificationChannel(this);

        RemoteMessage.Notification notification = message.getNotification();
        String title = notification != null && notification.getTitle() != null
            ? notification.getTitle() : valueOrDefault(message.getData().get("title"), "宝哥彩吧");
        String body = notification != null && notification.getBody() != null
            ? notification.getBody() : valueOrDefault(message.getData().get("body"), "有新的文章更新，点击查看。");
        String url = valueOrDefault(message.getData().get("url"), message.getData().get("article_url"));
        showNotification(title, body, valueOrDefault(url, HOME_URL));
    }

    private void showNotification(String title, String body, String url) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            return;
        }

        Intent intent = new Intent(this, MainActivity.class)
            .putExtra("url", url)
            .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pendingIntent = PendingIntent.getActivity(
            this,
            (int) (System.currentTimeMillis() & 0xfffffff),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        android.app.Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            ? new android.app.Notification.Builder(this, CHANNEL_ID)
            : new android.app.Notification.Builder(this);
        builder.setSmallIcon(com.baogecaiba.app.R.drawable.ic_notification)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new android.app.Notification.BigTextStyle().bigText(body))
            .setAutoCancel(true)
            .setContentIntent(pendingIntent);

        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) manager.notify((int) (System.currentTimeMillis() & 0xfffffff), builder.build());
    }

    private static String valueOrDefault(String value, String fallback) {
        return value == null || value.trim().isEmpty() ? fallback : value.trim();
    }
}
