import '../config/api.dart';
import '../models/notification_item.dart';
import 'app_update.dart';

class NotificationService {
  final _dio = createDio();

  Future<NotificationListResponse> getNotifications({int page = 1, int limit = 20}) async {
    final res = await _dio.get('/notifications', queryParameters: {
      'page': page,
      'limit': limit,
    });
    return NotificationListResponse.fromJson(res.data);
  }

  Future<void> markAsRead(String recipientId) async {
    await _dio.put('/notifications/$recipientId/read');
  }

  // Called once a real FCM token is available (requires firebase_messaging +
  // platform config files, not yet set up). Kept ready so wiring it in later
  // is a one-line call from wherever the token is obtained.
  Future<void> registerDeviceToken(String token, {String platform = 'android'}) async {
    // which app and build this phone runs, for the website's App Versions
    // page (and to reach phones on old builds)
    final build = await AppBuildInfo.build();
    await _dio.post('/device-tokens', data: {
      'token': token,
      'platform': AppBuildInfo.platform,
      'app': AppBuildInfo.app,
      if (build > 0) 'app_build': build,
    });
  }
}
