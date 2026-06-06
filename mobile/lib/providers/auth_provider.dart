import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/user.dart';
import '../services/auth_service.dart';
import '../config/api.dart';

final authServiceProvider = Provider((ref) => AuthService());

class AuthState {
  final User? user;
  final bool loading;
  final String? error;

  const AuthState({this.user, this.loading = false, this.error});

  AuthState copyWith({User? user, bool? loading, String? error, bool clearUser = false}) =>
      AuthState(
        user: clearUser ? null : user ?? this.user,
        loading: loading ?? this.loading,
        error: error,
      );
}

class AuthNotifier extends StateNotifier<AuthState> {
  final AuthService _service;

  AuthNotifier(this._service) : super(const AuthState());

  Future<bool> login(String phone, String password) async {
    state = state.copyWith(loading: true, error: null);
    try {
      final data = await _service.login(phone, password);
      final token = data['token'] as String;
      await saveToken(token);
      final user = User.fromJson(data['user']);
      state = state.copyWith(user: user, loading: false);
      return true;
    } catch (e) {
      state = state.copyWith(loading: false, error: _parseError(e));
      return false;
    }
  }

  Future<void> loadUser() async {
    final token = await getToken();
    if (token == null) return;
    try {
      final user = await _service.getMe();
      state = state.copyWith(user: user);
    } catch (_) {
      await clearToken();
    }
  }

  Future<void> logout() async {
    await clearToken();
    state = const AuthState();
  }

  String _parseError(Object e) {
    final msg = e.toString();
    if (msg.contains('401')) return 'Invalid phone number or password';
    if (msg.contains('SocketException') || msg.contains('Connection')) {
      return 'Cannot connect to server';
    }
    return 'Something went wrong';
  }
}

final authProvider = StateNotifierProvider<AuthNotifier, AuthState>((ref) {
  return AuthNotifier(ref.read(authServiceProvider));
});
