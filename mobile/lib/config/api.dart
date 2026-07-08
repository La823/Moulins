import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

const String baseUrl = 'http://52.66.121.187/api';

FlutterSecureStorage get _storage => const FlutterSecureStorage(
      aOptions: AndroidOptions(
        encryptedSharedPreferences: true,
        resetOnError: true,
      ),
    );

Dio createDio() {
  final dio = Dio(BaseOptions(
    baseUrl: baseUrl,
    connectTimeout: const Duration(seconds: 10),
    receiveTimeout: const Duration(seconds: 15),
    headers: {'Content-Type': 'application/json'},
  ));

  dio.interceptors.add(InterceptorsWrapper(
    onRequest: (options, handler) async {
      try {
        final token = await _storage.read(key: 'token');
        if (token != null) {
          options.headers['Authorization'] = 'Bearer $token';
        }
      } catch (e) {
        debugPrint('Token read error: $e');
      }
      handler.next(options);
    },
    onError: (error, handler) {
      handler.next(error);
    },
  ));

  return dio;
}

Future<void> saveToken(String token) async {
  try {
    await _storage.write(key: 'token', value: token);
  } catch (e) {
    debugPrint('Token save error: $e');
  }
}

Future<String?> getToken() async {
  try {
    return await _storage.read(key: 'token');
  } catch (e) {
    debugPrint('Token read error: $e');
    return null;
  }
}

Future<void> clearToken() async {
  try {
    await _storage.delete(key: 'token');
  } catch (e) {
    debugPrint('Token clear error: $e');
  }
}
