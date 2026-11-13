/// What a partner allows one of their team members (server: migration 184,
/// sent as team_settings on /auth/me). Null for everyone else.
class TeamSettings {
  final bool canAddDoctors;
  final bool canAddRetailers;
  final bool orderToPartner;
  final bool orderToMoulins;

  const TeamSettings({
    this.canAddDoctors = true,
    this.canAddRetailers = false,
    this.orderToPartner = true,
    this.orderToMoulins = false,
  });

  factory TeamSettings.fromJson(Map<String, dynamic> json) => TeamSettings(
        canAddDoctors: json['can_add_doctors'] == true,
        canAddRetailers: json['can_add_retailers'] == true,
        orderToPartner: json['order_to_partner'] == true,
        orderToMoulins: json['order_to_moulins'] == true,
      );

  Map<String, dynamic> toJson() => {
        'can_add_doctors': canAddDoctors,
        'can_add_retailers': canAddRetailers,
        'order_to_partner': orderToPartner,
        'order_to_moulins': orderToMoulins,
      };
}

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
  final TeamSettings? teamSettings;

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
    this.teamSettings,
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
        teamSettings: json['team_settings'] is Map<String, dynamic>
            ? TeamSettings.fromJson(json['team_settings'] as Map<String, dynamic>)
            : null,
      );

  String get displayName => username ?? phoneNumber;

  bool get isSpecial => customerType == 'special';

  /// Retailers and doctors order from their partner (MRP only, single
  /// packs), not from Moulins.
  bool get buysFromPartner => role == 'retailer' || role == 'doctor';

  bool get isTeamMember => role == 'team_member';

  TeamSettings get _team => teamSettings ?? const TeamSettings();

  /// May send orders to a partner: retailers and doctors always; a team
  /// member when their partner allows it.
  bool get ordersToPartner => buysFromPartner || (isTeamMember && _team.orderToPartner);

  /// May order from Moulins directly: a team member only when their partner
  /// allows it; retailers and doctors never.
  bool get ordersToMoulins => isTeamMember ? _team.orderToMoulins : !buysFromPartner;

  /// Has their own orders to a partner to follow (rather than a partner's
  /// incoming ones) — kept for a team member even after the partner turns
  /// ordering to them off, so past orders stay visible.
  bool get hasOrdersToPartner => buysFromPartner || isTeamMember;

  bool get canAddDoctors => !isTeamMember || _team.canAddDoctors;
  bool get canAddRetailers => role == 'partner' || (isTeamMember && _team.canAddRetailers);

  /// Whether this user may use an area of the admin side, e.g.
  /// can('notifications'). Admins can use everything. Employees are given
  /// per-action permissions (notifications_view, notifications_edit, ... —
  /// since backend migration 085), so any of an area's permissions counts;
  /// the old single name is still accepted.
  bool can(String area) =>
      role == 'admin' || permissions.any((p) => p == area || p.startsWith('${area}_'));

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
        if (teamSettings != null) 'team_settings': teamSettings!.toJson(),
      };
}
