import 'dart:async';
import 'dart:convert';
import 'package:dio/dio.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../config/app_flavor.dart';
import '../models/user.dart';
import '../services/auth_service.dart';
import '../services/notification_service.dart';
import '../services/offline_sync.dart';
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

const _staffUseTeamApp =
    'Staff accounts now use the MPPL Team app. Please install MPPL Team and sign in there with the same phone number and password.';

class AuthNotifier extends StateNotifier<AuthState> {
  final AuthService _service;

  AuthNotifier(this._service) : super(const AuthState());

  Future<bool> login(String phone, String password) async {
    state = state.copyWith(loading: true, error: null);
    try {
      final data = await _service.login(phone, password);
      final user = User.fromJson(data['user']);
      // MPPL Team is the staff app and Moulins the clients': a login for
      // the other app is turned away before anything is saved, so the app
      // stays signed out.
      if (isTeamApp && !isStaffRole(user.role)) {
        state = state.copyWith(loading: false, error: 'MPPL Team is for Moulins staff only. Please sign in on the Moulins app.');
        return false;
      }
      if (!isTeamApp && isStaffRole(user.role)) {
        state = state.copyWith(loading: false, error: _staffUseTeamApp);
        return false;
      }
      final token = data['token'] as String;
      await saveToken(token);
      await saveCachedUser(jsonEncode(user.toJson()));
      // this account's offline data, not another's
      await OfflineSync.useAccount(user.id);
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
      // a staff member still signed in on Moulins from before staff moved
      // to MPPL Team: sign out, with the reason on the login screen
      if (!isTeamApp && isStaffRole(user.role)) {
        await clearToken();
        state = state.copyWith(checked: true, error: _staffUseTeamApp);
        return;
      }
      await saveCachedUser(jsonEncode(user.toJson()));
      await OfflineSync.useAccount(user.id);
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
      final cachedUser = cached == null ? null : User.fromJson(jsonDecode(cached));
      if (cachedUser != null && !isTeamApp && isStaffRole(cachedUser.role)) {
        await clearToken();
        state = state.copyWith(checked: true, error: _staffUseTeamApp);
      } else if (cachedUser != null) {
        await OfflineSync.useAccount(cachedUser.id);
        state = state.copyWith(user: cachedUser, checked: true);
      } else {
        state = state.copyWith(checked: true);
      }
    } catch (_) {
      final cached = await getCachedUser();
      final cachedUser = cached == null ? null : User.fromJson(jsonDecode(cached));
      if (cachedUser != null && !isTeamApp && isStaffRole(cachedUser.role)) {
        await clearToken();
        state = state.copyWith(checked: true, error: _staffUseTeamApp);
      } else if (cachedUser != null) {
        await OfflineSync.useAccount(cachedUser.id);
        state = state.copyWith(user: cachedUser, checked: true);
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
        teamSettings: current.teamSettings,
        staffGroup: current.staffGroup,
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

  Future<bool> updateAddress({String? shippingAddress}) async {
    final current = state.user;
    if (current == null) return false;
    try {
      await _service.updateAddress(shippingAddress: shippingAddress);
      final user = User(
        id: current.id,
        phoneNumber: current.phoneNumber,
        username: current.username,
        role: current.role,
        customerType: current.customerType,
        permissions: current.permissions,
        teamSettings: current.teamSettings,
        staffGroup: current.staffGroup,
        defaultTransportMode: current.defaultTransportMode,
        billingAddress: current.billingAddress,
        shippingAddress: shippingAddress ?? current.shippingAddress,
      );
      await saveCachedUser(jsonEncode(user.toJson()));
      state = state.copyWith(user: user);
      return true;
    } catch (_) {
      return false;
    }
  }

  // Billing address can only be pulled from the partner's verified GST
  // record — never typed in freely.
  Future<bool> pullBillingAddressFromGst() async {
    final current = state.user;
    if (current == null) return false;
    try {
      final billingAddress = await _service.pullBillingAddressFromGst();
      final user = User(
        id: current.id,
        phoneNumber: current.phoneNumber,
        username: current.username,
        role: current.role,
        customerType: current.customerType,
        permissions: current.permissions,
        teamSettings: current.teamSettings,
        staffGroup: current.staffGroup,
        defaultTransportMode: current.defaultTransportMode,
        billingAddress: billingAddress,
        shippingAddress: current.shippingAddress,
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
    await OfflineSync.useAccount(null);
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
