import '../config/api.dart';
import '../models/user.dart';

class AuthService {
  final _dio = createDio();

  Future<Map<String, dynamic>> login(String phone, String password) async {
    final res = await _dio.post('/auth/login', data: {
      'phone_number': phone,
      'password': password,
    });
    return res.data;
  }

  Future<User> getMe() async {
    final res = await _dio.get('/auth/me');
    return User.fromJson(res.data);
  }

  Future<void> updateDefaultTransportMode(String mode) async {
    await _dio.put('/profile/transport-mode', data: {'default_transport_mode': mode});
  }

  // Billing address is deliberately not settable here — the backend ignores
  // it on this endpoint. It can only be pulled from the partner's verified
  // GST record (pullBillingAddressFromGst) or changed by an admin.
  Future<void> updateAddress({String? shippingAddress}) async {
    await _dio.put('/profile/address', data: {
      'shipping_address': shippingAddress,
    });
  }

  Future<String> pullBillingAddressFromGst() async {
    final res = await _dio.post('/profile/address/billing-from-gst');
    return res.data['billing_address'] as String;
  }
}
