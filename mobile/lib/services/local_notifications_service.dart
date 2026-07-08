import 'dart:ui';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:http/http.dart' as http;

/// Shows a system-tray-style banner for FCM messages that arrive while the
/// app is in the foreground (Android only auto-shows these when the app is
/// backgrounded/closed — foreground messages are silent unless we display
/// them ourselves).
class LocalNotificationsService {
  static final _plugin = FlutterLocalNotificationsPlugin();
  static bool _initialized = false;

  static const _channel = AndroidNotificationChannel(
    'broadcast_channel',
    'Broadcasts',
    description: 'Announcements from Moulins',
    importance: Importance.high,
  );

  static Future<void> init() async {
    if (_initialized) return;
    _initialized = true;

    const androidInit = AndroidInitializationSettings('@mipmap/ic_launcher');
    await _plugin.initialize(const InitializationSettings(android: androidInit));

    await _plugin
        .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()
        ?.createNotificationChannel(_channel);
  }

  static Future<void> show({required String title, required String body, String? imageUrl}) async {
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

    await _plugin.show(
      DateTime.now().millisecondsSinceEpoch ~/ 1000,
      title,
      body,
      NotificationDetails(
        android: AndroidNotificationDetails(
          _channel.id,
          _channel.name,
          channelDescription: _channel.description,
          importance: Importance.high,
          priority: Priority.high,
          styleInformation: styleInformation,
          color: const Color(0xFF00A6A4),
        ),
      ),
    );
  }
}
