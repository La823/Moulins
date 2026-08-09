import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../models/admin_user.dart';
import '../../services/admin_service.dart';
import '../../utils/validators.dart';

const _teal = Color(0xFF00A6A4);

const _statusColors = {
  'pending': Color(0xFFB45309),
  'confirmed': Color(0xFF1D4ED8),
  'transferred': Color(0xFF4F46E5),
  'shipped': Color(0xFF7C3AED),
  'delivered': Color(0xFF15803D),
  'cancelled': Color(0xFFB91C1C),
  'refunded': Color(0xFFC2410C),
};

class AdminPartnerDetailScreen extends StatefulWidget {
  final String partnerId;
  const AdminPartnerDetailScreen({super.key, required this.partnerId});

  @override
  State<AdminPartnerDetailScreen> createState() => _AdminPartnerDetailScreenState();
}

class _AdminPartnerDetailScreenState extends State<AdminPartnerDetailScreen> {
  final _service = AdminService();
  AdminPartner? _partner;
  bool _loading = true;
  bool _showPassword = false;
  bool _editingPassword = false;
  final _passwordCtrl = TextEditingController();
  bool _savingPassword = false;
  String? _passwordError;
  bool _deleting = false;
  Map<String, String>? _ledger;
  String? _verifyingDoc;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _passwordCtrl.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final c = await _service.getPartnerDetail(widget.partnerId);
      setState(() { _partner = c; _loading = false; });
      _service.getPartnerLedger(widget.partnerId).then((l) {
        if (mounted) setState(() => _ledger = l);
      }).catchError((_) {});
    } catch (_) {
      setState(() => _loading = false);
    }
  }

  Future<void> _savePassword() async {
    final issue = Validators.passwordError(_passwordCtrl.text);
    if (issue != null) {
      setState(() => _passwordError = issue);
      return;
    }
    setState(() { _savingPassword = true; _passwordError = null; });
    try {
      await _service.updatePartnerPassword(widget.partnerId, _passwordCtrl.text);
      setState(() { _editingPassword = false; _savingPassword = false; });
      _passwordCtrl.clear();
      _load();
    } catch (e) {
      setState(() => _savingPassword = false);
      _showError('Could not update password');
    }
  }

  Future<void> _verifyDoc(String docType, bool isVerified, String? reason) async {
    setState(() => _verifyingDoc = docType);
    try {
      await _service.verifyPartnerDocument(widget.partnerId, docType, isVerified, reason);
      await _load();
    } catch (_) {
      _showError('Could not update document');
    } finally {
      if (mounted) setState(() => _verifyingDoc = null);
    }
  }

  Future<void> _delete() async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Delete partner?'),
        content: Text('This will permanently delete "${_partner?.displayName}". This cannot be undone.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          TextButton(onPressed: () => Navigator.pop(context, true), child: const Text('Delete', style: TextStyle(color: Colors.red))),
        ],
      ),
    );
    if (confirm != true) return;
    setState(() => _deleting = true);
    try {
      await _service.deletePartner(widget.partnerId);
      if (mounted) Navigator.of(context).pop();
    } catch (_) {
      setState(() => _deleting = false);
      _showError('Could not delete partner');
    }
  }

  void _showError(String msg) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg), backgroundColor: Colors.red));
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Scaffold(body: Center(child: CircularProgressIndicator(color: _teal)));
    final c = _partner;
    if (c == null) return const Scaffold(body: Center(child: Text('Partner not found')));

    return Scaffold(
      backgroundColor: Colors.grey.shade50,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        foregroundColor: Colors.black,
        title: Text(c.displayName, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        color: _teal,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            // Profile card
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12)),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      CircleAvatar(radius: 26, backgroundColor: _teal.withValues(alpha: 0.12), child: Text(c.displayName.isNotEmpty ? c.displayName[0].toUpperCase() : '?', style: const TextStyle(color: _teal, fontWeight: FontWeight.bold, fontSize: 18))),
                      const SizedBox(width: 14),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(c.displayName, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                            Text(c.role, style: TextStyle(fontSize: 12, color: Colors.grey.shade500)),
                          ],
                        ),
                      ),
                    ],
                  ),
                  const Divider(height: 24),
                  _infoRow('Phone', c.phoneNumber),
                  if (c.email != null) _infoRow('Email', c.email!),
                  _infoRow('Joined', _fmtDate(c.createdAt)),
                  _infoRow('Last login', c.lastLoginAt != null ? _fmtDate(c.lastLoginAt!) : 'Never'),
                ],
              ),
            ),
            const SizedBox(height: 12),

            // Credentials
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12)),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text('Login Credentials', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
                      TextButton(onPressed: () => setState(() => _showPassword = !_showPassword), child: Text(_showPassword ? 'Hide' : 'Show', style: const TextStyle(fontSize: 12))),
                    ],
                  ),
                  const SizedBox(height: 8),
                  if (_editingPassword) ...[
                    TextField(
                      controller: _passwordCtrl,
                      onChanged: (_) => setState(() => _passwordError = null),
                      decoration: InputDecoration(
                        hintText: 'New password (min 8, upper/lower/number/special)',
                        isDense: true,
                        border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                      ),
                    ),
                    if (_passwordError != null) ...[
                      const SizedBox(height: 6),
                      Text(_passwordError!, style: const TextStyle(color: Colors.red, fontSize: 12)),
                    ],
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        TextButton(onPressed: _savingPassword ? null : _savePassword, child: Text(_savingPassword ? 'Saving...' : 'Save')),
                        TextButton(onPressed: () => setState(() { _editingPassword = false; _passwordError = null; }), child: const Text('Cancel')),
                      ],
                    ),
                  ] else
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(_showPassword ? (c.plainPassword ?? 'Not available') : '••••••••', style: const TextStyle(fontFamily: 'monospace', fontSize: 13)),
                        TextButton(onPressed: () => setState(() => _editingPassword = true), child: const Text('Edit', style: TextStyle(fontSize: 12))),
                      ],
                    ),
                ],
              ),
            ),
            const SizedBox(height: 12),

            // Documents
            if (c.documents.isNotEmpty) ...[
              const Text('Documents', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
              const SizedBox(height: 8),
              for (final doc in c.documents) _documentCard(doc),
              const SizedBox(height: 12),
            ],

            // Ledger
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12)),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('Account Ledger', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
                  const SizedBox(height: 8),
                  _ledger == null
                      ? Text('No ledger uploaded yet', style: TextStyle(fontSize: 12.5, color: Colors.grey.shade400))
                      : GestureDetector(
                          onTap: () => launchUrl(Uri.parse(_ledger!['file_url']!), mode: LaunchMode.externalApplication),
                          child: Row(
                            children: [
                              const Icon(Icons.picture_as_pdf_outlined, color: Colors.red, size: 18),
                              const SizedBox(width: 8),
                              const Text('View ledger', style: TextStyle(fontSize: 13, color: _teal, fontWeight: FontWeight.w600)),
                            ],
                          ),
                        ),
                ],
              ),
            ),
            const SizedBox(height: 12),

            // Orders
            Text('Orders (${c.orders.length})', style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
            const SizedBox(height: 8),
            if (c.orders.isEmpty)
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12)),
                child: Text('No orders yet', style: TextStyle(fontSize: 12.5, color: Colors.grey.shade400)),
              )
            else
              for (final o in c.orders)
                Container(
                  margin: const EdgeInsets.only(bottom: 8),
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(10)),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('#${o.id.substring(0, 8).toUpperCase()}', style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600)),
                          Text('${o.itemCount} item${o.itemCount != 1 ? 's' : ''} · ${_fmtDate(o.createdAt)}', style: TextStyle(fontSize: 11.5, color: Colors.grey.shade500)),
                        ],
                      ),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                        decoration: BoxDecoration(color: (_statusColors[o.status] ?? Colors.grey).withValues(alpha: 0.12), borderRadius: BorderRadius.circular(20)),
                        child: Text(o.status, style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.w600, color: _statusColors[o.status] ?? Colors.grey.shade700)),
                      ),
                    ],
                  ),
                ),

            const SizedBox(height: 20),
            SizedBox(
              width: double.infinity,
              child: OutlinedButton(
                onPressed: _deleting ? null : _delete,
                style: OutlinedButton.styleFrom(foregroundColor: Colors.red, side: const BorderSide(color: Colors.red)),
                child: Text(_deleting ? 'Deleting...' : 'Delete Partner'),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _documentCard(PartnerDocument doc) {
    final label = doc.docType == 'LICENSE' ? 'Drug License' : 'GST Certificate';
    final busy = _verifyingDoc == doc.docType;
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(label, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: doc.isVerified ? Colors.green.shade50 : doc.rejectionReason != null ? Colors.red.shade50 : Colors.orange.shade50,
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Text(
                  doc.isVerified ? 'Verified' : doc.rejectionReason != null ? 'Rejected' : 'Pending',
                  style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.w600, color: doc.isVerified ? Colors.green.shade700 : doc.rejectionReason != null ? Colors.red.shade700 : Colors.orange.shade700),
                ),
              ),
            ],
          ),
          if (doc.docNumber != null) Text('No: ${doc.docNumber}', style: TextStyle(fontSize: 11.5, color: Colors.grey.shade500)),
          if (doc.photoUrl != null) ...[
            const SizedBox(height: 6),
            GestureDetector(
              onTap: () => launchUrl(Uri.parse(doc.photoUrl!), mode: LaunchMode.externalApplication),
              child: const Text('View document photo →', style: TextStyle(fontSize: 12, color: _teal)),
            ),
          ],
          if (!doc.isVerified) ...[
            const SizedBox(height: 10),
            Row(
              children: [
                TextButton(
                  onPressed: busy ? null : () => _verifyDoc(doc.docType, true, null),
                  style: TextButton.styleFrom(foregroundColor: Colors.green.shade700, padding: EdgeInsets.zero, minimumSize: const Size(0, 0)),
                  child: Text(busy ? '...' : 'Approve'),
                ),
                const SizedBox(width: 16),
                TextButton(
                  onPressed: busy ? null : () => _verifyDoc(doc.docType, false, 'Needs re-verification'),
                  style: TextButton.styleFrom(foregroundColor: Colors.red.shade700, padding: EdgeInsets.zero, minimumSize: const Size(0, 0)),
                  child: const Text('Reject'),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }

  Widget _infoRow(String label, String value) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 4),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(label, style: TextStyle(fontSize: 12.5, color: Colors.grey.shade500)),
            Flexible(child: Text(value, style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w500), textAlign: TextAlign.right)),
          ],
        ),
      );

  String _fmtDate(String iso) {
    final dt = DateTime.tryParse(iso);
    if (dt == null) return iso;
    return '${dt.day}/${dt.month}/${dt.year}';
  }
}
