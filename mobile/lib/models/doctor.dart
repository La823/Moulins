class Doctor {
  final String id;
  final String name;
  final String? phone;
  final String? clinicName;
  final DateTime? lastMeetingAt;
  final String? lastMeetingNotes;

  Doctor({
    required this.id,
    required this.name,
    this.phone,
    this.clinicName,
    this.lastMeetingAt,
    this.lastMeetingNotes,
  });

  factory Doctor.fromJson(Map<String, dynamic> json) => Doctor(
        id: json['id'] ?? '',
        name: json['name'] ?? '',
        phone: json['phone'],
        clinicName: json['clinic_name'],
        lastMeetingAt: json['last_meeting_at'] != null ? DateTime.tryParse(json['last_meeting_at'])?.toLocal() : null,
        lastMeetingNotes: json['last_meeting_notes'],
      );
}

class DoctorProduct {
  final String productId;
  final String productName;
  final String? imageUrl;

  DoctorProduct({
    required this.productId,
    required this.productName,
    this.imageUrl,
  });

  factory DoctorProduct.fromJson(Map<String, dynamic> json) => DoctorProduct(
        productId: json['product_id'] ?? '',
        productName: json['product_name'] ?? '',
        imageUrl: json['image_url'],
      );
}
