class User {
  final String id;
  final String phoneNumber;
  final String? username;
  final String role;
  final String customerType;
  final List<String> permissions;
  final String defaultTransportMode;
  final String? billingAddress;
  final String? shippingAddress;

  User({
    required this.id,
    required this.phoneNumber,
    this.username,
    required this.role,
    this.customerType = 'normal',
    this.permissions = const [],
    this.defaultTransportMode = 'courier',
    this.billingAddress,
    this.shippingAddress,
  });

  factory User.fromJson(Map<String, dynamic> json) => User(
        id: json['id'] ?? '',
        phoneNumber: json['phone_number'] ?? '',
        username: json['username'],
        role: json['role'] ?? 'partner',
        customerType: json['customer_type'] ?? 'normal',
        permissions: List<String>.from(json['permissions'] ?? []),
        defaultTransportMode: json['default_transport_mode'] ?? 'courier',
        billingAddress: json['billing_address'],
        shippingAddress: json['shipping_address'],
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
        'default_transport_mode': defaultTransportMode,
        'billing_address': billingAddress,
        'shipping_address': shippingAddress,
      };
}
