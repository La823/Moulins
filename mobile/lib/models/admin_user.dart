class PartnerDocument {
  final String id;
  final String docType;
  final String? docNumber;
  final String? expiryDate;
  final String? photoUrl;
  final bool isVerified;
  final String? rejectionReason;

  PartnerDocument({
    required this.id,
    required this.docType,
    this.docNumber,
    this.expiryDate,
    this.photoUrl,
    required this.isVerified,
    this.rejectionReason,
  });

  factory PartnerDocument.fromJson(Map<String, dynamic> json) => PartnerDocument(
        id: json['id'] ?? '',
        docType: json['doc_type'] ?? '',
        docNumber: json['doc_number'],
        expiryDate: json['expiry_date'],
        photoUrl: json['photo_url'],
        isVerified: json['is_verified'] ?? false,
        rejectionReason: json['rejection_reason'],
      );
}

class AdminOrderSummary {
  final String id;
  final String createdAt;
  final String status;
  final int itemCount;
  final String? notes;

  AdminOrderSummary({
    required this.id,
    required this.createdAt,
    required this.status,
    required this.itemCount,
    this.notes,
  });

  factory AdminOrderSummary.fromJson(Map<String, dynamic> json) => AdminOrderSummary(
        id: json['id'] ?? '',
        createdAt: json['created_at'] ?? '',
        status: json['status'] ?? 'pending',
        itemCount: json['item_count'] ?? 0,
        notes: json['notes'],
      );
}

class AdminPartner {
  final String id;
  final String? username;
  final String phoneNumber;
  final String? email;
  final String role;
  final String createdAt;
  final String? lastLoginAt;
  final int onboardingStep;
  final String? plainPassword;
  final List<AdminOrderSummary> orders;
  final List<PartnerDocument> documents;

  AdminPartner({
    required this.id,
    this.username,
    required this.phoneNumber,
    this.email,
    required this.role,
    required this.createdAt,
    this.lastLoginAt,
    required this.onboardingStep,
    this.plainPassword,
    this.orders = const [],
    this.documents = const [],
  });

  String get displayName => username ?? phoneNumber;

  factory AdminPartner.fromJson(Map<String, dynamic> json) => AdminPartner(
        id: json['id'] ?? '',
        username: json['username'],
        phoneNumber: json['phone_number'] ?? '',
        email: json['email'],
        role: json['role'] ?? 'partner',
        createdAt: json['created_at'] ?? '',
        lastLoginAt: json['last_login_at'],
        onboardingStep: json['onboarding_step'] ?? 1,
        plainPassword: json['plain_password'],
        orders: (json['orders'] as List<dynamic>? ?? []).map((e) => AdminOrderSummary.fromJson(e)).toList(),
        documents: (json['documents'] as List<dynamic>? ?? []).map((e) => PartnerDocument.fromJson(e)).toList(),
      );
}

class PermissionDef {
  final String key;
  final String label;
  final String desc;

  PermissionDef({required this.key, required this.label, required this.desc});

  factory PermissionDef.fromJson(Map<String, dynamic> json) => PermissionDef(
        key: json['key'] ?? '',
        label: json['label'] ?? '',
        desc: json['desc'] ?? '',
      );
}

class AdminEmployee {
  final String id;
  final String? username;
  final String phoneNumber;
  final String? email;
  final String role;
  final String createdAt;
  final String? lastLoginAt;
  final String? plainPassword;
  final List<String> permissions;

  AdminEmployee({
    required this.id,
    this.username,
    required this.phoneNumber,
    this.email,
    required this.role,
    required this.createdAt,
    this.lastLoginAt,
    this.plainPassword,
    this.permissions = const [],
  });

  String get displayName => username ?? phoneNumber;

  factory AdminEmployee.fromJson(Map<String, dynamic> json) => AdminEmployee(
        id: json['id'] ?? '',
        username: json['username'],
        phoneNumber: json['phone_number'] ?? '',
        email: json['email'],
        role: json['role'] ?? 'employee',
        createdAt: json['created_at'] ?? '',
        lastLoginAt: json['last_login_at'],
        plainPassword: json['plain_password'],
        permissions: List<String>.from(json['permissions'] ?? []),
      );
}
