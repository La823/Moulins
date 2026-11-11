import '../config/api.dart';
import '../models/doctor.dart';
import 'json_cache.dart';
import 'offline_files.dart';
import 'product_service.dart';
import '../models/product.dart';

class DoctorService {
  final _dio = createDio();

  /// Whether the last getDoctors answer was the saved copy (no internet).
  static bool lastFromCache = false;

  // The doctor list and each doctor's products are saved on the phone each
  // time they load, and shown from there with no internet (json_cache.dart).
  Future<List<Doctor>> getDoctors() async {
    lastFromCache = false;
    return JsonCache.fetch(
      'doctors',
      () async => (await _dio.get('/doctors')).data,
      (data) => (data as List<dynamic>).map((e) => Doctor.fromJson(e)).toList(),
      onCache: () => lastFromCache = true,
    );
  }

  /// Saves every doctor's assigned products (and so their pages) for offline
  /// use; a few at a time, in the background, after the list loads online.
  Future<void> saveAllForOffline(List<Doctor> doctors) async {
    final productIds = <String>{};
    for (var i = 0; i < doctors.length; i += 4) {
      await Future.wait(doctors.skip(i).take(4).map((d) => getDoctorProducts(d.id).then(
            (ps) => productIds.addAll(ps.map((p) => p.productId)),
            onError: (_) {},
          )));
    }
    await saveProductsForOffline(productIds);
  }

  static bool _savingProducts = false;

  /// Saves the full page of each product assigned to a doctor (its details,
  /// and its images, documents and audio, like a favourite), so a doctor's
  /// products open with no internet.
  static Future<void> saveProductsForOffline(Iterable<String> productIds) async {
    if (_savingProducts) return;
    _savingProducts = true;
    try {
      final service = ProductService();
      final ids = productIds.where((id) => id.isNotEmpty).toSet().toList();
      final products = <Product>[];
      for (var i = 0; i < ids.length; i += 4) {
        // getProduct keeps each product's details for offline use
        final got = await Future.wait(ids.skip(i).take(4).map((id) => service.getProduct(id).then<Product?>(
              (p) => p,
              onError: (_) => null,
            )));
        products.addAll(got.whereType<Product>());
      }
      await OfflineFiles.saveProducts(products);
    } finally {
      _savingProducts = false;
    }
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
    DateTime? anniversary,
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
      if (anniversary != null) 'anniversary': anniversary.toUtc().toIso8601String(),
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
    DateTime? anniversary,
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
      if (anniversary != null) 'anniversary': anniversary.toUtc().toIso8601String(),
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
    return JsonCache.fetch(
      'doctor_products_$doctorId',
      () async => (await _dio.get('/doctors/$doctorId/products')).data,
      (data) => (data as List<dynamic>).map((e) => DoctorProduct.fromJson(e)).toList(),
    );
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
