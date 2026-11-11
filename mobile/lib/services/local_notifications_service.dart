import 'dart:ui';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:http/http.dart' as http;
import 'notification_links.dart';

/// Shows a system-tray-style banner for FCM messages that arrive while the
/// app is in the foreground (Android only auto-shows these when the app is
/// backgrounded/closed — foreground messages are silent unless we display
/// them ourselves).
///
/// Pushes come on one of three channels (the server names it in the push and
/// in its data as `channel`, see utils/fcm.go). On Android 8+ the channel
/// decides the sound, and people can change each one in the phone's settings.
class LocalNotificationsService {
  static final _plugin = FlutterLocalNotificationsPlugin();
  static bool _initialized = false;

  static const _channel = AndroidNotificationChannel(
    'broadcast_channel',
    'Broadcasts',
    description: 'Announcements from Moulins',
    importance: Importance.high,
  );

  // Reminders before a meeting, with the phone's default sound.
  static const _meetingChannel = AndroidNotificationChannel(
    'meeting_reminders',
    'Meeting reminders',
    description: 'Reminders before your meetings with doctors',
    importance: Importance.high,
  );

  // New orders (staff), with the order sound in res/raw/order.mp3.
  static const _orderChannel = AndroidNotificationChannel(
    'order_alerts',
    'New orders',
    description: 'When a new order is placed',
    importance: Importance.high,
    sound: RawResourceAndroidNotificationSound('order'),
    playSound: true,
  );

  static const _channels = [_channel, _meetingChannel, _orderChannel];

  static Future<void> init() async {
    if (_initialized) return;
    _initialized = true;

    const androidInit = AndroidInitializationSettings('@mipmap/ic_launcher');
    // tapping a banner shown while the app was open opens its page
    await _plugin.initialize(
      const InitializationSettings(android: androidInit),
      onDidReceiveNotificationResponse: (r) => NotificationLinks.open(r.payload),
    );

    final android = _plugin.resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>();
    for (final c in _channels) {
      await android?.createNotificationChannel(c);
    }
  }

  /// [channelId] is the push's channel; an unknown or missing one shows on
  /// Broadcasts, as before.
  static Future<void> show({
    required String title,
    required String body,
    String? imageUrl,
    String? notificationId,
    String? channelId,
    String? deepLink, // where tapping it goes (notification_links.dart)
  }) async {
    final channel = _channels.firstWhere((c) => c.id == channelId, orElse: () => _channel);

    StyleInformation styleInformation = BigTextStyleInformation(
      body,
      contentTitle: title,
    );

    if (imageUrl != null && imageUrl.isNotEmpty) {
      try {
        final res = await http.get(Uri.parse(imageUrl)).timeout(const Duration(seconds: 5));
        if (res.statusCode == 200) {
          styleInformation = BigPictureStyleInformation(
            ByteArrayAndroidBitmap(res.bodyBytes),
            contentTitle: title,
            summaryText: body,
          );
        }
      } catch (_) {
        // Fall back to the plain text style below if the image can't be fetched.
      }
    }

    // Deriving the local notification id from the server's notification_id
    // (instead of the current timestamp) means a redelivered FCM message for
    // the same notification replaces the existing banner rather than
    // stacking a duplicate one.
    final id = notificationId != null
        ? notificationId.hashCode & 0x7fffffff
        : DateTime.now().millisecondsSinceEpoch ~/ 1000;

    await _plugin.show(
      id,
      title,
      body,
      NotificationDetails(
        android: AndroidNotificationDetails(
          channel.id,
          channel.name,
          channelDescription: channel.description,
          importance: Importance.high,
          priority: Priority.high,
          sound: channel.sound,
          styleInformation: styleInformation,
          color: const Color(0xFF00A6A4),
        ),
      ),
      payload: deepLink,
    );
  }
}
