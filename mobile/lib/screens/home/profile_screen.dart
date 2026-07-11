import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import 'package:http/http.dart' as http;
import 'package:url_launcher/url_launcher.dart';
import '../../providers/auth_provider.dart';
import '../../providers/onboarding_provider.dart';
import '../../models/onboarding.dart';
import '../../config/api.dart';
import '../../services/ledger_service.dart';

class ProfileScreen extends ConsumerStatefulWidget {
  const ProfileScreen({super.key});

  @override
  ConsumerState<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends ConsumerState<ProfileScreen> {
  static const teal = Color(0xFF00A6A4);

  String? _ledgerUrl;
  bool _ledgerLoading = true;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(onboardingProvider.notifier).loadStatus();
    });
    LedgerService().getLedgerUrl().then((url) {
      if (mounted) setState(() { _ledgerUrl = url; _ledgerLoading = false; });
    }).catchError((_) {
      if (mounted) setState(() => _ledgerLoading = false);
    });
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(authProvider).user;
    final onboarding = ref.watch(onboardingProvider);

    return Scaffold(
      backgroundColor: Colors.grey.shade50,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        title: const Text('Profile', style: TextStyle(color: Color(0xFF1A1A1A), fontWeight: FontWeight.w600)),
      ),
      body: ListView(
        children: [
          // User card
          Container(
            color: Colors.white,
            padding: const EdgeInsets.all(20),
            child: Row(
              children: [
                Container(
                  width: 56, height: 56,
                  decoration: const BoxDecoration(color: teal, shape: BoxShape.circle),
                  child: Center(
                    child: Text(
                      (user?.displayName ?? 'U')[0].toUpperCase(),
                      style: const TextStyle(color: Colors.white, fontSize: 24, fontWeight: FontWeight.bold),
                    ),
                  ),
                ),
                const SizedBox(width: 14),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(user?.displayName ?? 'User', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                    Text(user?.phoneNumber ?? '', style: TextStyle(color: Colors.grey.shade500, fontSize: 13)),
                    Container(
                      margin: const EdgeInsets.only(top: 4),
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                      decoration: BoxDecoration(color: const Color(0xFFE8F8F8), borderRadius: BorderRadius.circular(8)),
                      child: Text(user?.role ?? 'customer', style: const TextStyle(fontSize: 11, color: teal, fontWeight: FontWeight.w500)),
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),

          // Verification Journey (customers only)
          if (user?.role == 'customer')
            onboarding.when(
              loading: () => const Center(child: Padding(padding: EdgeInsets.all(16), child: CircularProgressIndicator())),
              error: (e, __) => Container(
                margin: const EdgeInsets.symmetric(horizontal: 16),
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(color: Colors.orange.shade50, borderRadius: BorderRadius.circular(8), border: Border.all(color: Colors.orange.shade200)),
                child: Text('Could not load verification status: $e', style: const TextStyle(fontSize: 12, color: Colors.orange)),
              ),
              data: (status) => _buildVerificationSection(context, status),
            ),

          const SizedBox(height: 16),

          // Account Ledger (customers only)
          if (user?.role == 'customer' && !_ledgerLoading)
            Container(
              color: Colors.white,
              margin: const EdgeInsets.only(bottom: 16),
              child: ListTile(
                leading: Container(
                  width: 40, height: 40,
                  decoration: BoxDecoration(color: teal.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(10)),
                  child: const Icon(Icons.receipt_long_outlined, color: teal, size: 22),
                ),
                title: const Text('Account Ledger', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
                subtitle: Text(
                  _ledgerUrl != null ? 'Tap to view your ledger' : 'No ledger uploaded yet',
                  style: TextStyle(fontSize: 12, color: Colors.grey.shade500),
                ),
                trailing: _ledgerUrl != null ? const Icon(Icons.chevron_right, color: Colors.grey, size: 20) : null,
                onTap: _ledgerUrl != null
                    ? () => launchUrl(Uri.parse(_ledgerUrl!), mode: LaunchMode.externalApplication)
                    : null,
              ),
            ),

          // Menu items
          Container(
            color: Colors.white,
            child: Column(
              children: [
                _menuItem(Icons.shopping_bag_outlined, 'My Orders', () => context.go('/orders')),
                _divider(),
                _menuItem(Icons.person_outlined, 'My Doctors', () => context.go('/doctors')),
                _divider(),
                _menuItem(Icons.calendar_today_outlined, 'My Meetings', () => context.go('/meetings')),
                _divider(),
                _menuItem(Icons.assignment_outlined, 'My Requests', () => context.go('/requests')),
                _divider(),
                _menuItem(Icons.chat_bubble_outline, 'Messages', () => context.go('/chat')),
                _divider(),
                _menuItem(Icons.ondemand_video_outlined, 'Learning', () => context.go('/learning')),
              ],
            ),
          ),
          const SizedBox(height: 16),

          Container(
            color: Colors.white,
            child: _menuItem(Icons.logout, 'Logout', () async {
              await ref.read(authProvider.notifier).logout();
              if (context.mounted) context.go('/login');
            }, color: Colors.red),
          ),

          const SizedBox(height: 32),
          Center(child: Text('Moulins Pharmaceuticals', style: TextStyle(color: Colors.grey.shade400, fontSize: 12))),
          const SizedBox(height: 8),
          Center(child: Text('v1.0.0', style: TextStyle(color: Colors.grey.shade400, fontSize: 11))),
          const SizedBox(height: 24),
        ],
      ),
    );
  }

  Widget _buildVerificationSection(BuildContext context, OnboardingStatus status) {
    final licenseDoc = status.documents.where((d) => d.docType == 'LICENSE').firstOrNull;
    final gstDoc = status.documents.where((d) => d.docType == 'GST').firstOrNull;
    final step = status.onboardingStep;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Journey progress bar
        Container(
          color: Colors.white,
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('Verification Journey', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
              const SizedBox(height: 16),
              Row(
                children: [
                  _stepCircle(1, step, 'Account'),
                  _stepLine(step > 1),
                  _stepCircle(2, step, 'License'),
                  _stepLine(step > 2),
                  _stepCircle(3, step, 'GST'),
                  _stepLine(step > 3),
                  _stepCircle(4, step, 'Verified'),
                ],
              ),
              if (step == 4) ...[
                const SizedBox(height: 12),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                  decoration: BoxDecoration(color: Colors.green.shade50, borderRadius: BorderRadius.circular(8), border: Border.all(color: Colors.green.shade200)),
                  child: const Row(children: [
                    Icon(Icons.verified, color: Colors.green, size: 16),
                    SizedBox(width: 8),
                    Text('Your account is fully verified', style: TextStyle(color: Colors.green, fontSize: 13, fontWeight: FontWeight.w500)),
                  ]),
                ),
              ],
            ],
          ),
        ),
        const SizedBox(height: 12),

        // Drug License Card
        _DocumentCard(
          title: 'Drug License',
          subtitle: 'License number, expiry date & photo',
          doc: licenseDoc,
          docType: 'LICENSE',
          onUploaded: () => ref.read(onboardingProvider.notifier).loadStatus(),
        ),
        const SizedBox(height: 12),

        // GST Card
        _DocumentCard(
          title: 'GST Certificate',
          subtitle: 'GST number & photo',
          doc: gstDoc,
          docType: 'GST',
          onUploaded: () => ref.read(onboardingProvider.notifier).loadStatus(),
        ),
      ],
    );
  }

  Widget _stepCircle(int n, int current, String label) {
    final done = current > n || (n == 4 && current == 4);
    final active = current == n;
    return Column(
      children: [
        Container(
          width: 30, height: 30,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: done ? teal : active ? teal.withValues(alpha: 0.2) : Colors.grey.shade200,
          ),
          child: Center(
            child: done
                ? const Icon(Icons.check, color: Colors.white, size: 16)
                : Text('$n', style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: active ? teal : Colors.grey)),
          ),
        ),
        const SizedBox(height: 4),
        Text(label, style: TextStyle(fontSize: 9, color: done || active ? teal : Colors.grey)),
      ],
    );
  }

  Widget _stepLine(bool filled) => Expanded(
    child: Container(height: 2, margin: const EdgeInsets.only(bottom: 16), color: filled ? teal : Colors.grey.shade300),
  );

  Widget _menuItem(IconData icon, String label, VoidCallback onTap, {Color? color}) =>
      ListTile(
        leading: Icon(icon, color: color ?? teal, size: 22),
        title: Text(label, style: TextStyle(fontSize: 15, color: color ?? const Color(0xFF1A1A1A))),
        trailing: color == null ? const Icon(Icons.chevron_right, color: Colors.grey, size: 20) : null,
        onTap: onTap,
      );

  Widget _divider() => const Divider(height: 1, indent: 56);
}

