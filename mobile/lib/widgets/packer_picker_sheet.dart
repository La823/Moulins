import 'package:flutter/material.dart';
import '../services/staff_service.dart';

const _teal = Color(0xFF00A6A4);

/// Choosing who packs an order when it is sent to packing: each dispatch
/// member with today's attendance (fingerprint machine) and their open
/// orders, or Auto (the rotation). Returns the chosen user id, '' for Auto,
/// or null when cancelled. Same as the website's PackerPicker.
Future<String?> pickPacker(BuildContext context) {
  return showModalBottomSheet<String>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    showDragHandle: true,
    backgroundColor: Colors.white,
    builder: (_) => const _PackerSheet(),
  );
}

class _PackerSheet extends StatefulWidget {
  const _PackerSheet();

  @override
  State<_PackerSheet> createState() => _PackerSheetState();
}

class _PackerSheetState extends State<_PackerSheet> {
  List<Packer>? _packers;
  String? _error;
  String _pick = '';

  @override
  void initState() {
    super.initState();
    StaffService().packers().then((p) {
      if (mounted) setState(() => _packers = p);
    }).catchError((Object e) {
      if (mounted) setState(() => _error = staffError(e));
    });
  }

  Widget _option(String value, Widget title, Widget? subtitle) => RadioListTile<String>(
        value: value,
        groupValue: _pick,
        onChanged: (v) => setState(() => _pick = v ?? ''),
        activeColor: _teal,
        contentPadding: const EdgeInsets.symmetric(horizontal: 8),
        title: title,
        subtitle: subtitle,
      );

  @override
  Widget build(BuildContext context) {
    final list = [...?_packers]..sort((a, b) {
        int rank(Packer p) => p.onLeave ? 3 : (!p.linked ? 1 : (p.firstIn != null ? 0 : 2));
        final r = rank(a).compareTo(rank(b));
        return r != 0 ? r : (a.open != b.open ? a.open.compareTo(b.open) : a.name.compareTo(b.name));
      });
    return ConstrainedBox(
      constraints: BoxConstraints(maxHeight: MediaQuery.of(context).size.height * 0.8),
      child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        const Padding(
          padding: EdgeInsets.fromLTRB(20, 0, 20, 2),
          child: Text('Send to packing', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 8),
          child: Text("Choose who packs it. Today's attendance is from the fingerprint machine.",
              style: TextStyle(fontSize: 12.5, color: Colors.grey.shade600)),
        ),
        Flexible(
          child: _error != null
              ? Padding(padding: const EdgeInsets.all(20), child: Text(_error!, style: const TextStyle(color: Colors.red)))
              : _packers == null
                  ? const Padding(padding: EdgeInsets.all(30), child: Center(child: CircularProgressIndicator(color: _teal)))
                  : ListView(shrinkWrap: true, padding: const EdgeInsets.symmetric(horizontal: 12), children: [
                      _option('', const Text('Auto (rotation)', style: TextStyle(fontWeight: FontWeight.w600)),
                          const Text('The next person in turn who is present today')),
                      for (final p in list)
                        _option(
                          p.id,
                          Row(children: [
                            Expanded(child: Text(p.name, style: const TextStyle(fontWeight: FontWeight.w600))),
                            Text('${p.open} open', style: TextStyle(fontSize: 12, color: Colors.grey.shade600)),
                          ]),
                          Row(children: [
                            Container(width: 7, height: 7, decoration: BoxDecoration(color: p.dayColor, shape: BoxShape.circle)),
                            const SizedBox(width: 6),
                            Flexible(
                              child: Text('${p.dayText}${p.skip ? ' · out of rotation' : ''}',
                                  style: TextStyle(fontSize: 12.5, color: p.dayColor)),
                            ),
                          ]),
                        ),
                    ]),
        ),
        SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 12),
            child: Row(children: [
              Expanded(child: OutlinedButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel'))),
              const SizedBox(width: 10),
              Expanded(
                child: ElevatedButton(
                  onPressed: _packers == null && _error == null ? null : () => Navigator.pop(context, _pick),
                  style: ElevatedButton.styleFrom(backgroundColor: _teal, foregroundColor: Colors.white, elevation: 0),
                  child: const Text('Send to packing'),
                ),
              ),
            ]),
          ),
        ),
      ]),
    );
  }
}
