import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:flutter_cache_manager/flutter_cache_manager.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../models/presentation.dart';

/// A presentation saved on the phone so it can be shown with no internet:
/// the deck as it was when downloaded, slides in order.
class DownloadedPresentation {
  final String id;
  final String name;
  final String? doctorId;
  final String? doctorName;
  final DateTime downloadedAt;
  final List<PresentationSlide> slides;

  DownloadedPresentation({
    required this.id,
    required this.name,
    this.doctorId,
    this.doctorName,
    required this.downloadedAt,
    required this.slides,
  });

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'doctor_id': doctorId,
        'doctor_name': doctorName,
        'downloaded_at': downloadedAt.toIso8601String(),
        'slides': slides
            .map((s) => {
                  'product_image_id': s.productImageId,
                  'image_url': s.imageUrl,
                  'product_id': s.productId,
                  'product_name': s.productName,
                })
            .toList(),
      };

  factory DownloadedPresentation.fromJson(Map<String, dynamic> json) => DownloadedPresentation(
        id: json['id'] ?? '',
        name: json['name'] ?? '',
        doctorId: json['doctor_id'],
        doctorName: json['doctor_name'],
        downloadedAt: DateTime.tryParse(json['downloaded_at'] ?? '') ?? DateTime.now(),
        slides: (json['slides'] as List<dynamic>? ?? []).map((e) => PresentationSlide.fromJson(e)).toList(),
      );

  /// Presentation shape for the list screen's cards.
  Presentation get asPresentation => Presentation(
        id: id,
        name: name,
        doctorId: doctorId,
        doctorName: doctorName,
        slideCount: slides.length,
        previewUrls: slides.take(4).map((s) => s.imageUrl).toList(),
      );
}

/// Downloads presentations for offline use. The deck (names and slide
/// order) goes in SharedPreferences; the slide images go in a cache of
/// their own, so browsing products can't push them out of the app's
/// general image cache. Viewers showing a presentation load through
/// [cache] (CachedNetworkImage with this cacheManager), which serves a
/// downloaded image from the phone and fetches anything else as usual.
class PresentationDownloads {
  static const _key = 'downloaded_presentations';

  /// Ticks whenever a deck is downloaded or removed, so every download
  /// button and list on screen can refresh.
  static final changes = ValueNotifier<int>(0);

  // Slide image URLs are public and stable, so the URL is the cache key.
  static final cache = CacheManager(Config(
    'presentationImages',
    stalePeriod: const Duration(days: 3650),
    maxNrOfCacheObjects: 5000,
  ));

  static Future<List<DownloadedPresentation>> list() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_key);
    if (raw == null) return [];
    try {
      return (jsonDecode(raw) as List<dynamic>).map((e) => DownloadedPresentation.fromJson(e)).toList();
    } catch (_) {
      return [];
    }
  }

  static Future<DownloadedPresentation?> get(String id) async {
    for (final d in await list()) {
      if (d.id == id) return d;
    }
    return null;
  }

  static Future<void> _save(List<DownloadedPresentation> all) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_key, jsonEncode(all.map((d) => d.toJson()).toList()));
  }

  /// Saves the deck and every slide image; [onProgress] gets (done, total).
  /// Replaces an earlier download of the same deck. Nothing is recorded if
  /// an image fails, so a deck is never half-downloaded.
  static Future<DownloadedPresentation> download(
    PresentationDetail detail, {
    void Function(int done, int total)? onProgress,
  }) async {
    final urls = detail.slides.map((s) => s.imageUrl).where((u) => u.isNotEmpty).toSet().toList();
    var done = 0;
    onProgress?.call(0, urls.length);
    for (final url in urls) {
      await cache.downloadFile(url);
      onProgress?.call(++done, urls.length);
    }
    final d = DownloadedPresentation(
      id: detail.presentation.id,
      name: detail.presentation.name,
      doctorId: detail.presentation.doctorId,
      doctorName: detail.presentation.doctorName,
      downloadedAt: DateTime.now(),
      slides: detail.slides,
    );
    final all = (await list()).where((x) => x.id != d.id).toList()..insert(0, d);
    await _save(all);
    changes.value++;
    return d;
  }

  /// Removes a download and the images no other downloaded deck uses.
  static Future<void> remove(String id) async {
    final all = await list();
    final gone = all.where((d) => d.id == id).toList();
    final keep = all.where((d) => d.id != id).toList();
    await _save(keep);
    changes.value++;
    final stillUsed = {for (final d in keep) ...d.slides.map((s) => s.imageUrl)};
    for (final d in gone) {
      for (final s in d.slides) {
        if (!stillUsed.contains(s.imageUrl)) await cache.removeFile(s.imageUrl);
      }
    }
  }

  /// Whether every slide image of a downloaded deck is still on the phone.
  static Future<bool> isComplete(DownloadedPresentation d) async {
    for (final s in d.slides) {
      if (s.imageUrl.isNotEmpty && await cache.getFileFromCache(s.imageUrl) == null) return false;
    }
    return true;
  }
}
