class NotificationItem {
  final String recipientId;
  final String notificationId;
  final String title;
  final String body;
  final String? imageUrl;
  final String? deepLink;
  final bool isRead;
  final DateTime createdAt;

  NotificationItem({
    required this.recipientId,
    required this.notificationId,
    required this.title,
    required this.body,
    this.imageUrl,
    this.deepLink,
    required this.isRead,
    required this.createdAt,
  });

  factory NotificationItem.fromJson(Map<String, dynamic> json) => NotificationItem(
        recipientId: json['recipient_id'] ?? '',
        notificationId: json['notification_id'] ?? '',
        title: json['title'] ?? '',
        body: json['body'] ?? '',
        imageUrl: json['image_url'],
        deepLink: json['deep_link'],
        isRead: json['is_read'] ?? false,
        createdAt: DateTime.tryParse(json['created_at'] ?? '') ?? DateTime.now(),
      );
}

class NotificationListResponse {
  final List<NotificationItem> notifications;
  final int total;

  NotificationListResponse({required this.notifications, required this.total});

  factory NotificationListResponse.fromJson(Map<String, dynamic> json) =>
      NotificationListResponse(
        notifications: (json['notifications'] as List<dynamic>? ?? [])
            .map((e) => NotificationItem.fromJson(e))
            .toList(),
        total: json['total'] ?? 0,
      );
}
