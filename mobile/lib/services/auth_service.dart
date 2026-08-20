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

  Future<void> updateAddress({String? billingAddress, String? shippingAddress}) async {
    await _dio.put('/profile/address', data: {
      'billing_address': billingAddress,
      'shipping_address': shippingAddress,
    });
  }
}
