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
  const AdminNotificationsScreen({super.key});

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
      final list = await _service.getHistory();
      if (mounted) setState(() { _history = list; _loadingHistory = false; });
    } catch (_) {
      if (mounted) setState(() => _loadingHistory = false);
    }
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
        onRefresh: _loadHistory,
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
                      onPressed: _sending ? null : _send,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: _ink,
                        foregroundColor: Colors.white,
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                        elevation: 0,
                      ),
                      child: _sending
                          ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                          : const Text('Send Broadcast'),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 24),
            const Text('Recent Broadcasts', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
            const SizedBox(height: 10),
            if (_loadingHistory)
              const Padding(padding: EdgeInsets.all(20), child: Center(child: CircularProgressIndicator(color: _teal)))
            else if (_history.isEmpty)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 30),
                child: Center(child: Text('No notifications sent yet', style: TextStyle(color: Colors.grey.shade400))),
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
