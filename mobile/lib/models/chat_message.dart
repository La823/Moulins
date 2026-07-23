class ChatMessage {
  final String id;
  final String senderId;
  final String? receiverId;
  final String? conversationId;
  final String? senderName;
  final String? senderRole;
  final String body;
  final DateTime createdAt;
  final DateTime? readAt;

  ChatMessage({
    required this.id,
    required this.senderId,
    this.receiverId,
    this.conversationId,
    this.senderName,
    this.senderRole,
    required this.body,
    required this.createdAt,
    this.readAt,
  });

  factory ChatMessage.fromJson(Map<String, dynamic> json) => ChatMessage(
        id: json['id'] ?? '',
        senderId: json['sender_id'] ?? '',
        receiverId: json['receiver_id'],
        conversationId: json['conversation_id'],
        senderName: json['sender_name'],
        senderRole: json['sender_role'],
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

class ChatParticipant {
  final String id;
  final String? username;
  final String phoneNumber;
  final String role;

  ChatParticipant({
    required this.id,
    this.username,
    required this.phoneNumber,
    required this.role,
  });

  String get displayName => username ?? phoneNumber;

  factory ChatParticipant.fromJson(Map<String, dynamic> json) => ChatParticipant(
        id: json['id'] ?? '',
        username: json['username'],
        phoneNumber: json['phone_number'] ?? '',
        role: json['role'] ?? '',
      );
}

// A conversation is either a legacy "direct" 1:1 chat (admin<->employee,
// admin<->admin) keyed by the other user's id, or a "thread" — a group
// conversation (customer + assigned employee + admin) keyed by its own
// conversation id and carrying the full participant list.
class ChatConversation {
  final String type; // "direct" | "thread"
  final String id;
  final String? username;
  final String phoneNumber;
  final String role;
  final List<ChatParticipant> participants;
  final String lastMessage;
  final DateTime lastMessageAt;
  final int unreadCount;

  ChatConversation({
    required this.type,
    required this.id,
    this.username,
    required this.phoneNumber,
    required this.role,
    required this.participants,
    required this.lastMessage,
    required this.lastMessageAt,
    required this.unreadCount,
  });

  bool get isThread => type == 'thread';

  String get displayName {
    if (isThread) {
      if (participants.isEmpty) return 'Care Team';
      return participants
          .map((p) => p.role == 'employee' ? '${p.displayName} (Employee)' : p.displayName)
          .join(' · ');
    }
    return username ?? phoneNumber;
  }

  factory ChatConversation.fromJson(Map<String, dynamic> json) => ChatConversation(
        type: json['type'] ?? 'direct',
        id: json['id'] ?? '',
        username: json['username'],
        phoneNumber: json['phone_number'] ?? '',
        role: json['role'] ?? '',
        participants: (json['participants'] as List<dynamic>?)
                ?.map((e) => ChatParticipant.fromJson(e))
                .toList() ??
            [],
        lastMessage: json['last_message'] ?? '',
        lastMessageAt: DateTime.tryParse(json['last_message_at'] ?? '')?.toLocal() ?? DateTime.now(),
        unreadCount: json['unread_count'] ?? 0,
      );
}
