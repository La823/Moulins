import 'dart:convert';
import 'dart:io';
import 'dart:ui';
import 'package:workmanager/workmanager.dart';
import '../config/api.dart';
import '../models/user.dart';
import 'offline_owner.dart';
import 'offline_sync.dart';

const _uniqueName = 'offline-save';
const _taskName = 'offlineSave';

/// Android runs this, with no screen, for the scheduled job below.
@pragma('vm:entry-point')
void offlineBackgroundDispatcher() {
  Workmanager().executeTask((task, input) async {
    DartPluginRegistrant.ensureInitialized();
    try {
      await OfflineBackground.run();
    } catch (_) {
      // tried again at the next run
    }
    return true;
  });
}

/// "Save everything" with the app closed (Android). A job checks every few
/// hours and, when a save is due (one cut short, or the daily save), runs it
/// for the logged-in account, under Android's rules: only with internet
/// (Wi-Fi only when so set), not on low battery or storage, and up to about
/// 10 minutes a run, so a long save carries on at the next one. The time is
/// Android's to choose, and some phones hold such jobs back to save battery.
class OfflineBackground {
  static Future<void> init() async {
    if (!Platform.isAndroid) return;
    try {
      await Workmanager().initialize(offlineBackgroundDispatcher);
      await schedule();
    } catch (_) {}
  }

  /// (Re)schedules the job, e.g. after "Wi-Fi only" changes.
  static Future<void> schedule() async {
    if (!Platform.isAndroid) return;
    await Workmanager().registerPeriodicTask(
      _uniqueName,
      _taskName,
      frequency: const Duration(hours: 3),
      constraints: Constraints(
        networkType: OfflineSync.wifiOnly ? NetworkType.unmetered : NetworkType.connected,
        requiresBatteryNotLow: true,
        requiresStorageNotLow: true,
      ),
      existingWorkPolicy: ExistingPeriodicWorkPolicy.update,
    );
  }

  static Future<void> run() async {
    if (await getToken() == null) return; // logged out
    final cached = await getCachedUser();
    if (cached == null) return;
    OfflineOwner.id = User.fromJson(jsonDecode(cached)).id;
    await OfflineSync.load(listen: false);
    await OfflineSync.runDailyIfDue();
  }
}
