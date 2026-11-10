import 'package:flutter/foundation.dart';
import 'package:flutter_cache_manager/flutter_cache_manager.dart';
import '../models/product.dart';

/// Product files kept on the phone: images, documents (PDFs) and audio.
/// Every product screen loads through [cache], which serves a saved file
/// with no internet and fetches anything else as usual. Favourites are
/// downloaded in full ([saveProducts]) each time the Favourites list loads
/// online, so a favourite opens offline with all its images, documents and
/// audio. Unlike the default image cache, this one isn't cleared after 30
/// days or 200 files.
class OfflineFiles {
  static final cache = CacheManager(Config(
    'offlineProductFiles',
    stalePeriod: const Duration(days: 3650),
    maxNrOfCacheObjects: 10000,
  ));

  /// (done, total) while favourites are being saved; null when idle.
  static final progress = ValueNotifier<(int, int)?>(null);
  static bool _running = false;

  /// Every file a product page can show.
  static List<String> urlsOf(Product p) => {
        if (p.cardImageUrl != null && p.cardImageUrl!.isNotEmpty) p.cardImageUrl!,
        for (final img in p.images)
          if (!img.hidden && img.imageUrl.isNotEmpty) img.imageUrl,
        for (final d in p.documents)
          if (d.fileUrl.isNotEmpty) d.fileUrl,
        if (p.audioUrl != null && p.audioUrl!.isNotEmpty) p.audioUrl!,
      }.toList();

  /// Downloads every file of [products] that isn't on the phone yet. Runs
  /// once at a time; a file that fails is skipped and tried on the next run.
  static Future<void> saveProducts(List<Product> products) async {
    if (_running) return;
    _running = true;
    try {
      final urls = {for (final p in products) ...urlsOf(p)}.toList();
      final missing = <String>[];
      for (final u in urls) {
        if (await cache.getFileFromCache(u) == null) missing.add(u);
      }
      if (missing.isEmpty) return;
      var done = 0;
      progress.value = (0, missing.length);
      for (final u in missing) {
        try {
          await cache.downloadFile(u);
        } catch (_) {
          // no connection or a removed file: next run tries again
        }
        progress.value = (++done, missing.length);
      }
    } finally {
      progress.value = null;
      _running = false;
    }
  }
}
