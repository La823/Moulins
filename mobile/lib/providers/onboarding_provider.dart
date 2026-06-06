import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../config/api.dart';
import '../models/onboarding.dart';
import '../services/onboarding_service.dart';

final onboardingServiceProvider = Provider((ref) {
  return OnboardingService(dio: createDio());
});

final onboardingStatusProvider = FutureProvider((ref) async {
  final service = ref.watch(onboardingServiceProvider);
  return service.getStatus();
});

class OnboardingNotifier extends StateNotifier<AsyncValue<OnboardingStatus>> {
  final OnboardingService service;

  OnboardingNotifier(this.service) : super(const AsyncValue.loading());

  Future<void> loadStatus() async {
    state = const AsyncValue.loading();
    try {
      final status = await service.getStatus();
      state = AsyncValue.data(status);
    } catch (e) {
      state = AsyncValue.error(e, StackTrace.current);
    }
  }

  Future<void> uploadLicense({
    required String licenseNumber,
    required DateTime expiryDate,
    required String photoUrl,
  }) async {
    try {
      await service.uploadDocument(
        docType: 'LICENSE',
        docNumber: licenseNumber,
        expiryDate: expiryDate,
        photoUrl: photoUrl,
      );
      await loadStatus();
    } catch (e) {
      state = AsyncValue.error(e, StackTrace.current);
      rethrow;
    }
  }

  Future<void> uploadGST({
    required String gstNumber,
    required String photoUrl,
  }) async {
    try {
      await service.uploadDocument(
        docType: 'GST',
        docNumber: gstNumber,
        expiryDate: null,
        photoUrl: photoUrl,
      );
      await loadStatus();
    } catch (e) {
      state = AsyncValue.error(e, StackTrace.current);
      rethrow;
    }
  }
}

final onboardingProvider = StateNotifierProvider<OnboardingNotifier, AsyncValue<OnboardingStatus>>((ref) {
  final service = ref.watch(onboardingServiceProvider);
  return OnboardingNotifier(service);
});
