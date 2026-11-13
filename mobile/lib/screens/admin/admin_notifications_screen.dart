import 'dart:io';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:http/http.dart' as http;
import 'package:intl/intl.dart';
import '../../models/broadcast_list.dart';
import '../../services/broadcast_list_service.dart';
import '../../services/notification_admin_service.dart';

const _teal = Color(0xFF00A6A4);
const _ink = Color(0xFF1A1A1A);

class AdminNotificationsScreen extends StatefulWidget {
  const AdminNotificationsScreen({super.key, this.canSend = true});

  /// False for staff who may only see sent notifications (notifications_view
  /// without notifications_edit): the form shows, but sending is off.
  final bool canSend;

  @override
  State<AdminNotificationsScreen> createState() => _AdminNotificationsScreenState();
}

class _AdminNotificationsScreenState extends State<AdminNotificationsScreen> {
  final _service = NotificationAdminService();
  final _listService = BroadcastListService();
  final _titleCtrl = TextEditingController();
  final _bodyCtrl = TextEditingController();
  final _deepLinkCtrl = TextEditingController();

  List<BroadcastList> _lists = [];
  String? _listId;
  XFile? _imageFile;
  bool _sending = false;
  String? _error;
  Map<String, dynamic>? _lastResult;

  List<NotificationHistoryItem> _history = [];
  bool _loadingHistory = true;

  // history tab: 'manual' = broadcasts someone sent, 'auto' = system alerts
  String _historyTab = 'manual';
  List<AutoAlertGroup>? _autoAlerts;
  bool _loadingAuto = false;

  @override
  void initState() {
    super.initState();
    _loadHistory();
    _listService.getLists().then((l) {
      if (mounted) setState(() => _lists = l);
    }).catchError((_) {});
  }

  Future<void> _loadHistory() async {
    setState(() => _loadingHistory = true);
    try {
      final list = await _service.getHistory(kind: 'manual');
      if (mounted) setState(() { _history = list; _loadingHistory = false; });
    } catch (_) {
      if (mounted) setState(() => _loadingHistory = false);
    }
  }

  Future<void> _loadAutoAlerts() async {
    setState(() => _loadingAuto = true);
    try {
      final list = await _service.getAutoAlerts();
      if (mounted) setState(() { _autoAlerts = list; _loadingAuto = false; });
    } catch (_) {
      if (mounted) setState(() { _autoAlerts ??= []; _loadingAuto = false; });
    }
  }

  Future<void> _refreshHistory() => _historyTab == 'auto' ? _loadAutoAlerts() : _loadHistory();

  String _when(String? iso) {
    if (iso == null) return '';
    try {
      return DateFormat('d MMM, h:mm a').format(DateTime.parse(iso).toLocal());
    } catch (_) {
      return '';
    }
  }

  Widget _historyTabs() => Row(
        children: [
          for (final t in const [('manual', 'Broadcasts'), ('auto', 'Automatic alerts')]) ...[
            ChoiceChip(
              label: Text(t.$2),
              selected: _historyTab == t.$1,
              selectedColor: _ink,
              labelStyle: TextStyle(color: _historyTab == t.$1 ? Colors.white : _ink, fontSize: 12.5, fontWeight: FontWeight.w500),
              showCheckmark: false,
              onSelected: (_) {
                setState(() => _historyTab = t.$1);
                if (t.$1 == 'auto' && _autoAlerts == null) _loadAutoAlerts();
              },
            ),
            const SizedBox(width: 8),
          ],
        ],
      );

