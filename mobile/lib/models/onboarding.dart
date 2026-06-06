class OnboardingStatus {
  final int onboardingStep; // 1=Account, 2=License Pending, 3=GST Pending, 4=All Verified
  final List<CustomerDocument> documents;
  final bool isFullyVerified;

  OnboardingStatus({
    required this.onboardingStep,
    required this.documents,
    required this.isFullyVerified,
  });

  factory OnboardingStatus.fromJson(Map<String, dynamic> json) {
    return OnboardingStatus(
      onboardingStep: json['onboarding_step'] ?? 1,
      documents: (json['documents'] as List?)?.map((d) => CustomerDocument.fromJson(d)).toList() ?? [],
      isFullyVerified: json['is_fully_verified'] ?? false,
    );
  }
}

class CustomerDocument {
  final String id;
  final String docType; // LICENSE or GST
  final String? docNumber;
  final DateTime? expiryDate;
  final String? photoUrl;
  final bool isVerified;
  final String? rejectionReason;
  final DateTime createdAt;

  CustomerDocument({
    required this.id,
    required this.docType,
    this.docNumber,
    this.expiryDate,
    this.photoUrl,
    required this.isVerified,
    this.rejectionReason,
    required this.createdAt,
  });

  factory CustomerDocument.fromJson(Map<String, dynamic> json) {
    return CustomerDocument(
      id: json['id'] ?? '',
      docType: json['doc_type'] ?? '',
      docNumber: json['doc_number'],
      expiryDate: json['expiry_date'] != null ? DateTime.parse(json['expiry_date']) : null,
      photoUrl: json['photo_url'],
      isVerified: json['is_verified'] ?? false,
      rejectionReason: json['rejection_reason'],
      createdAt: DateTime.parse(json['created_at'] ?? DateTime.now().toIso8601String()),
    );
  }
}
