class BroadcastListMember {
  final String id;
  final String username;
  final String phoneNumber;

  BroadcastListMember({required this.id, required this.username, required this.phoneNumber});

  factory BroadcastListMember.fromJson(Map<String, dynamic> json) => BroadcastListMember(
        id: json['id'] ?? '',
        username: json['username'] ?? '',
        phoneNumber: json['phone_number'] ?? '',
      );
}

class BroadcastList {
  final String id;
  final String name;
  final int memberCount;
  final String createdAt;

  BroadcastList({
    required this.id,
    required this.name,
    required this.memberCount,
    required this.createdAt,
  });

  factory BroadcastList.fromJson(Map<String, dynamic> json) => BroadcastList(
        id: json['id'] ?? '',
        name: json['name'] ?? '',
        memberCount: json['member_count'] ?? 0,
        createdAt: json['created_at'] is String
            ? json['created_at']
            : json['created_at']?.toString() ?? '',
      );
}
