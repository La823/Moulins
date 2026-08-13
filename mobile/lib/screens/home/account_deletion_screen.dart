import 'package:flutter/material.dart';
import '../../services/account_deletion_service.dart';

const _teal = Color(0xFF00A6A4);
const _ink = Color(0xFF1A1A1A);

class AccountDeletionScreen extends StatefulWidget {
  const AccountDeletionScreen({super.key});

  @override
  State<AccountDeletionScreen> createState() => _AccountDeletionScreenState();
}

class _AccountDeletionScreenState extends State<AccountDeletionScreen> {
  final _service = AccountDeletionService();
  final _reasonCtrl = TextEditingController();
  DeletionRequest? _request;
  bool _loading = true;
  bool _submitting = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final req = await _service.getMyRequest();
      if (mounted) setState(() { _request = req; _loading = false; });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _submit() async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Submit deletion request?'),
        content: const Text('Our team will review your request before your account and data are removed. This is not instant.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Submit', style: TextStyle(color: Colors.red))),
        ],
      ),
    );
    if (confirm != true) return;

    setState(() { _submitting = true; _error = null; });
    try {
      await _service.submitRequest(reason: _reasonCtrl.text.trim());
      _reasonCtrl.clear();
      await _load();
    } catch (e) {
      setState(() { _submitting = false; _error = 'Could not submit request: $e'; });
      return;
    }
    setState(() => _submitting = false);
  }

  Future<void> _cancel() async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Cancel deletion request?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('No')),
          TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Yes, cancel')),
        ],
      ),
    );
    if (confirm != true) return;

    try {
      await _service.cancelRequest();
      _load();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Could not cancel request: $e'), backgroundColor: Colors.red),
        );
      }
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
        title: const Text('Delete Account', style: TextStyle(color: _ink, fontWeight: FontWeight.w600)),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: _teal))
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                Text(
                  'Submit a request to permanently delete your account and all associated data. Our team reviews every request before anything is removed.',
                  style: TextStyle(fontSize: 13.5, color: Colors.grey.shade600, height: 1.5),
                ),
                const SizedBox(height: 20),
                if (_request?.status == 'pending') ...[
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(color: const Color(0xFFFFF7E6), borderRadius: BorderRadius.circular(12), border: Border.all(color: const Color(0xFFFCE3A6))),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('Deletion request pending review', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13.5, color: Color(0xFF92600B))),
                        const SizedBox(height: 6),
                        Text('Submitted ${_request!.requestedAt.split('T').first}', style: const TextStyle(fontSize: 12, color: Color(0xFF92600B))),
                        if (_request!.reason != null && _request!.reason!.isNotEmpty) ...[
                          const SizedBox(height: 6),
                          Text('"${_request!.reason}"', style: const TextStyle(fontSize: 12, color: Color(0xFF92600B), fontStyle: FontStyle.italic)),
                        ],
                        const SizedBox(height: 10),
                        TextButton(
                          onPressed: _cancel,
                          style: TextButton.styleFrom(padding: EdgeInsets.zero, minimumSize: const Size(0, 0), tapTargetSize: MaterialTapTargetSize.shrinkWrap),
                          child: const Text('Cancel request', style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: Color(0xFF92600B), decoration: TextDecoration.underline)),
                        ),
                      ],
                    ),
                  ),
                ] else ...[
                  if (_request?.status == 'rejected') ...[
                    Container(
                      padding: const EdgeInsets.all(16),
                      margin: const EdgeInsets.only(bottom: 16),
                      decoration: BoxDecoration(color: Colors.grey.shade100, borderRadius: BorderRadius.circular(12)),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text('Your last request was declined', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13.5)),
                          if (_request!.adminNotes != null && _request!.adminNotes!.isNotEmpty) ...[
                            const SizedBox(height: 6),
                            Text('"${_request!.adminNotes}"', style: TextStyle(fontSize: 12, color: Colors.grey.shade600)),
                          ],
                        ],
                      ),
                    ),
                  ],
                  TextField(
                    controller: _reasonCtrl,
                    maxLines: 3,
                    decoration: InputDecoration(
                      labelText: 'Reason (optional)',
                      hintText: "Let us know why you're leaving...",
                      filled: true,
                      fillColor: Colors.white,
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide(color: Colors.grey.shade200)),
                    ),
                  ),
                  if (_error != null) ...[
                    const SizedBox(height: 10),
                    Text(_error!, style: const TextStyle(color: Colors.red, fontSize: 12.5)),
                  ],
                  const SizedBox(height: 16),
                  SizedBox(
                    width: double.infinity,
                    height: 46,
                    child: OutlinedButton(
                      onPressed: _submitting ? null : _submit,
                      style: OutlinedButton.styleFrom(foregroundColor: Colors.red, side: const BorderSide(color: Colors.red)),
                      child: _submitting
                          ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.red))
                          : const Text('Request Account Deletion'),
                    ),
                  ),
                ],
              ],
            ),
    );
  }
}
