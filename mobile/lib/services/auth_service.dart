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
}