class _DocumentCard extends ConsumerStatefulWidget {
  final String title;
  final String subtitle;
  final CustomerDocument? doc;
  final String docType;
  final VoidCallback onUploaded;

  const _DocumentCard({
    required this.title,
    required this.subtitle,
    required this.doc,
    required this.docType,
    required this.onUploaded,
  });

  @override
  ConsumerState<_DocumentCard> createState() => _DocumentCardState();
}

class _DocumentCardState extends ConsumerState<_DocumentCard> {
  static const teal = Color(0xFF00A6A4);
  bool _expanded = false;
  bool _uploading = false;
  String? _error;

  final _numberCtrl = TextEditingController();
  final _expiryCtrl = TextEditingController();
  XFile? _pickedFile;
  DateTime? _expiryDate;

  @override
  void dispose() {
    _numberCtrl.dispose();
    _expiryCtrl.dispose();
    super.dispose();
  }

  Future<void> _pickImage() async {
    final picker = ImagePicker();
    final file = await picker.pickImage(source: ImageSource.gallery, imageQuality: 80);
    if (file != null) setState(() => _pickedFile = file);
  }

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: DateTime.now().add(const Duration(days: 365)),
      firstDate: DateTime.now(),
      lastDate: DateTime.now().add(const Duration(days: 3650)),
    );
    if (picked != null) {
      setState(() {
        _expiryDate = picked;
        _expiryCtrl.text = '${picked.year}-${picked.month.toString().padLeft(2, '0')}-${picked.day.toString().padLeft(2, '0')}';
      });
    }
  }

  Future<void> _submit() async {
    if (_numberCtrl.text.isEmpty) {
      setState(() => _error = 'Please enter the document number');
      return;
    }
    if (widget.docType == 'LICENSE' && _expiryDate == null) {
      setState(() => _error = 'Please select expiry date');
      return;
    }
    if (_pickedFile == null) {
      setState(() => _error = 'Please select a photo');
      return;
    }

    setState(() { _uploading = true; _error = null; });

    try {
      // Step 1: Get presigned S3 URL
      final urlResp = await createDio().post('$baseUrl/onboarding/upload-url', data: {'filename': _pickedFile!.name});
      final uploadUrl = urlResp.data['upload_url'] as String;
      final publicUrl = urlResp.data['public_url'] as String;

      // Step 2: Upload file to S3
      final bytes = await File(_pickedFile!.path).readAsBytes();
      await http.put(Uri.parse(uploadUrl), body: bytes, headers: {'Content-Type': 'image/jpeg'});

      // Step 3: Save document record
      final payload = {
        'doc_type': widget.docType,
        'doc_number': _numberCtrl.text,
        'photo_url': publicUrl,
        if (widget.docType == 'LICENSE') 'expiry_date': _expiryCtrl.text,
      };
      await createDio().post('$baseUrl/onboarding/documents', data: payload);

      if (mounted) {
        setState(() { _uploading = false; _expanded = false; _pickedFile = null; });
        widget.onUploaded();
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('${widget.title} submitted for verification'), backgroundColor: Colors.green),
        );
      }
    } catch (e) {
      if (mounted) setState(() { _uploading = false; _error = 'Failed: $e'; });
    }
  }

  @override
  Widget build(BuildContext context) {
    final doc = widget.doc;
    final isVerified = doc?.isVerified ?? false;
    final isPending = doc != null && !doc.isVerified && doc.rejectionReason == null;
    final isRejected = doc?.rejectionReason != null;

    return Container(
      color: Colors.white,
      child: Column(
        children: [
          ListTile(
            leading: Container(
              width: 40, height: 40,
              decoration: BoxDecoration(
                color: isVerified ? Colors.green.shade50 : isPending ? Colors.orange.shade50 : teal.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Icon(
                widget.docType == 'LICENSE' ? Icons.badge_outlined : Icons.receipt_long_outlined,
                color: isVerified ? Colors.green : isPending ? Colors.orange : teal,
                size: 22,
              ),
            ),
            title: Text(widget.title, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
            subtitle: Text(
              isVerified ? 'Verified' : isPending ? 'Pending review' : isRejected ? 'Rejected: ${doc!.rejectionReason}' : widget.subtitle,
              style: TextStyle(fontSize: 12, color: isVerified ? Colors.green : isPending ? Colors.orange : isRejected ? Colors.red : Colors.grey),
            ),
            trailing: isVerified
                ? const Icon(Icons.verified, color: Colors.green, size: 20)
                : isPending
                    ? Container(padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3), decoration: BoxDecoration(color: Colors.orange.shade100, borderRadius: BorderRadius.circular(8)), child: const Text('Pending', style: TextStyle(fontSize: 11, color: Colors.orange)))
                    : IconButton(
                        icon: Icon(_expanded ? Icons.keyboard_arrow_up : Icons.add_circle_outline, color: teal),
                        onPressed: () => setState(() => _expanded = !_expanded),
                      ),
          ),

          // Expansion form
          if (_expanded && !isVerified && !isPending) ...[
            const Divider(height: 1),
            Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (isRejected)
                    Container(
                      padding: const EdgeInsets.all(10),
                      margin: const EdgeInsets.only(bottom: 12),
                      decoration: BoxDecoration(color: Colors.red.shade50, borderRadius: BorderRadius.circular(8)),
                      child: Text('Rejected: ${doc!.rejectionReason}', style: const TextStyle(color: Colors.red, fontSize: 12)),
                    ),

                  // Number field
                  TextField(
                    controller: _numberCtrl,
                    decoration: InputDecoration(
                      labelText: widget.docType == 'LICENSE' ? 'License Number' : 'GST Number',
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                      focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: const BorderSide(color: teal)),
                      contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                    ),
                  ),
                  const SizedBox(height: 12),

                  // Expiry date (license only)
                  if (widget.docType == 'LICENSE') ...[
                    GestureDetector(
                      onTap: _pickDate,
                      child: AbsorbPointer(
                        child: TextField(
                          controller: _expiryCtrl,
                          decoration: InputDecoration(
                            labelText: 'Expiry Date',
                            suffixIcon: const Icon(Icons.calendar_today, size: 18),
                            border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                            focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: const BorderSide(color: teal)),
                            contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(height: 12),
                  ],

                  // Photo picker
                  GestureDetector(
                    onTap: _pickImage,
                    child: Container(
                      width: double.infinity,
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      decoration: BoxDecoration(
                        border: Border.all(color: _pickedFile != null ? teal : Colors.grey.shade300, style: BorderStyle.solid),
                        borderRadius: BorderRadius.circular(8),
                        color: _pickedFile != null ? teal.withValues(alpha: 0.05) : Colors.grey.shade50,
                      ),
                      child: Column(
                        children: [
                          Icon(_pickedFile != null ? Icons.check_circle_outline : Icons.add_photo_alternate_outlined,
                              color: _pickedFile != null ? teal : Colors.grey, size: 28),
                          const SizedBox(height: 6),
                          Text(
                            _pickedFile != null ? _pickedFile!.name : 'Tap to add photo',
                            style: TextStyle(fontSize: 13, color: _pickedFile != null ? teal : Colors.grey),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ],
                      ),
                    ),
                  ),

                  if (_error != null) ...[
                    const SizedBox(height: 8),
                    Text(_error!, style: const TextStyle(color: Colors.red, fontSize: 12)),
                  ],

                  const SizedBox(height: 16),

                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton(
                      onPressed: _uploading ? null : _submit,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: teal,
                        foregroundColor: Colors.white,
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                        padding: const EdgeInsets.symmetric(vertical: 12),
                      ),
                      child: _uploading
                          ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                          : Text('Submit ${widget.title}', style: const TextStyle(fontWeight: FontWeight.bold)),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}
