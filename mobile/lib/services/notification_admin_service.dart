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

/// One person an automatic alert went to.
class AutoAlertRecipient {
  final String username;
  final String role;
  final bool isRead;
  final int pushDelivered;

  AutoAlertRecipient({required this.username, required this.role, required this.isRead, required this.pushDelivered});

  factory AutoAlertRecipient.fromJson(Map<String, dynamic> json) => AutoAlertRecipient(
        username: json['username'] ?? '',
        role: json['role'] ?? '',
        isRead: json['is_read'] == true,
        pushDelivered: json['push_delivered'] ?? 0,
      );
}

/// An alert the system sent by itself (new order, official updates,
/// reminders...), shown once with everyone it went to — the server keeps a
/// row per person and groups them (GET /admin/notifications/auto).
class AutoAlertGroup {
  final String title;
  final String body;
  final String? sentAt;
  final int recipientCount;
  final int readCount;
  final int pushSuccessCount;
  final int pushFailureCount;
  final List<AutoAlertRecipient> recipients;

  AutoAlertGroup({
    required this.title,
    required this.body,
    this.sentAt,
    required this.recipientCount,
    required this.readCount,
    required this.pushSuccessCount,
    required this.pushFailureCount,
    required this.recipients,
  });

  factory AutoAlertGroup.fromJson(Map<String, dynamic> json) => AutoAlertGroup(
        title: json['title'] ?? '',
        body: json['body'] ?? '',
        sentAt: json['sent_at'],
        recipientCount: json['recipient_count'] ?? 0,
        readCount: json['read_count'] ?? 0,
        pushSuccessCount: json['push_success_count'] ?? 0,
        pushFailureCount: json['push_failure_count'] ?? 0,
        recipients: (json['recipients'] as List<dynamic>? ?? [])
            .map((e) => AutoAlertRecipient.fromJson(e as Map<String, dynamic>))
            .toList(),
      );
}

class NotificationAdminService {
  final _dio = createDio();

  /// Sent notifications, newest first. kind 'manual' = broadcasts a person
  /// composed; 'auto' = the system's own alerts; null = everything.
  Future<List<NotificationHistoryItem>> getHistory({int limit = 20, String? kind}) async {
    final res = await _dio.get('/admin/notifications', queryParameters: {
      'limit': limit,
      if (kind != null) 'kind': kind,
    });
    final list = res.data['notifications'] as List<dynamic>? ?? [];
    return list.map((e) => NotificationHistoryItem.fromJson(e)).toList();
  }

  Future<List<AutoAlertGroup>> getAutoAlerts({int limit = 30}) async {
    final res = await _dio.get('/admin/notifications/auto', queryParameters: {'limit': limit});
    final list = res.data['alerts'] as List<dynamic>? ?? [];
    return list.map((e) => AutoAlertGroup.fromJson(e as Map<String, dynamic>)).toList();
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
