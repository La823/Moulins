import '../config/api.dart';

class NotificationHistoryItem {
  final String id;
  final String title;
  final String body;
  final String status;
  final int recipientCount;
  final int pushSuccessCount;
  final int pushFailureCount;
  final String? createdByName;
  final String? createdByRole;
  final String? sentAt;

  NotificationHistoryItem({
    required this.id,
    required this.title,
    required this.body,
    required this.status,
    required this.recipientCount,
    required this.pushSuccessCount,
    required this.pushFailureCount,
    this.createdByName,
    this.createdByRole,
    this.sentAt,
  });

  factory NotificationHistoryItem.fromJson(Map<String, dynamic> json) => NotificationHistoryItem(
        id: json['id'] ?? '',
        title: json['title'] ?? '',
        body: json['body'] ?? '',
        status: json['status'] ?? '',
        recipientCount: json['recipient_count'] ?? 0,
        pushSuccessCount: json['push_success_count'] ?? 0,
        pushFailureCount: json['push_failure_count'] ?? 0,
        createdByName: json['created_by_name'],
        createdByRole: json['created_by_role'],
        sentAt: json['sent_at'],
      );
}

class NotificationAdminService {
  final _dio = createDio();

  Future<List<NotificationHistoryItem>> getHistory({int limit = 20}) async {
    final res = await _dio.get('/admin/notifications', queryParameters: {'limit': limit});
    final list = res.data['notifications'] as List<dynamic>? ?? [];
    return list.map((e) => NotificationHistoryItem.fromJson(e)).toList();
  }

  Future<Map<String, String>> getUploadUrl(String filename) async {
    final res = await _dio.post('/admin/notifications/upload-url', data: {'filename': filename});
    return {'upload_url': res.data['upload_url'], 'key': res.data['key']};
  }

  Future<Map<String, dynamic>> send({
    required String title,
    required String body,
    String? deepLink,
    String? imageKey,
    String? broadcastListId,
    List<String> excludeUserIds = const [],
  }) async {
    final res = await _dio.post('/admin/notifications', data: {
      'title': title,
      'body': body,
      'deep_link': deepLink,
      'image_key': imageKey,
      'broadcast_list_id': broadcastListId,
      'exclude_user_ids': excludeUserIds,
    });
    return res.data;
  }
}
