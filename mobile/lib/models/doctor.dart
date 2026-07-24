class Doctor {
  final String id;
  final String name;
  final String? phone;
  final String? clinicName;
  final String? clinicAddress;
  final double? latitude;
  final double? longitude;
  final DateTime? dob;
  final DateTime? lastMeetingAt;
  final String? lastMeetingNotes;
  final String? ownerName;
  final String? ownerPhone;

  Doctor({
    required this.id,
    required this.name,
    this.phone,
    this.clinicName,
    this.clinicAddress,
    this.latitude,
    this.longitude,
    this.dob,
    this.lastMeetingAt,
    this.lastMeetingNotes,
    this.ownerName,
    this.ownerPhone,
  });

  factory Doctor.fromJson(Map<String, dynamic> json) => Doctor(
        id: json['id'] ?? '',
        name: json['name'] ?? '',
        phone: json['phone'],
        clinicName: json['clinic_name'],
        clinicAddress: json['clinic_address'],
        latitude: json['latitude'] != null ? (json['latitude'] as num).toDouble() : null,
        longitude: json['longitude'] != null ? (json['longitude'] as num).toDouble() : null,
        dob: json['dob'] != null ? DateTime.tryParse(json['dob']) : null,
        lastMeetingAt: json['last_meeting_at'] != null ? DateTime.tryParse(json['last_meeting_at'])?.toLocal() : null,
        lastMeetingNotes: json['last_meeting_notes'],
        ownerName: json['owner_name'],
        ownerPhone: json['owner_phone'],
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
