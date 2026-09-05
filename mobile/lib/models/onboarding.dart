class OnboardingStatus {
  final int onboardingStep; // 1=Account, 2=License Pending, 3=GST Pending, 4=All Verified
  final List<PartnerDocument> documents;
  final bool isFullyVerified;

  OnboardingStatus({
    required this.onboardingStep,
    required this.documents,
    required this.isFullyVerified,
  });

  factory OnboardingStatus.fromJson(Map<String, dynamic> json) {
    return OnboardingStatus(
      onboardingStep: json['onboarding_step'] ?? 1,
      documents: (json['documents'] as List?)?.map((d) => PartnerDocument.fromJson(d)).toList() ?? [],
      isFullyVerified: json['is_fully_verified'] ?? false,
    );
  }
}

class PartnerDocument {
  final String id;
  final String docType; // LICENSE (legacy) / LICENSE_20B / LICENSE_21B / GST
  final String? docNumber;
  final DateTime? expiryDate;
  final String? photoUrl;
  final bool isVerified;
  final String? rejectionReason;
  final DateTime createdAt;

  // Discrete fields pulled from the GST/drug-license government scrapers.
  // Which ones are populated depends on docType — GST rows fill
  // legalName/tradeName/businessType/registeredDate; license rows fill
  // legalName (institute name)/firstIssueDate/techPersonName/techPersonRegNo.
  // status/address apply to both.
  final String? legalName;
  final String? tradeName;
  final String? status;
  final String? businessType;
  final DateTime? registeredDate;
  final DateTime? firstIssueDate;
  final String? address;
  final String? techPersonName;
  final String? techPersonRegNo;

  PartnerDocument({
    required this.id,
    required this.docType,
    this.docNumber,
    this.expiryDate,
    this.photoUrl,
    required this.isVerified,
    this.rejectionReason,
    required this.createdAt,
    this.legalName,
    this.tradeName,
    this.status,
    this.businessType,
    this.registeredDate,
    this.firstIssueDate,
    this.address,
    this.techPersonName,
    this.techPersonRegNo,
  });

  factory PartnerDocument.fromJson(Map<String, dynamic> json) {
    DateTime? parseDate(dynamic v) => v != null ? DateTime.tryParse(v) : null;
    return PartnerDocument(
      id: json['id'] ?? '',
      docType: json['doc_type'] ?? '',
      docNumber: json['doc_number'],
      expiryDate: parseDate(json['expiry_date']),
      photoUrl: json['photo_url'],
      isVerified: json['is_verified'] ?? false,
      rejectionReason: json['rejection_reason'],
      createdAt: DateTime.parse(json['created_at'] ?? DateTime.now().toIso8601String()),
      legalName: json['legal_name'],
      tradeName: json['trade_name'],
      status: json['status'],
      businessType: json['business_type'],
      registeredDate: parseDate(json['registered_date']),
      firstIssueDate: parseDate(json['first_issue_date']),
      address: json['address'],
      techPersonName: json['tech_person_name'],
      techPersonRegNo: json['tech_person_reg_no'],
    );
  }
}
