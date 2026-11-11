import 'package:flutter/material.dart';
import '../../services/offline_background.dart';
import '../../services/offline_files.dart';
import '../../services/offline_sync.dart';

/// Profile > Offline data: how the app keeps things for use without
/// internet (Smart sync or Manual), Wi-Fi only or mobile data too, saving
/// everything at once or once a day, and clearing
/// it all. See services/offline_sync.dart.
class OfflineDataScreen extends StatefulWidget {
  const OfflineDataScreen({super.key});

  @override
  State<OfflineDataScreen> createState() => _OfflineDataScreenState();
}

class _OfflineDataScreenState extends State<OfflineDataScreen> {
  static const _teal = Color(0xFF00A6A4);
  bool _smart = OfflineSync.smart;
  bool _wifiOnly = OfflineSync.wifiOnly;
  bool _daily = false;
  DateTime? _lastSaved;
  (int, int)? _counts;
  bool _deleting = false;

  @override
  void initState() {
    super.initState();
    _refresh();
  }

  Future<void> _refresh() async {
    final c = await OfflineSync.counts();
    final daily = await OfflineSync.daily();
    final last = await OfflineSync.lastSaved();
    if (mounted) {
      setState(() {
        _counts = c;
        _daily = daily;
        _lastSaved = last;
      });
    }
  }

  String _ago(DateTime t) {
    final d = DateTime.now().difference(t);
    if (d.inMinutes < 1) return 'just now';
    if (d.inHours < 1) return '${d.inMinutes} min ago';
    if (d.inDays < 1) return '${d.inHours} hr ago';
    return d.inDays == 1 ? 'yesterday' : '${d.inDays} days ago';
  }

