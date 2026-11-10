import 'dart:convert';
import 'package:dio/dio.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Keeps the server's last answer for a request on the phone, so a screen
/// can show it with no internet (doctors, their products, meetings). The raw
/// JSON is stored and parsed again with the model's own fromJson, so the
/// offline copy reads exactly like a fresh one.
class JsonCache {
  static const _prefix = 'json_cache_';

  /// A failure with no answer from the server, i.e. no connection, as opposed
  /// to the server refusing (404, 403…), which must not fall back to an old copy.
  static bool isNoConnection(Object e) => e is DioException && e.response == null;

  static Future<void> put(String key, Object? data) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('$_prefix$key', jsonEncode(data));
  }

  static Future<Object?> get(String key) async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString('$_prefix$key');
    if (raw == null) return null;
    try {
      return jsonDecode(raw);
    } catch (_) {
      return null;
    }
  }

  /// Loads from the server and saves the answer; with no connection, returns
  /// the saved answer instead (and calls [onCache]). Rethrows when there is
  /// neither.
  static Future<T> fetch<T>(
    String key,
    Future<Object?> Function() load,
    T Function(Object? data) parse, {
    void Function()? onCache,
  }) async {
    try {
      final data = await load();
      final parsed = parse(data);
      await put(key, data);
      return parsed;
    } catch (e) {
      if (!isNoConnection(e)) rethrow;
      final saved = await get(key);
      if (saved == null) rethrow;
      onCache?.call();
      return parse(saved);
    }
  }
}
