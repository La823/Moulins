import '../config/api.dart';
import '../models/notification_item.dart';

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
    await _dio.post('/device-tokens', data: {
      'token': token,
      'platform': platform,
    });
  }
}
