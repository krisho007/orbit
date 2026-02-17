package com.orbit.app

import android.app.ActivityManager
import android.app.KeyguardManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.CallLog
import android.telephony.TelephonyManager
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat

class PhoneStateReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != TelephonyManager.ACTION_PHONE_STATE_CHANGED) {
      return
    }

    val state = intent.getStringExtra(TelephonyManager.EXTRA_STATE) ?: return
    val broadcastNumber = sanitizePhoneNumber(intent.getStringExtra(TelephonyManager.EXTRA_INCOMING_NUMBER))

    when (state) {
      TelephonyManager.EXTRA_STATE_RINGING -> {
        val number = broadcastNumber
          ?: resolvePhoneFromCallLog(context)
        persistLastNumber(context, number)
        showIncomingNotification(context, number)
      }

      TelephonyManager.EXTRA_STATE_OFFHOOK -> {
        cancelIncomingNotification(context)
        val number = broadcastNumber
          ?: getLastNumber(context)
          ?: resolvePhoneFromCallLog(context)
        if (number.isNullOrBlank()) {
          return
        }

        if (isDeviceUnlocked(context) && !isAppInForeground(context)) {
          launchDeepLink(context, number, "ringing")
        }
      }

      TelephonyManager.EXTRA_STATE_IDLE -> {
        cancelIncomingNotification(context)
        val number = broadcastNumber
          ?: getLastNumber(context)
          ?: resolvePhoneFromCallLog(context)
        showCallEndedNotification(context, number)
        clearLastNumber(context)
      }
    }
  }

  private fun resolvePhoneFromCallLog(context: Context): String? {
    if (ContextCompat.checkSelfPermission(context, android.Manifest.permission.READ_CALL_LOG)
      != PackageManager.PERMISSION_GRANTED
    ) {
      return null
    }

    return try {
      val cutoffMs = System.currentTimeMillis() - 5_000
      context.contentResolver.query(
        CallLog.Calls.CONTENT_URI,
        arrayOf(CallLog.Calls.NUMBER),
        "${CallLog.Calls.DATE} > ? AND ${CallLog.Calls.TYPE} = ?",
        arrayOf(cutoffMs.toString(), CallLog.Calls.INCOMING_TYPE.toString()),
        "${CallLog.Calls.DATE} DESC"
      )?.use { cursor ->
        if (cursor.moveToFirst()) {
          sanitizePhoneNumber(cursor.getString(0))
        } else {
          null
        }
      }
    } catch (_: Exception) {
      null
    }
  }

  private fun showIncomingNotification(context: Context, phoneNumber: String?) {
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    ensureNotificationChannels(manager)

    val openIntent = createDeepLinkIntent(context, phoneNumber, "ringing")
    val pendingIntent = PendingIntent.getActivity(
      context,
      REQUEST_CODE_INCOMING,
      openIntent,
      pendingIntentFlags()
    )

    val notification = NotificationCompat.Builder(context, CHANNEL_INCOMING)
      .setSmallIcon(android.R.drawable.sym_call_incoming)
      .setContentTitle("Incoming - check Orbit")
      .setContentText(phoneNumber ?: "Unknown number")
      .setCategory(NotificationCompat.CATEGORY_CALL)
      .setPriority(NotificationCompat.PRIORITY_HIGH)
      .setAutoCancel(true)
      .setContentIntent(pendingIntent)
      .build()

    manager.notify(NOTIFICATION_ID_INCOMING, notification)
  }

  private fun showCallEndedNotification(context: Context, phoneNumber: String?) {
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    ensureNotificationChannels(manager)

    val openIntent = createAssistantDeepLinkIntent(context, phoneNumber)
    val pendingIntent = PendingIntent.getActivity(
      context,
      REQUEST_CODE_ENDED,
      openIntent,
      pendingIntentFlags()
    )

    val notification = NotificationCompat.Builder(context, CHANNEL_ENDED)
      .setSmallIcon(android.R.drawable.sym_call_missed)
      .setContentTitle("Call ended")
      .setContentText("Capture call notes with Orbit Assistant")
      .setPriority(NotificationCompat.PRIORITY_DEFAULT)
      .setAutoCancel(true)
      .setContentIntent(pendingIntent)
      .build()

    manager.notify(NOTIFICATION_ID_ENDED, notification)
  }

  private fun launchDeepLink(context: Context, phoneNumber: String, phase: String) {
    val intent = createDeepLinkIntent(context, phoneNumber, phase)
    context.startActivity(intent)
  }

  private fun createAssistantDeepLinkIntent(context: Context, phoneNumber: String?): Intent {
    val builder = Uri.Builder()
      .scheme("orbit")
      .authority("assistant")
      .appendQueryParameter("source", "call-ended")
    if (!phoneNumber.isNullOrBlank()) {
      builder.appendQueryParameter("phone", phoneNumber)
    }
    val deepLink = builder.build()

    return Intent(Intent.ACTION_VIEW, deepLink, context, MainActivity::class.java)
      .addFlags(
        Intent.FLAG_ACTIVITY_NEW_TASK or
          Intent.FLAG_ACTIVITY_SINGLE_TOP or
          Intent.FLAG_ACTIVITY_CLEAR_TOP
      )
  }

  private fun createDeepLinkIntent(context: Context, phoneNumber: String?, phase: String): Intent {
    val builder = Uri.Builder()
      .scheme("orbit")
      .authority("incoming-call")
      .appendQueryParameter("phase", phase)
    if (!phoneNumber.isNullOrBlank()) {
      builder.appendQueryParameter("phone", phoneNumber)
    }
    val deepLink = builder.build()

    return Intent(Intent.ACTION_VIEW, deepLink, context, MainActivity::class.java)
      .addFlags(
        Intent.FLAG_ACTIVITY_NEW_TASK or
          Intent.FLAG_ACTIVITY_SINGLE_TOP or
          Intent.FLAG_ACTIVITY_CLEAR_TOP
      )
  }

  private fun persistLastNumber(context: Context, phoneNumber: String?) {
    val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    prefs.edit().putString(KEY_LAST_NUMBER, phoneNumber).apply()
  }

  private fun getLastNumber(context: Context): String? {
    val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    return prefs.getString(KEY_LAST_NUMBER, null)
  }

  private fun clearLastNumber(context: Context) {
    val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    prefs.edit().remove(KEY_LAST_NUMBER).apply()
  }

  private fun sanitizePhoneNumber(phoneNumber: String?): String? {
    return phoneNumber?.trim()?.takeIf { it.isNotEmpty() }
  }

  private fun isDeviceUnlocked(context: Context): Boolean {
    val keyguardManager = context.getSystemService(Context.KEYGUARD_SERVICE) as? KeyguardManager
    return keyguardManager?.isKeyguardLocked == false
  }

  private fun isAppInForeground(context: Context): Boolean {
    val activityManager = context.getSystemService(Context.ACTIVITY_SERVICE) as? ActivityManager
    val appProcesses = activityManager?.runningAppProcesses ?: return false
    return appProcesses.any {
      it.processName == context.packageName &&
        it.importance == ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND
    }
  }

  private fun ensureNotificationChannels(manager: NotificationManager) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
      return
    }

    val incoming = NotificationChannel(
      CHANNEL_INCOMING,
      "Incoming calls",
      NotificationManager.IMPORTANCE_HIGH
    )
    val ended = NotificationChannel(
      CHANNEL_ENDED,
      "Call follow-up",
      NotificationManager.IMPORTANCE_DEFAULT
    )

    manager.createNotificationChannel(incoming)
    manager.createNotificationChannel(ended)
  }

  private fun cancelIncomingNotification(context: Context) {
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    manager.cancel(NOTIFICATION_ID_INCOMING)
  }

  private fun pendingIntentFlags(): Int {
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    } else {
      PendingIntent.FLAG_UPDATE_CURRENT
    }
  }

  companion object {
    private const val PREFS_NAME = "orbit_call_state"
    private const val KEY_LAST_NUMBER = "last_number"

    private const val CHANNEL_INCOMING = "incoming_calls"
    private const val CHANNEL_ENDED = "call_ended"

    private const val NOTIFICATION_ID_INCOMING = 23001
    private const val NOTIFICATION_ID_ENDED = 23002
    private const val REQUEST_CODE_INCOMING = 33001
    private const val REQUEST_CODE_ENDED = 33002
  }
}