  List<Widget> _autoAlertCards() {
    if (_loadingAuto && _autoAlerts == null) {
      return [const Padding(padding: EdgeInsets.all(20), child: Center(child: CircularProgressIndicator(color: _teal)))];
    }
    final list = _autoAlerts ?? [];
    if (list.isEmpty) {
      return [
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 30),
          child: Center(child: Text('No automatic alerts yet', style: TextStyle(color: Colors.grey.shade400))),
        ),
      ];
    }
    return list.map((a) {
      return Container(
        margin: const EdgeInsets.only(bottom: 10),
        decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12), border: Border.all(color: Colors.grey.shade200)),
        child: Theme(
          data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
          child: ExpansionTile(
            tilePadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 2),
            childrenPadding: const EdgeInsets.fromLTRB(14, 0, 14, 12),
            title: Text(a.title, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13.5)),
            subtitle: Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(a.body, style: TextStyle(fontSize: 12.5, color: Colors.grey.shade600)),
                  const SizedBox(height: 6),
                  Text(
                    'Sent to ${a.recipientCount} ${a.recipientCount == 1 ? 'person' : 'people'} · read by ${a.readCount} · ${_when(a.sentAt)}',
                    style: TextStyle(fontSize: 11, color: Colors.grey.shade400),
                  ),
                ],
              ),
            ),
            children: [
              for (final r in a.recipients)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 3),
                  child: Row(
                    children: [
                      Icon(r.isRead ? Icons.done_all : Icons.circle_outlined, size: 14, color: r.isRead ? Colors.green : Colors.grey.shade400),
                      const SizedBox(width: 8),
                      Expanded(child: Text('${r.username.isEmpty ? '—' : r.username} (${r.role})', style: const TextStyle(fontSize: 12.5))),
                      Text(
                        r.pushDelivered > 0 ? '${r.pushDelivered} device${r.pushDelivered == 1 ? '' : 's'}' : 'no device',
                        style: TextStyle(fontSize: 11, color: Colors.grey.shade500),
                      ),
                    ],
                  ),
                ),
            ],
          ),
        ),
      );
    }).toList();
  }

  Future<void> _pickImage() async {
    final file = await ImagePicker().pickImage(source: ImageSource.gallery, imageQuality: 85);
    if (file != null) setState(() => _imageFile = file);
  }

  Future<void> _send() async {
    final title = _titleCtrl.text.trim();
    final body = _bodyCtrl.text.trim();
    if (title.isEmpty || body.isEmpty) return;

    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Send this notification now?'),
        content: const Text('This cannot be undone.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Send')),
        ],
      ),
    );
    if (confirm != true) return;

    setState(() { _sending = true; _error = null; _lastResult = null; });
    try {
      String? imageKey;
      if (_imageFile != null) {
        final urls = await _service.getUploadUrl(_imageFile!.name);
        final bytes = await File(_imageFile!.path).readAsBytes();
        await http.put(Uri.parse(urls['upload_url']!), body: bytes, headers: {'Content-Type': 'image/jpeg'});
        imageKey = urls['key'];
      }

      final result = await _service.send(
        title: title,
        body: body,
        deepLink: _deepLinkCtrl.text.trim().isEmpty ? null : _deepLinkCtrl.text.trim(),
        imageKey: imageKey,
        broadcastListId: _listId,
      );

      setState(() {
        _sending = false;
        _lastResult = result;
        _titleCtrl.clear();
        _bodyCtrl.clear();
        _deepLinkCtrl.clear();
        _imageFile = null;
        _listId = null;
      });
      _loadHistory();
    } catch (e) {
      setState(() { _sending = false; _error = 'Could not send notification: $e'; });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.grey.shade50,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        foregroundColor: Colors.black,
        title: const Text('Notifications', style: TextStyle(color: _ink, fontWeight: FontWeight.w600)),
      ),
      body: RefreshIndicator(
        onRefresh: _refreshHistory,
        color: _teal,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12), border: Border.all(color: Colors.grey.shade200)),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('Compose Broadcast', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
                  const SizedBox(height: 14),
                  _field(_titleCtrl, 'Title *'),
                  const SizedBox(height: 12),
                  _field(_bodyCtrl, 'Body *', maxLines: 3),
                  const SizedBox(height: 12),
                  DropdownButtonFormField<String?>(
                    initialValue: _listId,
                    decoration: InputDecoration(
                      labelText: 'Audience',
                      filled: true,
                      fillColor: Colors.grey.shade50,
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide(color: Colors.grey.shade200)),
                    ),
                    items: [
                      const DropdownMenuItem<String?>(value: null, child: Text('All partners')),
                      ..._lists.map((l) => DropdownMenuItem<String?>(value: l.id, child: Text('${l.name} (${l.memberCount})'))),
                    ],
                    onChanged: (v) => setState(() => _listId = v),
                  ),
                  const SizedBox(height: 12),
                  _field(_deepLinkCtrl, 'Deep Link (optional)'),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      OutlinedButton.icon(
                        onPressed: _pickImage,
                        icon: const Icon(Icons.image_outlined, size: 18),
                        label: Text(_imageFile == null ? 'Add Image' : 'Change Image'),
                      ),
                      if (_imageFile != null) ...[
                        const SizedBox(width: 10),
                        ClipRRect(
                          borderRadius: BorderRadius.circular(8),
                          child: Image.file(File(_imageFile!.path), width: 44, height: 44, fit: BoxFit.cover),
                        ),
                      ],
                    ],
                  ),
                  if (_error != null) ...[
                    const SizedBox(height: 10),
                    Text(_error!, style: const TextStyle(color: Colors.red, fontSize: 12.5)),
                  ],
                  if (_lastResult != null) ...[
                    const SizedBox(height: 10),
                    Text(
                      'Sent to ${_lastResult!['recipient_count']} recipient(s) '
                      '(${_lastResult!['push_success_count']} push delivered, ${_lastResult!['push_failure_count']} failed).',
                      style: const TextStyle(color: Colors.green, fontSize: 12.5),
                    ),
                  ],
                  const SizedBox(height: 16),
                  SizedBox(
                    width: double.infinity,
                    height: 46,
                    child: ElevatedButton(
                      onPressed: _sending || !widget.canSend ? null : _send,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: _ink,
                        foregroundColor: Colors.white,
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                        elevation: 0,
                      ),
                      child: _sending
                          ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                          : Text(widget.canSend ? 'Send Broadcast' : 'You can view sent notifications only'),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 24),
            const Text('History', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
            const SizedBox(height: 8),
            _historyTabs(),
            const SizedBox(height: 10),
            if (_historyTab == 'auto')
              ..._autoAlertCards()
            else if (_loadingHistory)
              const Padding(padding: EdgeInsets.all(20), child: Center(child: CircularProgressIndicator(color: _teal)))
            else if (_history.isEmpty)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 30),
                child: Center(child: Text('No broadcasts sent yet', style: TextStyle(color: Colors.grey.shade400))),
              )
            else
              ..._history.map((n) {
                String when = '';
                if (n.sentAt != null) {
                  try {
                    when = DateFormat('d MMM, h:mm a').format(DateTime.parse(n.sentAt!));
                  } catch (_) {}
                }
                return Container(
                  margin: const EdgeInsets.only(bottom: 10),
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12), border: Border.all(color: Colors.grey.shade200)),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Expanded(child: Text(n.title, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13.5))),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                            decoration: BoxDecoration(color: _statusColor(n.status).withValues(alpha: 0.1), borderRadius: BorderRadius.circular(8)),
                            child: Text(n.status, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: _statusColor(n.status))),
                          ),
                        ],
                      ),
                      const SizedBox(height: 4),
                      Text(n.body, style: TextStyle(fontSize: 12.5, color: Colors.grey.shade600)),
                      const SizedBox(height: 8),
                      Text(
                        'Sent by ${n.createdByName?.isNotEmpty == true ? n.createdByName : 'System'}'
                        '${n.createdByRole?.isNotEmpty == true ? ' (${n.createdByRole})' : ''} · '
                        '${n.recipientCount} recipients · $when',
                        style: TextStyle(fontSize: 11, color: Colors.grey.shade400),
                      ),
                    ],
                  ),
                );
              }),
          ],
        ),
      ),
    );
  }

  Color _statusColor(String status) {
    switch (status) {
      case 'sent': return Colors.green;
      case 'failed': return Colors.red;
      default: return Colors.orange;
    }
  }

  Widget _field(TextEditingController ctrl, String label, {int maxLines = 1}) => TextField(
        controller: ctrl,
        maxLines: maxLines,
        decoration: InputDecoration(
          labelText: label,
          filled: true,
          fillColor: Colors.grey.shade50,
          border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide(color: Colors.grey.shade200)),
        ),
      );
}
