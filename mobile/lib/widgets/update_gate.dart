import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import '../config/app_flavor.dart';
import '../services/app_update.dart';

/// Wraps the whole app (MaterialApp.router's builder) and checks for an
/// update on open and whenever the app comes back to the foreground:
/// - below the minimum build: a full screen "Update required" over the app
/// - below the latest build: a card at the bottom, Update or Later (Later
///   hides it until the app is opened again)
/// Builds and texts come from the website's App Versions page.
class UpdateGate extends StatefulWidget {
  final Widget child;
  const UpdateGate({super.key, required this.child});

  @override
  State<UpdateGate> createState() => _UpdateGateState();
}

class _UpdateGateState extends State<UpdateGate> with WidgetsBindingObserver {
  final _service = AppUpdateService();
  UpdateStatus? _status;
  bool _later = false;
  DateTime? _lastCheck;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _check();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // back from the background: check again, at most every 10 minutes,
    // and always while blocked (the person may have just updated)
    if (state != AppLifecycleState.resumed) return;
    final last = _lastCheck;
    if (_status?.required == true || last == null || DateTime.now().difference(last) > const Duration(minutes: 10)) {
      _check();
    }
  }

  Future<void> _check() async {
    _lastCheck = DateTime.now();
    final s = await _service.check();
    if (mounted) setState(() => _status = s);
  }

  Future<void> _open() async {
    final url = _status?.url ?? '';
    if (url.isEmpty) return;
    final uri = Uri.tryParse(url);
    if (uri != null) await launchUrl(uri, mode: LaunchMode.externalApplication);
  }

  @override
  Widget build(BuildContext context) {
    final s = _status;
    return Stack(children: [
      widget.child,
      if (s != null && s.required) Positioned.fill(child: _requiredScreen(s)),
      if (s != null && !s.required && s.available && !_later)
        Positioned(left: 12, right: 12, bottom: 12, child: SafeArea(top: false, child: _availableCard(s))),
    ]);
  }

  String _versionText(UpdateStatus s) => s.latestName.isEmpty ? 'A new version' : 'Version ${s.latestName}';

  Widget _requiredScreen(UpdateStatus s) {
    const teal = Color(0xFF00A6A4);
    const accent = isTeamApp ? Color(0xFFB71C1C) : teal;
    return Material(
      color: Colors.white,
      child: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(28),
          child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
            Container(
              width: 84,
              height: 84,
              decoration: BoxDecoration(color: accent.withValues(alpha: 0.1), shape: BoxShape.circle),
              child: const Icon(Icons.system_update, size: 44, color: accent),
            ),
            const SizedBox(height: 24),
            const Text('Update required', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w700)),
            const SizedBox(height: 10),
            Text(
              s.message.isNotEmpty ? s.message : '${_versionText(s)} of $appName is available. Please update to keep using the app.',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 15, height: 1.4, color: Colors.grey.shade700),
            ),
            const SizedBox(height: 28),
            SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                style: FilledButton.styleFrom(backgroundColor: accent, padding: const EdgeInsets.symmetric(vertical: 14)),
                onPressed: s.url.isEmpty ? null : _open,
                icon: const Icon(Icons.download),
                label: const Text('Update now', style: TextStyle(fontSize: 16)),
              ),
            ),
            const SizedBox(height: 12),
            TextButton(onPressed: _check, child: const Text('I have updated, check again')),
          ]),
        ),
      ),
    );
  }

  Widget _availableCard(UpdateStatus s) {
    const accent = isTeamApp ? Color(0xFFB71C1C) : Color(0xFF00A6A4);
    return Material(
      elevation: 6,
      borderRadius: BorderRadius.circular(14),
      color: Colors.white,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 12, 8, 8),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
          Row(children: [
            const Icon(Icons.system_update, color: accent),
            const SizedBox(width: 10),
            Expanded(
              child: Text('${_versionText(s)} is available', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
            ),
          ]),
          if (s.message.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(left: 34, top: 4),
              child: Text(s.message, style: TextStyle(fontSize: 13, color: Colors.grey.shade700)),
            ),
          Row(mainAxisAlignment: MainAxisAlignment.end, children: [
            TextButton(onPressed: () => setState(() => _later = true), child: const Text('Later')),
            FilledButton(
              style: FilledButton.styleFrom(backgroundColor: accent),
              onPressed: s.url.isEmpty ? null : _open,
              child: const Text('Update'),
            ),
          ]),
        ]),
      ),
    );
  }
}
