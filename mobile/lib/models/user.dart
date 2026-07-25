class User {
  final String id;
  final String phoneNumber;
  final String? username;
  final String role;
  final String customerType;
  final List<String> permissions;

  User({
    required this.id,
    required this.phoneNumber,
    this.username,
    required this.role,
    this.customerType = 'normal',
    this.permissions = const [],
  });

  factory User.fromJson(Map<String, dynamic> json) => User(
        id: json['id'] ?? '',
        phoneNumber: json['phone_number'] ?? '',
        username: json['username'],
        role: json['role'] ?? 'partner',
        customerType: json['customer_type'] ?? 'normal',
        permissions: List<String>.from(json['permissions'] ?? []),
      );

  String get displayName => username ?? phoneNumber;

  bool get isSpecial => customerType == 'special';

  Map<String, dynamic> toJson() => {
        'id': id,
        'phone_number': phoneNumber,
        'username': username,
        'role': role,
        'customer_type': customerType,
        'permissions': permissions,
      };
}
