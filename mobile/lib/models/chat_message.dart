class ChatMessage {
  final String id;
  final String senderId;
  final String receiverId;
  final String body;
  final DateTime createdAt;
  final DateTime? readAt;

  ChatMessage({
    required this.id,
    required this.senderId,
    required this.receiverId,
    required this.body,
    required this.createdAt,
    this.readAt,
  });

  factory ChatMessage.fromJson(Map<String, dynamic> json) => ChatMessage(
        id: json['id'] ?? '',
        senderId: json['sender_id'] ?? '',
        receiverId: json['receiver_id'] ?? '',
        body: json['body'] ?? '',
        createdAt: DateTime.tryParse(json['created_at'] ?? '')?.toLocal() ?? DateTime.now(),
        readAt: json['read_at'] != null ? DateTime.tryParse(json['read_at'])?.toLocal() : null,
      );
}

class ChatContact {
  final String id;
  final String? username;
  final String phoneNumber;
  final String role;

  ChatContact({
    required this.id,
    this.username,
    required this.phoneNumber,
    required this.role,
  });

  String get displayName => username ?? phoneNumber;

  factory ChatContact.fromJson(Map<String, dynamic> json) => ChatContact(
        id: json['id'] ?? json['user_id'] ?? '',
        username: json['username'],
        phoneNumber: json['phone_number'] ?? '',
        role: json['role'] ?? '',
      );
}

class ChatConversation {
  final String userId;
  final String? username;
  final String phoneNumber;
  final String role;
  final String lastMessage;
  final DateTime lastMessageAt;
  final int unreadCount;

  ChatConversation({
    required this.userId,
    this.username,
    required this.phoneNumber,
    required this.role,
    required this.lastMessage,
    required this.lastMessageAt,
    required this.unreadCount,
  });

  String get displayName => username ?? phoneNumber;

  factory ChatConversation.fromJson(Map<String, dynamic> json) => ChatConversation(
        userId: json['user_id'] ?? '',
        username: json['username'],
        phoneNumber: json['phone_number'] ?? '',
        role: json['role'] ?? '',
        lastMessage: json['last_message'] ?? '',
        lastMessageAt: DateTime.tryParse(json['last_message_at'] ?? '')?.toLocal() ?? DateTime.now(),
        unreadCount: json['unread_count'] ?? 0,
      );
}
