import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'doctor_service.dart';
import 'json_cache.dart';
import 'meeting_service.dart';
import 'offline_files.dart';
import 'order_service.dart';
import 'presentation_downloads.dart';
import 'presentation_service.dart';
import 'product_service.dart';

/// What the app keeps on the phone for use without internet, set on the
/// Offline data page (Profile > Offline data).
///
/// Smart sync (the default) keeps, as they are opened online: favourites in
/// full, every product assigned to a doctor in full, and every presentation.
/// Manual keeps only what the user downloads themselves. Either way, lists
/// already seen (doctors, orders, products) are remembered, which costs
/// little. [saveEverything] saves it all at once; [deleteAll] clears it.
class OfflineSync {
  static const _modeKey = 'offline_smart_save';

  /// Whether Smart sync is on; read once at start-up ([load]).
  static bool smart = true;

  static Future<void> load() async {
    final prefs = await SharedPreferences.getInstance();
    smart = prefs.getBool(_modeKey) ?? true;
  }

  static Future<void> setSmart(bool on) async {
    smart = on;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_modeKey, on);
  }

  /// The step "Save everything" is on; null when idle.
  static final status = ValueNotifier<String?>(null);

  /// Saves doctors (with their products and meetings), the user's orders,
  /// every presentation and the whole product catalogue with its images,
  /// documents and audio. Each part carries on if another fails.
  static Future<void> saveEverything() async {
    if (status.value != null) return;
    try {
      status.value = 'Saving doctors and their products…';
      try {
        final doctors = await DoctorService().getDoctors();
        await DoctorService().saveAllForOffline(doctors);
        await MeetingService().getMeetings();
      } catch (_) {}

      status.value = 'Saving your orders…';
      try {
        final orders = await OrderService().getMyOrders();
        for (final o in orders.take(100)) {
          await OrderService().getOrder(o.id).then((_) {}, onError: (_) {});
        }
      } catch (_) {}

      status.value = 'Saving presentations…';
      try {
        final ps = PresentationService();
        await PresentationDownloads.keepDownloaded(await ps.getPresentations(), ps.getPresentation);
      } catch (_) {}

      status.value = 'Saving all products…';
      try {
        // the full list carries each product's images and documents, and
        // keeps each product's page for offline use
        final res = await ProductService().getProducts(limit: 0);
        await OfflineFiles.saveProducts(res.products);
      } catch (_) {}
    } finally {
      status.value = null;
    }
  }

  /// Clears everything kept for offline use: product files and pages,
  /// presentations, and the remembered doctors, orders and meetings.
  static Future<void> deleteAll() async {
    await OfflineFiles.cache.emptyCache();
    await PresentationDownloads.removeAll();
    final prefs = await SharedPreferences.getInstance();
    for (final k in prefs.getKeys().toList()) {
      if (k.startsWith('cached_product') || k.startsWith('cached_favorite') || k.startsWith(JsonCache.prefix)) {
        await prefs.remove(k);
      }
    }
  }

  /// How much is kept: (products with a saved page, downloaded presentations).
  static Future<(int, int)> counts() async {
    final prefs = await SharedPreferences.getInstance();
    final products = prefs.getKeys().where((k) => k.startsWith('cached_product_') && k != 'cached_product_list').length;
    final decks = (await PresentationDownloads.list()).length;
    return (products, decks);
  }
}
