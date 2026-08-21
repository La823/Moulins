import '../config/api.dart';
import '../models/doctor.dart';

class DoctorService {
  final _dio = createDio();

  Future<List<Doctor>> getDoctors() async {
    final res = await _dio.get('/doctors');
    return (res.data as List<dynamic>).map((e) => Doctor.fromJson(e)).toList();
  }

  // GET /doctor/me — a doctor-role login's own profile.
  Future<Doctor> getMyProfile() async {
    final res = await _dio.get('/doctor/me');
    return Doctor.fromJson(res.data);
  }

  // PUT /doctor/me — self-service update. Email/clinicAddress are set
  // directly (not COALESCEd) on the backend, so pass the current values
  // through even when only name/clinicName changed.
  Future<void> updateMyProfile({
    required String name,
    String? email,
    String? clinicName,
    String? clinicAddress,
  }) async {
    await _dio.put('/doctor/me', data: {
      'name': name,
      'email': email,
      'clinic_name': clinicName,
      'clinic_address': clinicAddress,
    });
  }

  Future<Doctor> createDoctor({
    required String name,
    String? phone,
    String? email,
    String? speciality,
    String? clinicName,
    String? clinicAddress,
    double? latitude,
    double? longitude,
    DateTime? dob,
  }) async {
    final res = await _dio.post('/doctors', data: {
      'name': name,
      if (phone != null) 'phone': phone,
      if (email != null) 'email': email,
      if (speciality != null) 'speciality': speciality,
      if (clinicName != null) 'clinic_name': clinicName,
      if (clinicAddress != null) 'clinic_address': clinicAddress,
      if (latitude != null) 'latitude': latitude,
      if (longitude != null) 'longitude': longitude,
      if (dob != null) 'dob': dob.toUtc().toIso8601String(),
    });
    return Doctor.fromJson(res.data);
  }

  Future<void> updateDoctor(
    String id, {
    required String name,
    String? phone,
    String? email,
    String? speciality,
    String? clinicName,
    String? clinicAddress,
    double? latitude,
    double? longitude,
    DateTime? dob,
  }) async {
    await _dio.put('/doctors/$id', data: {
      'name': name,
      'phone': phone,
      'email': email,
      'speciality': speciality,
      'clinic_name': clinicName,
      'clinic_address': clinicAddress,
      'latitude': latitude,
      'longitude': longitude,
      if (dob != null) 'dob': dob.toUtc().toIso8601String(),
    });
  }

  Future<List<Doctor>> getAllDoctorsWithLocation() async {
    final res = await _dio.get('/admin/doctors');
    return (res.data as List<dynamic>).map((e) => Doctor.fromJson(e)).toList();
  }

  Future<void> deleteDoctor(String id) async {
    await _dio.delete('/doctors/$id');
  }

  Future<List<DoctorProduct>> getDoctorProducts(String doctorId) async {
    final res = await _dio.get('/doctors/$doctorId/products');
    return (res.data as List<dynamic>)
        .map((e) => DoctorProduct.fromJson(e))
        .toList();
  }

  Future<void> addDoctorProduct(String doctorId, String productId) async {
    await _dio.post('/doctors/$doctorId/products', data: {'product_id': productId});
  }

  Future<void> removeDoctorProduct(String doctorId, String productId) async {
    await _dio.delete('/doctors/$doctorId/products/$productId');
  }

  Future<void> updateLastMeeting(String doctorId, {DateTime? lastMeetingAt, String? notes}) async {
    await _dio.put('/doctors/$doctorId/last-meeting', data: {
      'last_meeting_at': lastMeetingAt?.toUtc().toIso8601String(),
      'last_meeting_notes': notes,
    });
  }
}
