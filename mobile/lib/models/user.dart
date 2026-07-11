class User {
  final String id;
  final String phoneNumber;
  final String? username;
  final String role;
  final List<String> permissions;

  User({
    required this.id,
    required this.phoneNumber,
    this.username,
    required this.role,
    this.permissions = const [],
  });

  factory User.fromJson(Map<String, dynamic> json) => User(
        id: json['id'] ?? '',
        phoneNumber: json['phone_number'] ?? '',
        username: json['username'],
        role: json['role'] ?? 'customer',
        permissions: List<String>.from(json['permissions'] ?? []),
      );

  String get displayName => username ?? phoneNumber;

  Map<String, dynamic> toJson() => {
        'id': id,
        'phone_number': phoneNumber,
        'username': username,
        'role': role,
        'permissions': permissions,
      };
}
