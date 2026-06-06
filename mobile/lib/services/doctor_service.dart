import '../config/api.dart';
import '../models/doctor.dart';

class DoctorService {
  final _dio = createDio();

  Future<List<Doctor>> getDoctors() async {
    final res = await _dio.get('/doctors');
    return (res.data as List<dynamic>).map((e) => Doctor.fromJson(e)).toList();
  }

  Future<Doctor> createDoctor({
    required String name,
    String? phone,
    String? clinicName,
  }) async {
    final res = await _dio.post('/doctors', data: {
      'name': name,
      if (phone != null) 'phone': phone,
      if (clinicName != null) 'clinic_name': clinicName,
    });
    return Doctor.fromJson(res.data);
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
}
