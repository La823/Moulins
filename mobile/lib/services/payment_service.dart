import '../config/api.dart';
import '../models/payment.dart';

class PaymentService {
  final _dio = createDio();

  Future<Map<String, String>> getUploadUrl(String filename) async {
    final res = await _dio.post('/payments/upload-url', data: {'filename': filename});
    return {'upload_url': res.data['upload_url'], 'key': res.data['key']};
  }

  Future<void> submitPayment({required double amount, required String screenshotKey}) async {
    await _dio.post('/payments', data: {'amount': amount, 'screenshot_key': screenshotKey});
  }

  Future<List<Payment>> getMyPayments() async {
    final res = await _dio.get('/payments');
    final data = res.data;
    if (data is List) return data.map((e) => Payment.fromJson(e)).toList();
    return [];
  }

  // Staff (admin/employee with the "payments" permission) — every partner's submissions.
  Future<List<Payment>> getAllPayments({int page = 1, int limit = 20, String? status, String? search}) async {
    final res = await _dio.get('/admin/payments', queryParameters: {
      'page': page,
      'limit': limit,
      if (status != null && status.isNotEmpty) 'status': status,
      if (search != null && search.isNotEmpty) 'search': search,
    });
    final list = res.data['payments'] as List<dynamic>? ?? [];
    return list.map((e) => Payment.fromJson(e)).toList();
  }

  Future<void> verifyPayment(String id, bool isVerified, {String? rejectionReason}) async {
    await _dio.put('/admin/payments/$id/verify', data: {
      'is_verified': isVerified,
      'rejection_reason': rejectionReason,
    });
  }
}
