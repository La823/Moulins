import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../services/offline_owner.dart';
import '../services/offline_sync.dart';

/// Asks once (after login, on a fresh install or the first open after this
/// update, and once per account) how the app should keep data for use without internet: Smart sync,
/// or saving everything now. The answer can be changed later under Profile >
/// Offline data.
class OfflineChoice {
  static String get _askedKey => OfflineOwner.key('offline_choice_asked_v1');

  static Future<void> askOnce(BuildContext context) async {
    final prefs = await SharedPreferences.getInstance();
    if (prefs.getBool(_askedKey) == true || !context.mounted) return;
    await prefs.setBool(_askedKey, true);
    final choice = await showModalBottomSheet<String>(
      context: context,
      isDismissible: false,
      enableDrag: false,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (_) => const _ChoiceSheet(),
    );
    if (choice == 'all') {
      await OfflineSync.setSmart(true);
      await OfflineSync.setDaily(true); // and kept up to date once a day
      OfflineSync.saveEverything(); // runs in the background
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text('Saving everything for offline use. You can follow it under Profile > Offline data.'),
          behavior: SnackBarBehavior.floating,
        ));
      }
    } else {
      await OfflineSync.setSmart(true);
    }
  }
}

class _ChoiceSheet extends StatelessWidget {
  const _ChoiceSheet();

  static const _teal = Color(0xFF00A6A4);

  Widget _option(BuildContext context,
          {required IconData icon, required String title, required String body, required String value, bool primary = false}) =>
      InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: () => Navigator.pop(context, value),
        child: Container(
          width: double.infinity,
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: primary ? _teal.withAlpha(18) : Colors.white,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: primary ? _teal : Colors.grey.shade300, width: primary ? 1.5 : 1),
          ),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Icon(icon, color: _teal, size: 28),
            const SizedBox(width: 12),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(title, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600)),
                const SizedBox(height: 4),
                Text(body, style: TextStyle(fontSize: 12.5, color: Colors.grey.shade700, height: 1.35)),
              ]),
            ),
          ]),
        ),
      );

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 22, 20, 16),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Text('Use the app without internet', style: TextStyle(fontSize: 19, fontWeight: FontWeight.bold)),
          const SizedBox(height: 6),
          Text('Choose what to keep on this phone, so products, presentations and doctors open even when you are offline.',
              style: TextStyle(fontSize: 13, color: Colors.grey.shade700)),
          const SizedBox(height: 16),
          _option(
            context,
            icon: Icons.sync,
            title: 'Smart sync (recommended)',
            body: 'Keeps your favourite products, the products assigned to your doctors and all presentations, '
                'automatically as you use the app.',
            value: 'smart',
            primary: true,
          ),
          const SizedBox(height: 10),
          _option(
            context,
            icon: Icons.download_for_offline_outlined,
            title: 'Save everything offline',
            body: 'Also saves your orders and the whole product catalogue with images and documents, starting now, '
                'and refreshes it once a day. Uses a lot of data and storage, so Wi-Fi is best.',
            value: 'all',
          ),
          const SizedBox(height: 10),
          Text('You can change this any time under Profile > Offline data.',
              style: TextStyle(fontSize: 11.5, color: Colors.grey.shade500)),
        ]),
      ),
    );
  }
}
