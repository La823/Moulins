import 'dart:async';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'doctor_service.dart';
import 'json_cache.dart';
import 'meeting_service.dart';
import 'offline_files.dart';
import 'offline_owner.dart';
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
  static const _scopedKey = 'offline_data_per_account';

  /// Whether Smart sync is on; read once at start-up ([load]).
  static bool smart = true;

  static const _wifiOnlyKey = 'offline_wifi_only';

  /// Automatic downloads (Smart sync, the daily save) only on Wi-Fi; off
  /// means Wi-Fi or mobile data. Tapping "Save everything" runs either way.
  static bool wifiOnly = false;
  static bool _onWifi = false;

  /// [listen]: follow Wi-Fi coming and going (the app; not the background job).
  static Future<void> load({bool listen = true}) async {
    final prefs = await SharedPreferences.getInstance();
    smart = prefs.getBool(_modeKey) ?? true;
    wifiOnly = prefs.getBool(_wifiOnlyKey) ?? false;
    final c = Connectivity();
    void track(List<ConnectivityResult> r) =>
        _onWifi = r.contains(ConnectivityResult.wifi) || r.contains(ConnectivityResult.ethernet);
    try {
      track(await c.checkConnectivity());
    } catch (_) {}
    if (!listen) return;
    c.onConnectivityChanged.listen((r) {
      track(r);
      if (_onWifi) runDailyIfDue(); // a daily save that waited for Wi-Fi
    });
  }

  static Future<void> setWifiOnly(bool on) async {
    wifiOnly = on;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_wifiOnlyKey, on);
  }

  /// Whether automatic downloads may run on the current network.
  static bool get autoAllowed => !wifiOnly || _onWifi;

  /// Smart sync is on and may download now.
  static bool get smartNow => smart && autoAllowed;

  // "Save everything" once a day, per account
  static String get _dailyKey => OfflineOwner.key('offline_save_daily');
  static String get _savedAtKey => OfflineOwner.key('offline_saved_at');
  // set while "Save everything" runs; still set on the next open means it
  // was cut short (the app closed), so it picks up where it stopped
  static String get _unfinishedKey => OfflineOwner.key('offline_save_unfinished');
  static const _heartbeatKey = 'offline_save_running';

  static Future<bool> daily() async => (await SharedPreferences.getInstance()).getBool(_dailyKey) ?? false;

  static Future<void> setDaily(bool on) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_dailyKey, on);
  }

  /// When everything was last saved for this account; null if never.
  static Future<DateTime?> lastSaved() async =>
      DateTime.tryParse((await SharedPreferences.getInstance()).getString(_savedAtKey) ?? '');

  /// Whether a "Save everything" was cut short and is waiting to finish.
  static Future<bool> unfinished() async =>
      (await SharedPreferences.getInstance()).getBool(_unfinishedKey) ?? false;

  /// Runs "Save everything" in the background when one was cut short (it
  /// carries on: files and decks already saved are skipped), or when the
  /// daily save is on and it last ran over a day ago. Only on an allowed
  /// network. Called when the app opens or comes back, and when Wi-Fi
  /// connects.
  static Future<void> runDailyIfDue() async {
    if (OfflineOwner.id == null || status.value != null || !autoAllowed) return;
    // the background job (offline_background.dart) may have saved meanwhile
    await (await SharedPreferences.getInstance()).reload();
    if (await unfinished()) {
      await saveEverything();
      return;
    }
    if (!await daily()) return;
    final last = await lastSaved();
    if (last != null && DateTime.now().difference(last) < const Duration(hours: 20)) return;
    await saveEverything();
  }

  static Future<void> setSmart(bool on) async {
    smart = on;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_modeKey, on);
  }

  // the stored keys that hold offline data (each followed by "@<user id>")
  static bool _isData(String k) =>
      k.startsWith('cached_product') ||
      k.startsWith('cached_favorite') ||
      k.startsWith(JsonCache.prefix) ||
      k.startsWith('downloaded_presentations');

  /// Switches offline data to [userId]'s, on login or app start: each
  /// account sees only what it saved itself (offline_owner.dart), and
  /// another account's stays on the phone, hidden, for when it logs in again.
  static Future<void> useAccount(String? userId) async {
    OfflineOwner.id = userId;
    if (userId == null) return;
    final prefs = await SharedPreferences.getInstance();
    if (prefs.getBool(_scopedKey) == true) return;
    // once, on updating: data saved before it was kept per account can't be
    // told apart, so it goes (Smart sync saves it again)
    for (final k in prefs.getKeys().toList()) {
      if (_isData(k) && !k.contains('@')) await prefs.remove(k);
    }
    await PresentationDownloads.cache.emptyCache();
    await prefs.setBool(_scopedKey, true);
  }

  /// The step "Save everything" is on; null when idle.
  static final status = ValueNotifier<String?>(null);

  /// Saves doctors (with their products and meetings), the user's orders,
  /// every presentation and the whole product catalogue with its images,
  /// documents and audio. Each part carries on if another fails.
  static Future<void> saveEverything() async {
    if (status.value != null) return;
    final prefs = await SharedPreferences.getInstance();
    // the app and the background job never save at the same time: a run
    // marks itself every 30 seconds, and the other side leaves it alone
    await prefs.reload();
    final beat = DateTime.tryParse(prefs.getString(_heartbeatKey) ?? '');
    if (beat != null && DateTime.now().difference(beat) < const Duration(seconds: 90)) return;
    Future<void> mark() => prefs.setString(_heartbeatKey, DateTime.now().toIso8601String());
    await mark();
    final heartbeat = Timer.periodic(const Duration(seconds: 30), (_) => mark());
    final resuming = prefs.getBool(_unfinishedKey) ?? false;
    await prefs.setBool(_unfinishedKey, true);
    try {
      status.value = resuming ? 'Carrying on where it stopped…' : 'Saving doctors and their products…';
      try {
        final doctors = await DoctorService().getDoctors();
        await DoctorService().saveAllForOffline(doctors);
        await MeetingService().getMeetings();
      } catch (_) {}

      status.value = 'Saving your orders…';
      try {
        final orders = (await OrderService().getMyOrders()).take(100).toList();
        for (var i = 0; i < orders.length; i += 5) {
          await Future.wait(
              orders.skip(i).take(5).map((o) => OrderService().getOrder(o.id).then((_) {}, onError: (_) {})));
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
      await prefs.setString(_savedAtKey, DateTime.now().toIso8601String());
      await prefs.remove(_unfinishedKey);
    } finally {
      heartbeat.cancel();
      await prefs.remove(_heartbeatKey);
      status.value = null;
    }
  }

  /// Clears everything this account keeps for offline use: product pages,
  /// presentations, and the remembered doctors, orders and meetings. The
  /// product files go too unless another account on the phone has saved
  /// products (the files are shared).
  static Future<void> deleteAll() async {
    await PresentationDownloads.removeAll();
    final prefs = await SharedPreferences.getInstance();
    for (final k in prefs.getKeys().toList()) {
      if (_isData(k) && OfflineOwner.owns(k)) await prefs.remove(k);
    }
    if (!prefs.getKeys().any((k) => k.startsWith('cached_product_'))) await OfflineFiles.cache.emptyCache();
  }

  /// How much is kept: (products with a saved page, downloaded presentations).
  static Future<(int, int)> counts() async {
    final prefs = await SharedPreferences.getInstance();
    final products = prefs
        .getKeys()
        .where((k) => k.startsWith('cached_product_') && !k.startsWith('cached_product_list') && OfflineOwner.owns(k))
        .length;
    final decks = (await PresentationDownloads.list()).length;
    return (products, decks);
  }
}
