class Payment {
  final String id;
  final String userId;
  final double amount;
  final String screenshotUrl;
  final String status; // pending, verified, rejected
  final String? rejectionReason;
  final DateTime createdAt;
  final DateTime? verifiedAt;
  final String? userName;
  final String? userPhone;

  Payment({
    required this.id,
    required this.userId,
    required this.amount,
    required this.screenshotUrl,
    required this.status,
    this.rejectionReason,
    required this.createdAt,
    this.verifiedAt,
    this.userName,
    this.userPhone,
  });

  factory Payment.fromJson(Map<String, dynamic> json) => Payment(
        id: json['id'] ?? '',
        userId: json['user_id'] ?? '',
        amount: (json['amount'] as num?)?.toDouble() ?? 0,
        screenshotUrl: json['screenshot_url'] ?? '',
        status: json['status'] ?? 'pending',
        rejectionReason: json['rejection_reason'],
        createdAt: DateTime.tryParse(json['created_at'] ?? '') ?? DateTime.now(),
        verifiedAt: json['verified_at'] != null ? DateTime.tryParse(json['verified_at']) : null,
        userName: json['user_name'],
        userPhone: json['user_phone'],
      );
}
