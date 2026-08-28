class Doctor {
  final String id;
  final String name;
  final String? phone;
  final String? email;
  final String? speciality;
  final String? clinicName;
  final String? clinicAddress;
  final double? latitude;
  final double? longitude;
  final DateTime? dob;
  final DateTime? anniversary;
  final DateTime? lastMeetingAt;
  final String? lastMeetingNotes;
  final String? ownerName;
  final String? ownerPhone;
  final int productCount;

  Doctor({
    required this.id,
    required this.name,
    this.phone,
    this.email,
    this.speciality,
    this.clinicName,
    this.clinicAddress,
    this.latitude,
    this.longitude,
    this.dob,
    this.anniversary,
    this.lastMeetingAt,
    this.lastMeetingNotes,
    this.ownerName,
    this.ownerPhone,
    this.productCount = 0,
  });

  factory Doctor.fromJson(Map<String, dynamic> json) => Doctor(
        id: json['id'] ?? '',
        name: json['name'] ?? '',
        phone: json['phone'],
        email: json['email'],
        speciality: json['speciality'],
        clinicName: json['clinic_name'],
        clinicAddress: json['clinic_address'],
        latitude: json['latitude'] != null ? (json['latitude'] as num).toDouble() : null,
        longitude: json['longitude'] != null ? (json['longitude'] as num).toDouble() : null,
        dob: json['dob'] != null ? DateTime.tryParse(json['dob']) : null,
        anniversary: json['anniversary'] != null ? DateTime.tryParse(json['anniversary']) : null,
        lastMeetingAt: json['last_meeting_at'] != null ? DateTime.tryParse(json['last_meeting_at'])?.toLocal() : null,
        lastMeetingNotes: json['last_meeting_notes'],
        ownerName: json['owner_name'],
        ownerPhone: json['owner_phone'],
        productCount: json['product_count'] ?? 0,
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
