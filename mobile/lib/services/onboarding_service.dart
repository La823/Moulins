import 'package:dio/dio.dart';
import '../config/api.dart';
import '../models/onboarding.dart';

class OnboardingService {
  final Dio dio;

  OnboardingService({required this.dio});

  Future<OnboardingStatus> getStatus() async {
    try {
      final response = await dio.get('$baseUrl/onboarding/status');
      return OnboardingStatus.fromJson(response.data);
    } catch (e) {
      throw Exception('Failed to fetch onboarding status: $e');
    }
  }

  Future<CustomerDocument> uploadDocument({
    required String docType, // LICENSE or GST
    required String docNumber,
    required DateTime? expiryDate, // Required for LICENSE
    required String photoUrl,
  }) async {
    try {
      final payload = {
        'doc_type': docType,
        'doc_number': docNumber,
        'photo_url': photoUrl,
        if (expiryDate != null) 'expiry_date': expiryDate.toIso8601String(),
      };

      final response = await dio.post(
        '$baseUrl/onboarding/documents',
        data: payload,
      );

      return CustomerDocument.fromJson(response.data['document']);
    } catch (e) {
      throw Exception('Failed to upload document: $e');
    }
  }
}