  void _snack(String text) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(text), backgroundColor: _teal, behavior: SnackBarBehavior.floating));
  }

  Future<void> _saveEverything() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Save everything offline?'),
        content: const Text('This saves your doctors and their products, your orders, all presentations and the whole '
            'product catalogue with its images and documents. It can use a lot of mobile data and storage, so Wi-Fi is '
            'best. You can keep using the app while it runs.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          TextButton(
              onPressed: () => Navigator.pop(ctx, true), child: const Text('Save', style: TextStyle(color: _teal))),
        ],
      ),
    );
    if (ok != true) return;
    await OfflineSync.saveEverything();
    await _refresh();
    _snack('Everything has been saved for offline use.');
  }

  Future<void> _deleteAll() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete all offline data?'),
        content: Text(_smart
            ? 'Saved products, presentations, doctors and orders will be removed from this phone. Smart sync will start '
                'saving them again as you use the app online.'
            : 'Saved products, presentations, doctors and orders will be removed from this phone.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          TextButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Delete', style: TextStyle(color: Colors.red))),
        ],
      ),
    );
    if (ok != true) return;
    setState(() => _deleting = true);
    try {
      await OfflineSync.deleteAll();
      _snack('All offline data has been deleted from this phone.');
    } finally {
      if (mounted) setState(() => _deleting = false);
      await _refresh();
    }
  }

  Widget _card(List<Widget> children) => Container(
        margin: const EdgeInsets.only(bottom: 14),
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: Colors.grey.shade200)),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: children),
      );

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.grey.shade50,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        foregroundColor: Colors.black,
        title: const Text('Offline data', style: TextStyle(fontWeight: FontWeight.w600)),
      ),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        _card([
          const Text('Saving mode', style: TextStyle(fontWeight: FontWeight.w600)),
          RadioListTile<bool>(
            contentPadding: EdgeInsets.zero,
            value: true,
            groupValue: _smart,
            activeColor: _teal,
            title: const Text('Smart sync'),
            subtitle:
                const Text('Automatically keeps your favourite products, the products assigned to your doctors and all '
                    'presentations on this phone, as you use the app online.'),
            onChanged: (v) async {
              await OfflineSync.setSmart(true);
              setState(() => _smart = true);
            },
          ),
          RadioListTile<bool>(
            contentPadding: EdgeInsets.zero,
            value: false,
            groupValue: _smart,
            activeColor: _teal,
            title: const Text('Manual'),
            subtitle: const Text('Keeps only what you download yourself, such as a presentation you tap download on.'),
            onChanged: (v) async {
              await OfflineSync.setSmart(false);
              setState(() => _smart = false);
            },
          ),
        ]),
        _card([
          const Text('Download over', style: TextStyle(fontWeight: FontWeight.w600)),
          RadioListTile<bool>(
            contentPadding: EdgeInsets.zero,
            value: false,
            groupValue: _wifiOnly,
            activeColor: _teal,
            title: const Text('Wi-Fi or mobile data'),
            subtitle: const Text('Downloads automatically on any connection.'),
            onChanged: (v) async {
              await OfflineSync.setWifiOnly(false);
              OfflineBackground.schedule();
              setState(() => _wifiOnly = false);
            },
          ),
          RadioListTile<bool>(
            contentPadding: EdgeInsets.zero,
            value: true,
            groupValue: _wifiOnly,
            activeColor: _teal,
            title: const Text('Wi-Fi only'),
            subtitle: const Text('Smart sync and the daily save wait for Wi-Fi, to save mobile data. Tapping '
                '"Save everything offline" below still works on any connection.'),
            onChanged: (v) async {
              await OfflineSync.setWifiOnly(true);
              OfflineBackground.schedule();
              setState(() => _wifiOnly = true);
            },
          ),
        ]),
        _card([
          const Text('Save everything now', style: TextStyle(fontWeight: FontWeight.w600)),
          const SizedBox(height: 4),
          Text(
              'Your doctors and their products, your orders, all presentations and the whole product catalogue with images '
              'and documents.',
              style: TextStyle(fontSize: 13, color: Colors.grey.shade700)),
          const SizedBox(height: 12),
          ValueListenableBuilder<String?>(
            valueListenable: OfflineSync.status,
            builder: (_, step, __) => step == null
                ? SizedBox(
                    width: double.infinity,
                    height: 46,
                    child: ElevatedButton.icon(
                      onPressed: _saveEverything,
                      icon: const Icon(Icons.download_for_offline_outlined, size: 20),
                      label: const Text('Save everything offline'),
                      style:
                          ElevatedButton.styleFrom(backgroundColor: _teal, foregroundColor: Colors.white, elevation: 0),
                    ),
                  )
                : Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(step, style: const TextStyle(fontSize: 13)),
                    const SizedBox(height: 8),
                    ValueListenableBuilder<(int, int)?>(
                      valueListenable: OfflineFiles.progress,
                      builder: (_, p, __) => Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        LinearProgressIndicator(value: p != null && p.$2 > 0 ? p.$1 / p.$2 : null, color: _teal),
                        if (p != null)
                          Padding(
                            padding: const EdgeInsets.only(top: 4),
                            child: Text('${p.$1} of ${p.$2} files',
                                style: TextStyle(fontSize: 11.5, color: Colors.grey.shade600)),
                          ),
                      ]),
                    ),
                  ]),
          ),
          const SizedBox(height: 4),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            value: _daily,
            activeThumbColor: _teal,
            title: const Text('Save everything once a day'),
            subtitle: Text([
              'New products and orders are saved automatically${_wifiOnly ? ' on Wi-Fi' : ''}, also while the app is '
                  'closed (when the phone allows it).',
              if (_lastSaved != null) 'Last saved ${_ago(_lastSaved!)}.',
            ].join(' ')),
            onChanged: (v) async {
              await OfflineSync.setDaily(v);
              setState(() => _daily = v);
            },
          ),
        ]),
        _card([
          const Text('On this phone', style: TextStyle(fontWeight: FontWeight.w600)),
          const SizedBox(height: 6),
          if (_counts == null)
            const LinearProgressIndicator(color: _teal)
          else ...[
            Text('${_counts!.$1} products saved', style: const TextStyle(fontSize: 13.5)),
            Text('${_counts!.$2} presentations downloaded', style: const TextStyle(fontSize: 13.5)),
          ],
          const SizedBox(height: 12),
          SizedBox(
            width: double.infinity,
            height: 44,
            child: OutlinedButton.icon(
              onPressed: _deleting || OfflineSync.status.value != null ? null : _deleteAll,
              icon: const Icon(Icons.delete_outline, color: Colors.red, size: 20),
              label:
                  Text(_deleting ? 'Deleting…' : 'Delete all offline data', style: const TextStyle(color: Colors.red)),
            ),
          ),
        ]),
      ]),
    );
  }
}
