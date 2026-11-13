import 'package:flutter/material.dart';
import '../../models/team_member.dart';
import '../../services/team_service.dart';

const _teal = Color(0xFF00A6A4);
const _ink = Color(0xFF1A1A1A);

/// A partner decides what one team member may do: add doctors / retailers,
/// where their orders go (to the partner, to Moulins, or both — they choose
/// each time), and which doctors and retailers they see. Saved with
/// PUT /team/{id}/settings; the server enforces all of it.
class TeamMemberSettingsScreen extends StatefulWidget {
  final TeamMember member;
  const TeamMemberSettingsScreen({super.key, required this.member});

  @override
  State<TeamMemberSettingsScreen> createState() => _TeamMemberSettingsScreenState();
}

class _VisItem {
  final String id;
  final String name;
  final String detail;
  bool visible;
  _VisItem(this.id, this.name, this.detail, this.visible);
}

class _TeamMemberSettingsScreenState extends State<TeamMemberSettingsScreen> {
  final _service = TeamService();
  bool _loading = true;
  bool _saving = false;
  String? _error;

  bool _canAddDoctors = true;
  bool _canAddRetailers = false;
  bool _orderToPartner = true;
  bool _orderToMoulins = false;
  List<_VisItem> _doctors = [];
  List<_VisItem> _retailers = [];
  String _doctorQuery = '';
  String _retailerQuery = '';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final d = await _service.getMemberSettings(widget.member.id);
      List<_VisItem> items(dynamic list) => (list as List<dynamic>? ?? [])
          .map((e) => _VisItem(e['id'] ?? '', e['name'] ?? '', e['detail'] ?? '', e['hidden'] != true))
          .toList();
      setState(() {
        _canAddDoctors = d['can_add_doctors'] == true;
        _canAddRetailers = d['can_add_retailers'] == true;
        _orderToPartner = d['order_to_partner'] == true;
        _orderToMoulins = d['order_to_moulins'] == true;
        _doctors = items(d['doctors']);
        _retailers = items(d['retailers']);
        _loading = false;
      });
    } catch (e) {
      setState(() {
        _loading = false;
        _error = TeamService.messageOf(e, fallback: 'Could not load the settings. Pull down to try again.');
      });
    }
  }

  Future<void> _save() async {
    if (!_orderToPartner && !_orderToMoulins) {
      _snack('Their orders must go somewhere: to you, to Moulins, or both.', error: true);
      return;
    }
    setState(() => _saving = true);
    try {
      await _service.saveMemberSettings(
        widget.member.id,
        canAddDoctors: _canAddDoctors,
        canAddRetailers: _canAddRetailers,
        orderToPartner: _orderToPartner,
        orderToMoulins: _orderToMoulins,
        hiddenDoctorIds: _doctors.where((d) => !d.visible).map((d) => d.id).toList(),
        hiddenRetailerIds: _retailers.where((r) => !r.visible).map((r) => r.id).toList(),
      );
      if (mounted) {
        _snack('Settings saved.');
        Navigator.of(context).pop();
      }
    } catch (e) {
      _snack(TeamService.messageOf(e, fallback: 'The settings could not be saved. Please try again.'), error: true);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  void _snack(String msg, {bool error = false}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(msg),
      backgroundColor: error ? Colors.red : null,
      behavior: SnackBarBehavior.floating,
    ));
  }

  @override
  Widget build(BuildContext context) {
    final name = widget.member.displayName;
    return Scaffold(
      backgroundColor: Colors.grey.shade50,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        foregroundColor: Colors.black,
        title: Text('$name · Permissions', style: const TextStyle(color: _ink, fontWeight: FontWeight.w600, fontSize: 16)),
        actions: [
          TextButton(
            onPressed: _loading || _saving ? null : _save,
            child: _saving
                ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: _teal))
                : const Text('Save', style: TextStyle(color: _teal, fontWeight: FontWeight.w600)),
          ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: _teal))
          : RefreshIndicator(
              onRefresh: _load,
              color: _teal,
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  if (_error != null)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 12),
                      child: Text(_error!, style: const TextStyle(color: Colors.red)),
                    ),
                  _card('What $name can add', [
                    _switch('Add doctors', 'They can add new doctors to your list.', _canAddDoctors,
                        (v) => setState(() => _canAddDoctors = v)),
                    _switch('Add retailers', 'They can add new retailers (shops) for you.', _canAddRetailers,
                        (v) => setState(() => _canAddRetailers = v)),
                  ]),
                  const SizedBox(height: 14),
                  _card('Where $name\'s orders go', [
                    _switch('Send orders to me', 'You confirm the rates and supply them, like a retailer\'s order.',
                        _orderToPartner, (v) => setState(() => _orderToPartner = v)),
                    _switch('Send orders to Moulins', 'They order from Moulins directly, on your account.', _orderToMoulins,
                        (v) => setState(() => _orderToMoulins = v)),
                    Padding(
                      padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
                      child: Text(
                        _orderToPartner && _orderToMoulins
                            ? 'Both are on: they choose where each order goes.'
                            : !_orderToPartner && !_orderToMoulins
                                ? 'Turn at least one on, or they won\'t be able to order.'
                                : '',
                        style: TextStyle(
                            fontSize: 12,
                            color: !_orderToPartner && !_orderToMoulins ? Colors.red : Colors.grey.shade600),
                      ),
                    ),
                  ]),
                  const SizedBox(height: 14),
                  _visibilityCard('Doctors $name can see', 'doctors', _doctors, _doctorQuery,
                      (q) => setState(() => _doctorQuery = q)),
                  const SizedBox(height: 14),
                  _visibilityCard('Retailers $name can see', 'retailers', _retailers, _retailerQuery,
                      (q) => setState(() => _retailerQuery = q)),
                  const SizedBox(height: 24),
                  SizedBox(
                    height: 48,
                    child: ElevatedButton(
                      onPressed: _saving ? null : _save,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: _teal,
                        foregroundColor: Colors.white,
                        elevation: 0,
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                      ),
                      child: Text(_saving ? 'Saving…' : 'Save settings'),
                    ),
                  ),
                ],
              ),
            ),
    );
  }

  Widget _card(String title, List<Widget> children) => Container(
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: Colors.grey.shade200),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 14, 16, 4),
              child: Text(title, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
            ),
            ...children,
          ],
        ),
      );

  Widget _switch(String title, String subtitle, bool value, ValueChanged<bool> onChanged) => SwitchListTile(
        value: value,
        onChanged: onChanged,
        activeThumbColor: _teal,
        title: Text(title, style: const TextStyle(fontSize: 14)),
        subtitle: Text(subtitle, style: TextStyle(fontSize: 12, color: Colors.grey.shade600)),
      );

  Widget _visibilityCard(String title, String noun, List<_VisItem> items, String query, ValueChanged<String> onQuery) {
    final visible = items.where((i) => i.visible).length;
    final q = query.trim().toLowerCase();
    final shown = q.isEmpty ? items : items.where((i) => '${i.name} ${i.detail}'.toLowerCase().contains(q)).toList();
    return _card(title, [
      Padding(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
        child: Text(
          items.isEmpty ? 'You have no $noun yet.' : '$visible of ${items.length} visible. Untick any they should not see.',
          style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
        ),
      ),
      if (items.length > 8)
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
          child: TextField(
            onChanged: onQuery,
            decoration: InputDecoration(
              isDense: true,
              prefixIcon: const Icon(Icons.search, size: 18),
              hintText: 'Search $noun',
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
            ),
          ),
        ),
      if (items.isNotEmpty)
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 8),
          child: Row(
            children: [
              TextButton(
                onPressed: () => setState(() {
                  for (final i in items) {
                    i.visible = true;
                  }
                }),
                child: const Text('Show all', style: TextStyle(color: _teal, fontSize: 12.5)),
              ),
              TextButton(
                onPressed: () => setState(() {
                  for (final i in items) {
                    i.visible = false;
                  }
                }),
                child: const Text('Hide all', style: TextStyle(color: _teal, fontSize: 12.5)),
              ),
            ],
          ),
        ),
      for (final i in shown)
        CheckboxListTile(
          dense: true,
          value: i.visible,
          activeColor: _teal,
          onChanged: (v) => setState(() => i.visible = v ?? true),
          title: Text(i.name.isEmpty ? '—' : i.name, style: const TextStyle(fontSize: 13.5)),
          subtitle: i.detail.isEmpty ? null : Text(i.detail, style: TextStyle(fontSize: 12, color: Colors.grey.shade600)),
        ),
      const SizedBox(height: 6),
    ]);
  }
}
