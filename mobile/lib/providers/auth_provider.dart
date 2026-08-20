import 'dart:async';
import 'dart:convert';
import 'package:dio/dio.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/user.dart';
import '../services/auth_service.dart';
import '../services/notification_service.dart';
import '../config/api.dart';

final authServiceProvider = Provider((ref) => AuthService());

Future<void> _registerDeviceToken() async {
  try {
    final messaging = FirebaseMessaging.instance;
    await messaging.requestPermission();
    final token = await messaging.getToken();
    if (token != null) {
      await NotificationService().registerDeviceToken(token, platform: 'android');
    }
  } catch (e) {
    debugPrint('FCM token registration failed: $e');
  }
}

class AuthState {
  final User? user;
  final bool loading;
  final String? error;
  // False until the stored token has been checked once at app startup.
  // Distinguishes "haven't looked yet" from "looked, no session" so the UI
  // can show a splash instead of flashing the login screen.
  final bool checked;

  const AuthState({this.user, this.loading = false, this.error, this.checked = false});

  AuthState copyWith({User? user, bool? loading, String? error, bool? checked, bool clearUser = false}) =>
      AuthState(
        user: clearUser ? null : user ?? this.user,
        loading: loading ?? this.loading,
        error: error,
        checked: checked ?? this.checked,
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
      await saveCachedUser(jsonEncode(user.toJson()));
      state = state.copyWith(user: user, loading: false, checked: true);
      unawaited(_registerDeviceToken());
      return true;
    } catch (e) {
      state = state.copyWith(loading: false, error: _parseError(e));
      return false;
    }
  }

  Future<void> loadUser() async {
    final token = await getToken();
    if (token == null) {
      state = state.copyWith(checked: true);
      return;
    }
    try {
      final user = await _service.getMe();
      await saveCachedUser(jsonEncode(user.toJson()));
      state = state.copyWith(user: user, checked: true);
      unawaited(_registerDeviceToken());
    } on DioException catch (e) {
      // A real auth failure (expired/invalid token) means the server
      // itself rejected us — that's the only case where we should log
      // out. Anything else (no connection, timeout, DNS failure, 5xx) is
      // just us being unable to reach the server right now; the token is
      // still good, so open the app with the last-known cached profile
      // instead of forcing a login screen that also can't work offline.
      final status = e.response?.statusCode;
      if (status == 401 || status == 403) {
        await clearToken();
        state = state.copyWith(checked: true);
        return;
      }
      final cached = await getCachedUser();
      if (cached != null) {
        state = state.copyWith(user: User.fromJson(jsonDecode(cached)), checked: true);
      } else {
        state = state.copyWith(checked: true);
      }
    } catch (_) {
      final cached = await getCachedUser();
      if (cached != null) {
        state = state.copyWith(user: User.fromJson(jsonDecode(cached)), checked: true);
      } else {
        state = state.copyWith(checked: true);
      }
    }
  }

  Future<bool> updateDefaultTransportMode(String mode) async {
    final current = state.user;
    if (current == null) return false;
    try {
      await _service.updateDefaultTransportMode(mode);
      final user = User(
        id: current.id,
        phoneNumber: current.phoneNumber,
        username: current.username,
        role: current.role,
        customerType: current.customerType,
        permissions: current.permissions,
        defaultTransportMode: mode,
        billingAddress: current.billingAddress,
        shippingAddress: current.shippingAddress,
      );
      await saveCachedUser(jsonEncode(user.toJson()));
      state = state.copyWith(user: user);
      return true;
    } catch (_) {
      return false;
    }
  }

  Future<bool> updateAddress({String? billingAddress, String? shippingAddress}) async {
    final current = state.user;
    if (current == null) return false;
    try {
      await _service.updateAddress(billingAddress: billingAddress, shippingAddress: shippingAddress);
      final user = User(
        id: current.id,
        phoneNumber: current.phoneNumber,
        username: current.username,
        role: current.role,
        customerType: current.customerType,
        permissions: current.permissions,
        defaultTransportMode: current.defaultTransportMode,
        billingAddress: billingAddress ?? current.billingAddress,
        shippingAddress: shippingAddress ?? current.shippingAddress,
      );
      await saveCachedUser(jsonEncode(user.toJson()));
      state = state.copyWith(user: user);
      return true;
    } catch (_) {
      return false;
    }
  }

  Future<void> logout() async {
    await clearToken();
    state = const AuthState(checked: true);
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
