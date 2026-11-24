import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:package_info_plus/package_info_plus.dart';
import '../config/api.dart';
import '../config/app_flavor.dart';

/// This app's identity for the update check: which app (client / team),
/// platform and build number (the +N of the version, e.g. 25).
class AppBuildInfo {
  static PackageInfo? _info;

  static Future<PackageInfo> info() async => _info ??= await PackageInfo.fromPlatform();

  static Future<int> build() async => int.tryParse((await info()).buildNumber) ?? 0;

  static String get app => isTeamApp ? 'team' : 'client';

  static String get platform => defaultTargetPlatform == TargetPlatform.iOS ? 'ios' : 'android';
}

/// What the server says about updates, against this build.
class UpdateStatus {
  final bool required; // below the minimum build: blocked until updated
  final bool available; // below the latest build: offered
  final String latestName;
  final String message;
  final String url;

  const UpdateStatus({
    required this.required,
    required this.available,
    required this.latestName,
    required this.message,
    required this.url,
  });
}

class AppUpdateService {
  final Dio _dio = createDio();

  /// Null when there is nothing to show or the server can't be reached: an
  /// app offline must keep working, so a failed check never blocks.
  Future<UpdateStatus?> check() async {
    try {
      final build = await AppBuildInfo.build();
      if (build == 0) return null; // unknown build (a debug run): never block
      final res = await _dio.get('/app-version', queryParameters: {'app': AppBuildInfo.app, 'platform': AppBuildInfo.platform});
      final j = res.data as Map<String, dynamic>;
      final latest = (j['latest_build'] as num?)?.toInt() ?? 0;
      final min = (j['min_build'] as num?)?.toInt() ?? 0;
      if (build >= latest && build >= min) return null;
      var url = (j['update_url'] as String?)?.trim() ?? '';
      if (url.isEmpty && AppBuildInfo.platform == 'android') {
        url = 'https://play.google.com/store/apps/details?id=${(await AppBuildInfo.info()).packageName}';
      }
      return UpdateStatus(
        required: build < min,
        available: build < latest,
        latestName: (j['latest_name'] as String?) ?? '',
        message: (j['message'] as String?) ?? '',
        url: url,
      );
    } catch (e) {
      debugPrint('update check failed: $e');
      return null;
    }
  }
}
