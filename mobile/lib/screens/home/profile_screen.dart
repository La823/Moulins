import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';
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
import '../../services/transport_service.dart';
import '../../services/doctor_service.dart';
import '../../models/doctor.dart';
import '../../models/transport_mode.dart';
import '../../utils/responsive.dart';
import '../../widgets/app_drawer.dart';
import 'account_deletion_screen.dart';

String _modeLabel(String name) => 'By ${name[0].toUpperCase()}${name.substring(1)}';

const _govMonths = {
  'Jan': '01', 'Feb': '02', 'Mar': '03', 'Apr': '04', 'May': '05', 'Jun': '06',
  'Jul': '07', 'Aug': '08', 'Sep': '09', 'Oct': '10', 'Nov': '11', 'Dec': '12',
};

// Government dates come back as "30-Dec-2029" — convert to "2029-12-30" for
// both the discrete date columns and DateTime parsing.
String? _govDateToIso(String? s) {
  if (s == null || s.isEmpty) return null;
  final parts = s.split('-');
  if (parts.length != 3 || !_govMonths.containsKey(parts[1])) return null;
  return '${parts[2]}-${_govMonths[parts[1]]}-${parts[0].padLeft(2, '0')}';
}

class ProfileScreen extends ConsumerStatefulWidget {
  const ProfileScreen({super.key});

  @override
  ConsumerState<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends ConsumerState<ProfileScreen> {
  static const teal = Color(0xFF00A6A4);

  String? _ledgerUrl;
  bool _ledgerLoading = true;
  List<TransportMode> _transportModes = [];

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
    TransportService().getModes().then((list) {
      if (mounted) setState(() => _transportModes = list);
    }).catchError((_) {});
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(authProvider).user;
    final onboarding = ref.watch(onboardingProvider);

    return Scaffold(
      backgroundColor: Colors.grey.shade50,
      drawer: const AppDrawer(),
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        title: const Text('Profile', style: TextStyle(color: Color(0xFF1A1A1A), fontWeight: FontWeight.w600)),
      ),
      body: ResponsiveCenter(child: ListView(
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
                      child: Text(user?.role ?? 'partner', style: const TextStyle(fontSize: 11, color: teal, fontWeight: FontWeight.w500)),
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),

          // Doctor's own profile — name, phone (read-only), clinic name
          if (user?.role == 'doctor')
            _DoctorProfileCard(phoneNumber: user?.phoneNumber ?? ''),
          if (user?.role == 'doctor') const SizedBox(height: 16),

          // Verification Journey (partners only)
          if (user?.role == 'partner')
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

          // Account Ledger (partners only)
          if (user?.role == 'partner' && !_ledgerLoading)
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

          // Default Transport Mode (partners only)
          if (user?.role == 'partner')
            Container(
              color: Colors.white,
              margin: const EdgeInsets.only(bottom: 16),
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('Default Transport Mode', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
                  const SizedBox(height: 2),
                  Text('Pre-fills your order\'s shipping method at checkout', style: TextStyle(fontSize: 12, color: Colors.grey.shade500)),
                  const SizedBox(height: 12),
                  Wrap(
                    spacing: 10,
                    runSpacing: 8,
                    children: _transportModes.map((mode) {
                      final selected = user?.defaultTransportMode == mode.name;
                      return GestureDetector(
                        onTap: () => ref.read(authProvider.notifier).updateDefaultTransportMode(mode.name),
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                          decoration: BoxDecoration(
                            color: selected ? teal : Colors.grey.shade100,
                            borderRadius: BorderRadius.circular(20),
                          ),
                          child: Text(
                            _modeLabel(mode.name),
                            style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: selected ? Colors.white : Colors.grey.shade700),
                          ),
                        ),
                      );
                    }).toList(),
                  ),
                ],
              ),
            ),

          // Billing / Shipping Address (partners only)
          if (user?.role == 'partner')
            _AddressCard(
              billingAddress: user?.billingAddress,
              shippingAddress: user?.shippingAddress,
            ),
          if (user?.role == 'partner') const SizedBox(height: 16),

          // Menu items
          Container(
            color: Colors.white,
            child: Column(
              children: [
                if (user?.role != 'doctor') ...[
                  _menuItem(Icons.shopping_bag_outlined, 'My Orders', () => context.go('/orders')),
                  _divider(),
                ],
                if (user?.role == 'partner') ...[
                  _menuItem(Icons.person_outlined, 'My Doctors', () => context.go('/doctors')),
                  _divider(),
                ],
                if (user?.role != 'doctor') ...[
                  _menuItem(Icons.calendar_today_outlined, 'My Meetings', () => context.go('/meetings')),
                  _divider(),
                  _menuItem(Icons.assignment_outlined, 'My Requests', () => context.go('/requests')),
                  _divider(),
                ],
                _menuItem(Icons.chat_bubble_outline, 'Messages', () => context.go('/chat')),
                _divider(),
                _menuItem(Icons.ondemand_video_outlined, 'Learning', () => context.go('/learning')),
              ],
            ),
          ),
          const SizedBox(height: 16),

          Container(
            color: Colors.white,
            child: Column(
              children: [
                _menuItem(Icons.logout, 'Logout', () async {
                  await ref.read(authProvider.notifier).logout();
                  if (context.mounted) context.go('/login');
                }, color: Colors.red),
                _divider(),
                _menuItem(
                  Icons.delete_outline,
                  'Delete Account',
                  () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const AccountDeletionScreen())),
                  color: Colors.red,
                ),
              ],
            ),
          ),

          const SizedBox(height: 32),
          Center(child: Text('Moulins Pharmaceuticals', style: TextStyle(color: Colors.grey.shade400, fontSize: 12))),
          const SizedBox(height: 8),
          Center(child: Text('v1.0.0', style: TextStyle(color: Colors.grey.shade400, fontSize: 11))),
          const SizedBox(height: 24),
        ],
      )),
    );
  }

  Widget _buildVerificationSection(BuildContext context, OnboardingStatus status) {
    // A partner can hold both a Form 20B and a Form 21B wholesale drug
    // license — the legacy generic 'LICENSE' type (from before this split)
    // is treated as 20B so old data still shows up correctly.
    final license20BDoc = status.documents.where((d) => d.docType == 'LICENSE' || d.docType == 'LICENSE_20B').firstOrNull;
    final license21BDoc = status.documents.where((d) => d.docType == 'LICENSE_21B').firstOrNull;
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

        // Drug License Card — Form 20B
        _DrugLicenseCard(
          title: 'Drug License (Form 20B)',
          subtitle: 'Wholesale license — verify to auto-fill expiry & details',
          doc: license20BDoc,
          docType: 'LICENSE_20B',
          onUploaded: () => ref.read(onboardingProvider.notifier).loadStatus(),
        ),
        const SizedBox(height: 12),

        // Drug License Card — Form 21B
        _DrugLicenseCard(
          title: 'Drug License (Form 21B)',
          subtitle: 'Wholesale license for Schedule X drugs, if applicable',
          doc: license21BDoc,
          docType: 'LICENSE_21B',
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

class _DoctorProfileCard extends ConsumerStatefulWidget {
  final String phoneNumber;

  const _DoctorProfileCard({required this.phoneNumber});

  @override
  ConsumerState<_DoctorProfileCard> createState() => _DoctorProfileCardState();
}

class _DoctorProfileCardState extends ConsumerState<_DoctorProfileCard> {
  static const teal = Color(0xFF00A6A4);
  final _service = DoctorService();

  Doctor? _doctor;
  bool _loading = true;
  bool _editing = false;
  bool _saving = false;
  String? _error;
  late final TextEditingController _nameCtrl;
  late final TextEditingController _clinicCtrl;

  @override
  void initState() {
    super.initState();
    _nameCtrl = TextEditingController();
    _clinicCtrl = TextEditingController();
    _service.getMyProfile().then((d) {
      if (mounted) {
        setState(() {
          _doctor = d;
          _nameCtrl.text = d.name;
          _clinicCtrl.text = d.clinicName ?? '';
          _loading = false;
        });
      }
    }).catchError((_) {
      if (mounted) setState(() => _loading = false);
    });
  }

  @override
  void dispose() {
    _nameCtrl.dispose();
    _clinicCtrl.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (_nameCtrl.text.trim().isEmpty) {
      setState(() => _error = 'Name is required');
      return;
    }
    setState(() { _saving = true; _error = null; });
    try {
      await _service.updateMyProfile(
        name: _nameCtrl.text.trim(),
        email: _doctor?.email,
        clinicName: _clinicCtrl.text.trim().isEmpty ? null : _clinicCtrl.text.trim(),
        clinicAddress: _doctor?.clinicAddress,
      );
      if (mounted) {
        setState(() {
          _saving = false;
          _editing = false;
          _doctor = Doctor(
            id: _doctor!.id,
            name: _nameCtrl.text.trim(),
            phone: _doctor!.phone,
            email: _doctor!.email,
            clinicName: _clinicCtrl.text.trim().isEmpty ? null : _clinicCtrl.text.trim(),
            clinicAddress: _doctor!.clinicAddress,
          );
        });
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Profile updated'), backgroundColor: teal),
        );
      }
    } catch (e) {
      if (mounted) setState(() { _saving = false; _error = 'Failed to update profile'; });
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Padding(padding: EdgeInsets.all(20), child: Center(child: CircularProgressIndicator()));
    }

    return Container(
      color: Colors.white,
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text('My Profile', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
              if (!_editing)
                TextButton(
                  onPressed: () => setState(() => _editing = true),
                  child: const Text('Edit', style: TextStyle(color: teal, fontSize: 13)),
                ),
            ],
          ),
          const SizedBox(height: 8),
          if (_editing) ...[
            TextField(
              controller: _nameCtrl,
              decoration: InputDecoration(
                labelText: 'Name',
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: const BorderSide(color: teal)),
                contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              ),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: _clinicCtrl,
              decoration: InputDecoration(
                labelText: 'Clinic name',
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: const BorderSide(color: teal)),
                contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              ),
            ),
            if (_error != null) ...[
              const SizedBox(height: 8),
              Text(_error!, style: const TextStyle(color: Colors.red, fontSize: 12)),
            ],
            const SizedBox(height: 12),
            Row(
              children: [
                ElevatedButton(
                  onPressed: _saving ? null : _save,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: teal,
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                  ),
                  child: _saving
                      ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                      : const Text('Save'),
                ),
                const SizedBox(width: 12),
                TextButton(
                  onPressed: _saving ? null : () => setState(() {
                    _editing = false;
                    _nameCtrl.text = _doctor?.name ?? '';
                    _clinicCtrl.text = _doctor?.clinicName ?? '';
                  }),
                  child: const Text('Cancel', style: TextStyle(color: Colors.grey)),
                ),
              ],
            ),
          ] else ...[
            Text('Name', style: TextStyle(fontSize: 11, color: Colors.grey.shade400)),
            Text(_doctor?.name.isNotEmpty == true ? _doctor!.name : 'Not set', style: const TextStyle(fontSize: 13)),
            const SizedBox(height: 10),
            Text('Phone', style: TextStyle(fontSize: 11, color: Colors.grey.shade400)),
            Text(widget.phoneNumber, style: const TextStyle(fontSize: 13)),
            const SizedBox(height: 10),
            Text('Clinic name', style: TextStyle(fontSize: 11, color: Colors.grey.shade400)),
            Text(
              _doctor?.clinicName?.isNotEmpty == true ? _doctor!.clinicName! : 'Not set',
              style: const TextStyle(fontSize: 13),
            ),
          ],
        ],
      ),
    );
  }
}

class _AddressCard extends ConsumerStatefulWidget {
  final String? billingAddress;
  final String? shippingAddress;

  const _AddressCard({this.billingAddress, this.shippingAddress});

  @override
  ConsumerState<_AddressCard> createState() => _AddressCardState();
}

class _AddressCardState extends ConsumerState<_AddressCard> {
  static const teal = Color(0xFF00A6A4);
  bool _editing = false;
  bool _saving = false;
  late final TextEditingController _billingCtrl;
  late final TextEditingController _shippingCtrl;

  @override
  void initState() {
    super.initState();
    _billingCtrl = TextEditingController(text: widget.billingAddress ?? '');
    _shippingCtrl = TextEditingController(text: widget.shippingAddress ?? '');
  }

  @override
  void dispose() {
    _billingCtrl.dispose();
    _shippingCtrl.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    setState(() => _saving = true);
    final ok = await ref.read(authProvider.notifier).updateAddress(
          billingAddress: _billingCtrl.text.trim(),
          shippingAddress: _shippingCtrl.text.trim(),
        );
    if (mounted) {
      setState(() { _saving = false; if (ok) _editing = false; });
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(ok ? 'Address updated' : 'Failed to update address'),
          backgroundColor: ok ? teal : Colors.red,
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      color: Colors.white,
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text('Billing & Shipping Address', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
              if (!_editing)
                TextButton(
                  onPressed: () => setState(() => _editing = true),
                  child: const Text('Edit', style: TextStyle(color: teal, fontSize: 13)),
                ),
            ],
          ),
          const SizedBox(height: 8),
          if (_editing) ...[
            TextField(
              controller: _billingCtrl,
              maxLines: 2,
              decoration: InputDecoration(
                labelText: 'Billing address',
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: const BorderSide(color: teal)),
                contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              ),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: _shippingCtrl,
              maxLines: 2,
              decoration: InputDecoration(
                labelText: 'Shipping address',
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: const BorderSide(color: teal)),
                contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              ),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                ElevatedButton(
                  onPressed: _saving ? null : _save,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: teal,
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                  ),
                  child: _saving
                      ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                      : const Text('Save'),
                ),
                const SizedBox(width: 12),
                TextButton(
                  onPressed: _saving ? null : () => setState(() => _editing = false),
                  child: const Text('Cancel', style: TextStyle(color: Colors.grey)),
                ),
              ],
            ),
          ] else ...[
            Text('Billing', style: TextStyle(fontSize: 11, color: Colors.grey.shade400)),
            Text(
              widget.billingAddress?.isNotEmpty == true ? widget.billingAddress! : 'Not set',
              style: const TextStyle(fontSize: 13),
            ),
            const SizedBox(height: 10),
            Text('Shipping', style: TextStyle(fontSize: 11, color: Colors.grey.shade400)),
            Text(
              widget.shippingAddress?.isNotEmpty == true ? widget.shippingAddress! : 'Not set',
              style: const TextStyle(fontSize: 13),
            ),
          ],
        ],
      ),
    );
  }
}

class _DocumentCard extends ConsumerStatefulWidget {
  final String title;
  final String subtitle;
  final PartnerDocument? doc;
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
  bool _forceEdit = false;
  bool _uploading = false;
  String? _error;

  final _numberCtrl = TextEditingController();
  final _expiryCtrl = TextEditingController();
  XFile? _pickedFile;
  DateTime? _expiryDate;
  Map<String, dynamic>? _gstScraped;

  @override
  void dispose() {
    _numberCtrl.dispose();
    _expiryCtrl.dispose();
    super.dispose();
  }

  Future<void> _verifyGst() async {
    final result = await showDialog<Map<String, dynamic>>(
      context: context,
      builder: (_) => _GstVerifyDialog(gstin: _numberCtrl.text.trim()),
    );
    if (result != null) setState(() => _gstScraped = result);
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
      final gst = _gstScraped;
      final payload = {
        'doc_type': widget.docType,
        'doc_number': _numberCtrl.text,
        'photo_url': publicUrl,
        if (widget.docType == 'LICENSE') 'expiry_date': _expiryCtrl.text,
        if (gst != null) ...{
          'scraped_data': gst,
          'legal_name': gst['lgnm'],
          'trade_name': gst['tradeNam'],
          'status': gst['sts'],
          'business_type': gst['ctb'],
          'registered_date': _govDateToIso(gst['rgdt'] as String?),
          'address': (gst['pradr'] as Map?)?['adr'],
        },
      };
      await createDio().post('$baseUrl/onboarding/documents', data: payload);

      if (mounted) {
        setState(() { _uploading = false; _expanded = false; _pickedFile = null; _gstScraped = null; });
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
    final isExpired = doc?.expiryDate != null && doc!.expiryDate!.isBefore(DateTime.now());
    final isVerified = (doc?.isVerified ?? false) && !isExpired;
    final isPending = doc != null && !doc.isVerified && doc.rejectionReason == null && !isExpired;
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
              isExpired
                  ? 'Expired on ${doc.expiryDate!.day}/${doc.expiryDate!.month}/${doc.expiryDate!.year} — please update'
                  : isVerified ? 'Verified' : isPending ? 'Pending review' : isRejected ? 'Rejected: ${doc!.rejectionReason}' : widget.subtitle,
              style: TextStyle(fontSize: 12, color: isExpired ? Colors.red : isVerified ? Colors.green : isPending ? Colors.orange : isRejected ? Colors.red : Colors.grey),
            ),
            trailing: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (doc?.photoUrl != null && doc!.photoUrl!.isNotEmpty)
                  IconButton(
                    icon: const Icon(Icons.visibility_outlined, size: 20),
                    color: Colors.grey.shade600,
                    tooltip: 'View uploaded photo',
                    onPressed: () => launchUrl(
                      Uri.parse(doc.photoUrl!),
                      mode: LaunchMode.externalApplication,
                    ),
                  ),
                if (isVerified)
                  TextButton(
                    onPressed: () => setState(() { _forceEdit = true; _expanded = true; }),
                    child: const Row(mainAxisSize: MainAxisSize.min, children: [
                      Icon(Icons.verified, color: Colors.green, size: 18),
                      SizedBox(width: 4),
                      Text('Update', style: TextStyle(fontSize: 12, color: teal)),
                    ]),
                  )
                else if (isPending)
                  Container(padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3), decoration: BoxDecoration(color: Colors.orange.shade100, borderRadius: BorderRadius.circular(8)), child: const Text('Pending', style: TextStyle(fontSize: 11, color: Colors.orange)))
                else
                  IconButton(
                    icon: Icon(_expanded ? Icons.keyboard_arrow_up : Icons.add_circle_outline, color: teal),
                    onPressed: () => setState(() => _expanded = !_expanded),
                  ),
              ],
            ),
          ),

          // Expansion form
          if (_expanded && !isPending && (!isVerified || _forceEdit)) ...[
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
                  if (isExpired)
                    Container(
                      padding: const EdgeInsets.all(10),
                      margin: const EdgeInsets.only(bottom: 12),
                      decoration: BoxDecoration(color: Colors.red.shade50, borderRadius: BorderRadius.circular(8)),
                      child: const Text('Your license has expired. Please submit an updated license number, expiry date, and photo.', style: TextStyle(color: Colors.red, fontSize: 12)),
                    ),

                  // Number field
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        child: TextField(
                          controller: _numberCtrl,
                          onChanged: (_) => setState(() {}),
                          decoration: InputDecoration(
                            labelText: widget.docType == 'LICENSE' ? 'License Number' : 'GST Number',
                            border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                            focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: const BorderSide(color: teal)),
                            contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                          ),
                        ),
                      ),
                      if (widget.docType == 'GST') ...[
                        const SizedBox(width: 8),
                        OutlinedButton(
                          onPressed: _numberCtrl.text.trim().isEmpty ? null : _verifyGst,
                          style: OutlinedButton.styleFrom(foregroundColor: teal, side: const BorderSide(color: teal)),
                          child: const Text('Verify', style: TextStyle(fontSize: 12)),
                        ),
                      ],
                    ],
                  ),
                  if (widget.docType == 'GST') ...[
                    const SizedBox(height: 4),
                    Text(
                      'Verifying fetches your registered business details from the GST portal.',
                      style: TextStyle(fontSize: 11, color: Colors.grey.shade500),
                    ),
                  ],
                  if (_gstScraped != null) ...[
                    const SizedBox(height: 10),
                    Container(
                      padding: const EdgeInsets.all(10),
                      decoration: BoxDecoration(color: teal.withValues(alpha: 0.06), borderRadius: BorderRadius.circular(8), border: Border.all(color: teal.withValues(alpha: 0.3))),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text('Details fetched — will be saved with this submission:', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: teal)),
                          if (_gstScraped!['lgnm'] != null) Text('Legal Name: ${_gstScraped!['lgnm']}', style: const TextStyle(fontSize: 12)),
                          if (_gstScraped!['tradeNam'] != null) Text('Trade Name: ${_gstScraped!['tradeNam']}', style: const TextStyle(fontSize: 12)),
                          if (_gstScraped!['sts'] != null) Text('Status: ${_gstScraped!['sts']}', style: const TextStyle(fontSize: 12)),
                          if ((_gstScraped!['pradr'] as Map?)?['adr'] != null) Text('Address: ${(_gstScraped!['pradr'] as Map)['adr']}', style: const TextStyle(fontSize: 12)),
                        ],
                      ),
                    ),
                  ],
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

// Verifying a GSTIN means solving a live captcha against the government
// portal each time — there's no way to skip straight to the result. Returns
// the scraped details map via Navigator.pop when confirmed, or null if
// dismissed.
class _GstVerifyDialog extends StatefulWidget {
  final String gstin;
  const _GstVerifyDialog({required this.gstin});

  @override
  State<_GstVerifyDialog> createState() => _GstVerifyDialogState();
}

class _GstVerifyDialogState extends State<_GstVerifyDialog> {
  static const teal = Color(0xFF00A6A4);
  String _step = 'loading'; // loading | captcha | result | error
  String? _sessionId;
  String? _captchaImage;
  final _captchaCtrl = TextEditingController();
  bool _submitting = false;
  String _error = '';
  Map<String, dynamic>? _details;

  @override
  void initState() {
    super.initState();
    _fetchCaptcha();
  }

  @override
  void dispose() {
    _captchaCtrl.dispose();
    super.dispose();
  }

  Future<void> _fetchCaptcha() async {
    setState(() { _step = 'loading'; _error = ''; _captchaCtrl.clear(); });
    try {
      final resp = await createDio().get('$baseUrl/gst-lookup/captcha');
      setState(() {
        _sessionId = resp.data['sessionId'];
        _captchaImage = resp.data['image'];
        _step = 'captcha';
      });
    } catch (e) {
      setState(() { _error = 'Could not load captcha. Please try again.'; _step = 'error'; });
    }
  }

  Future<void> _submitCaptcha() async {
    if (_captchaCtrl.text.trim().isEmpty) return;
    setState(() { _submitting = true; _error = ''; });
    try {
      final resp = await createDio().post('$baseUrl/gst-lookup/details', data: {
        'session_id': _sessionId,
        'gstin': widget.gstin,
        'captcha': _captchaCtrl.text.trim(),
      });
      final data = Map<String, dynamic>.from(resp.data as Map);
      if (data['error'] != null) throw Exception(data['error']);
      setState(() { _details = data; _step = 'result'; });
    } catch (e) {
      setState(() { _error = 'Could not verify this GSTIN. Please check the captcha and try again.'; _step = 'error'; });
    } finally {
      setState(() => _submitting = false);
    }
  }

  Uint8List? get _captchaBytes {
    final img = _captchaImage;
    if (img == null) return null;
    final comma = img.indexOf(',');
    final b64 = comma >= 0 ? img.substring(comma + 1) : img;
    try {
      return base64Decode(b64);
    } catch (_) {
      return null;
    }
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Verify GSTIN'),
      content: SizedBox(
        width: 320,
        child: switch (_step) {
          'loading' => const Padding(padding: EdgeInsets.symmetric(vertical: 24), child: Center(child: CircularProgressIndicator())),
          'captcha' => Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Enter the code shown below to fetch details for ${widget.gstin}.', style: const TextStyle(fontSize: 13)),
                const SizedBox(height: 12),
                if (_captchaBytes != null)
                  Center(child: Image.memory(_captchaBytes!, height: 60)),
                const SizedBox(height: 8),
                Center(
                  child: TextButton(onPressed: _fetchCaptcha, child: const Text("Can't read it? Get a new one", style: TextStyle(fontSize: 12, color: teal))),
                ),
                TextField(
                  controller: _captchaCtrl,
                  autofocus: true,
                  decoration: InputDecoration(
                    hintText: 'Enter captcha',
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                    contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                  ),
                ),
              ],
            ),
          'error' => Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [Text(_error, style: const TextStyle(color: Colors.red, fontSize: 13))],
            ),
          'result' => Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(color: Colors.green.shade50, borderRadius: BorderRadius.circular(8)),
                  child: const Text('GSTIN found — please check the details below', style: TextStyle(fontSize: 12, color: Colors.green, fontWeight: FontWeight.w600)),
                ),
                const SizedBox(height: 8),
                if (_details?['lgnm'] != null) Text('Legal Name: ${_details!['lgnm']}', style: const TextStyle(fontSize: 13)),
                if (_details?['tradeNam'] != null) Text('Trade Name: ${_details!['tradeNam']}', style: const TextStyle(fontSize: 13)),
                if (_details?['sts'] != null) Text('Status: ${_details!['sts']}', style: const TextStyle(fontSize: 13)),
                if (_details?['ctb'] != null) Text('Business Type: ${_details!['ctb']}', style: const TextStyle(fontSize: 13)),
                if (_details?['rgdt'] != null) Text('Registered: ${_details!['rgdt']}', style: const TextStyle(fontSize: 13)),
                if ((_details?['pradr'] as Map?)?['adr'] != null) Text('Address: ${(_details!['pradr'] as Map)['adr']}', style: const TextStyle(fontSize: 13)),
              ],
            ),
          _ => const SizedBox.shrink(),
        },
      ),
      actions: switch (_step) {
        'captcha' => [
            TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Cancel')),
            ElevatedButton(
              onPressed: _submitting ? null : _submitCaptcha,
              style: ElevatedButton.styleFrom(backgroundColor: teal, foregroundColor: Colors.white),
              child: _submitting
                  ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                  : const Text('Fetch Details'),
            ),
          ],
        'error' => [
            TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Cancel')),
            ElevatedButton(onPressed: _fetchCaptcha, style: ElevatedButton.styleFrom(backgroundColor: teal, foregroundColor: Colors.white), child: const Text('Try Again')),
          ],
        'result' => [
            TextButton(onPressed: _fetchCaptcha, child: const Text('Re-check')),
            ElevatedButton(
              onPressed: () => Navigator.of(context).pop(_details),
              style: ElevatedButton.styleFrom(backgroundColor: teal, foregroundColor: Colors.white),
              child: const Text('Looks good, continue'),
            ),
          ],
        _ => [],
      },
    );
  }
}

// Unlike GST, the drug-license portal has no captcha step — a single lookup
// call. Returns the scraped details map via Navigator.pop when confirmed.
class _DlVerifyDialog extends StatefulWidget {
  final String licenseNo;
  const _DlVerifyDialog({required this.licenseNo});

  @override
  State<_DlVerifyDialog> createState() => _DlVerifyDialogState();
}

class _DlVerifyDialogState extends State<_DlVerifyDialog> {
  static const teal = Color(0xFF00A6A4);
  String _status = 'loading'; // loading | result | error
  String _error = '';
  Map<String, dynamic>? _details;

  @override
  void initState() {
    super.initState();
    _fetch();
  }

  Future<void> _fetch() async {
    setState(() { _status = 'loading'; _error = ''; });
    try {
      final resp = await createDio().get('$baseUrl/dl-lookup/details', queryParameters: {'license_no': widget.licenseNo});
      final data = Map<String, dynamic>.from(resp.data as Map);
      if (data['error'] != null) throw Exception(data['error']);
      setState(() { _details = data; _status = 'result'; });
    } catch (e) {
      setState(() { _error = 'Could not verify this license number. Please try again.'; _status = 'error'; });
    }
  }

  @override
  Widget build(BuildContext context) {
    final techPersons = (_details?['tech_persons'] as List?) ?? [];
    return AlertDialog(
      title: const Text('Verify Drug License'),
      content: SizedBox(
        width: 320,
        child: switch (_status) {
          'loading' => Padding(
              padding: const EdgeInsets.symmetric(vertical: 24),
              child: Center(child: Text('Looking up ${widget.licenseNo}...', style: const TextStyle(fontSize: 13))),
            ),
          'error' => Text(_error, style: const TextStyle(color: Colors.red, fontSize: 13)),
          'result' => Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(color: Colors.green.shade50, borderRadius: BorderRadius.circular(8)),
                  child: const Text('License found — please check the details below', style: TextStyle(fontSize: 12, color: Colors.green, fontWeight: FontWeight.w600)),
                ),
                const SizedBox(height: 8),
                if (_details?['str_ondls_licence_no'] != null) Text('License No: ${_details!['str_ondls_licence_no']}', style: const TextStyle(fontSize: 13)),
                if (_details?['licence_form_no'] != null) Text('Form: ${_details!['licence_form_no']}', style: const TextStyle(fontSize: 13)),
                if (_details?['institute_name'] != null) Text('Firm Name: ${_details!['institute_name']}', style: const TextStyle(fontSize: 13)),
                if (_details?['licence_status'] != null) Text('Status: ${_details!['licence_status']}', style: const TextStyle(fontSize: 13)),
                if (_details?['dt_curr_validity_date'] != null) Text('Valid Until: ${_details!['dt_curr_validity_date']}', style: const TextStyle(fontSize: 13)),
                if (_details?['full_address'] != null) Text('Address: ${_details!['full_address']}', style: const TextStyle(fontSize: 13)),
                if (techPersons.isNotEmpty)
                  Text('Technical Person: ${techPersons.map((t) => t['techname']).join(', ')}', style: const TextStyle(fontSize: 13)),
              ],
            ),
          _ => const SizedBox.shrink(),
        },
      ),
      actions: switch (_status) {
        'error' => [
            TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Cancel')),
            ElevatedButton(onPressed: _fetch, style: ElevatedButton.styleFrom(backgroundColor: teal, foregroundColor: Colors.white), child: const Text('Try Again')),
          ],
        'result' => [
            TextButton(onPressed: _fetch, child: const Text('Re-check')),
            ElevatedButton(
              onPressed: () => Navigator.of(context).pop(_details),
              style: ElevatedButton.styleFrom(backgroundColor: teal, foregroundColor: Colors.white),
              child: const Text('Looks good, continue'),
            ),
          ],
        _ => [],
      },
    );
  }
}

// A partner can hold both a Form 20B and a Form 21B wholesale drug license
// at once, so each form gets its own card/upload flow with a fixed docType
// (mirrors the web DrugLicenseCard). Expiry date is fetched from the
// verify-license lookup only — there is no manual expiry input.
class _DrugLicenseCard extends ConsumerStatefulWidget {
  final String title;
  final String subtitle;
  final PartnerDocument? doc;
  final String docType;
  final VoidCallback onUploaded;

  const _DrugLicenseCard({
    required this.title,
    required this.subtitle,
    required this.doc,
    required this.docType,
    required this.onUploaded,
  });

  @override
  ConsumerState<_DrugLicenseCard> createState() => _DrugLicenseCardState();
}

class _DrugLicenseCardState extends ConsumerState<_DrugLicenseCard> {
  static const teal = Color(0xFF00A6A4);
  bool _expanded = false;
  bool _forceEdit = false;
  bool _uploading = false;
  String? _error;

  final _numberCtrl = TextEditingController();
  XFile? _pickedFile;
  Map<String, dynamic>? _dlScraped;
  String? _fetchedExpiryIso;

  @override
  void dispose() {
    _numberCtrl.dispose();
    super.dispose();
  }

  Future<void> _pickImage() async {
    final picker = ImagePicker();
    final file = await picker.pickImage(source: ImageSource.gallery, imageQuality: 80);
    if (file != null) setState(() => _pickedFile = file);
  }

  Future<void> _verifyLicense() async {
    final result = await showDialog<Map<String, dynamic>>(
      context: context,
      builder: (_) => _DlVerifyDialog(licenseNo: _numberCtrl.text.trim()),
    );
    if (result != null) {
      setState(() {
        _dlScraped = result;
        _fetchedExpiryIso = _govDateToIso(result['dt_curr_validity_date'] as String?);
      });
    }
  }

  Future<void> _submit() async {
    if (_numberCtrl.text.isEmpty) {
      setState(() => _error = 'Please enter the license number');
      return;
    }
    if (_fetchedExpiryIso == null) {
      setState(() => _error = 'Please verify your license first — the expiry date is fetched automatically.');
      return;
    }
    if (_pickedFile == null) {
      setState(() => _error = 'Please select a photo');
      return;
    }

    setState(() { _uploading = true; _error = null; });

    try {
      final urlResp = await createDio().post('$baseUrl/onboarding/upload-url', data: {'filename': _pickedFile!.name});
      final uploadUrl = urlResp.data['upload_url'] as String;
      final publicUrl = urlResp.data['public_url'] as String;

      final bytes = await File(_pickedFile!.path).readAsBytes();
      await http.put(Uri.parse(uploadUrl), body: bytes, headers: {'Content-Type': 'image/jpeg'});

      final dl = _dlScraped;
      final techPersons = (dl?['tech_persons'] as List?) ?? [];
      final payload = {
        'doc_type': widget.docType,
        'doc_number': _numberCtrl.text,
        'expiry_date': _fetchedExpiryIso,
        'photo_url': publicUrl,
        if (dl != null) ...{
          'scraped_data': dl,
          'legal_name': dl['institute_name'],
          'status': dl['licence_status'],
          'first_issue_date': _govDateToIso(dl['dt_first_issue_date'] as String?),
          'address': dl['full_address'],
          if (techPersons.isNotEmpty) 'tech_person_name': techPersons.first['techname'],
          if (techPersons.isNotEmpty) 'tech_person_reg_no': techPersons.first['techregno']?.toString(),
        },
      };
      await createDio().post('$baseUrl/onboarding/documents', data: payload);

      if (mounted) {
        setState(() { _uploading = false; _expanded = false; _forceEdit = false; _pickedFile = null; _dlScraped = null; _fetchedExpiryIso = null; });
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
    final isExpired = doc?.expiryDate != null && doc!.expiryDate!.isBefore(DateTime.now());
    final isVerified = (doc?.isVerified ?? false) && !isExpired;
    final isPending = doc != null && !doc.isVerified && doc.rejectionReason == null && !isExpired;
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
              child: Icon(Icons.badge_outlined, color: isVerified ? Colors.green : isPending ? Colors.orange : teal, size: 22),
            ),
            title: Text(widget.title, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
            subtitle: Text(
              isExpired
                  ? 'Expired on ${doc.expiryDate!.day}/${doc.expiryDate!.month}/${doc.expiryDate!.year} — please update'
                  : isVerified ? 'Verified' : isPending ? 'Pending review' : isRejected ? 'Rejected: ${doc!.rejectionReason}' : widget.subtitle,
              style: TextStyle(fontSize: 12, color: isExpired ? Colors.red : isVerified ? Colors.green : isPending ? Colors.orange : isRejected ? Colors.red : Colors.grey),
            ),
            trailing: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (doc?.photoUrl != null && doc!.photoUrl!.isNotEmpty)
                  IconButton(
                    icon: const Icon(Icons.visibility_outlined, size: 20),
                    color: Colors.grey.shade600,
                    tooltip: 'View uploaded photo',
                    onPressed: () => launchUrl(Uri.parse(doc.photoUrl!), mode: LaunchMode.externalApplication),
                  ),
                if (isVerified && !isExpired)
                  TextButton(
                    onPressed: () => setState(() { _forceEdit = true; _expanded = true; }),
                    child: const Row(mainAxisSize: MainAxisSize.min, children: [
                      Icon(Icons.verified, color: Colors.green, size: 18),
                      SizedBox(width: 4),
                      Text('Update', style: TextStyle(fontSize: 12, color: teal)),
                    ]),
                  )
                else if (isPending)
                  Container(padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3), decoration: BoxDecoration(color: Colors.orange.shade100, borderRadius: BorderRadius.circular(8)), child: const Text('Pending', style: TextStyle(fontSize: 11, color: Colors.orange)))
                else
                  IconButton(
                    icon: Icon(_expanded ? Icons.keyboard_arrow_up : Icons.add_circle_outline, color: teal),
                    onPressed: () => setState(() => _expanded = !_expanded),
                  ),
              ],
            ),
          ),

          if (doc != null && !isPending && (!_expanded || (isVerified && !_forceEdit)))
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (doc.legalName != null) Text('Firm Name: ${doc.legalName}', style: const TextStyle(fontSize: 12, color: Colors.grey)),
                  if (doc.status != null) Text('Status (govt. portal): ${doc.status}', style: const TextStyle(fontSize: 12, color: Colors.grey)),
                  if (doc.address != null) Text('Address: ${doc.address}', style: const TextStyle(fontSize: 12, color: Colors.grey)),
                  if (doc.techPersonName != null) Text('Technical Person: ${doc.techPersonName}${doc.techPersonRegNo != null ? ' (Reg. No: ${doc.techPersonRegNo})' : ''}', style: const TextStyle(fontSize: 12, color: Colors.grey)),
                ],
              ),
            ),

          // Expansion form
          if (_expanded && !isPending && (!isVerified || _forceEdit)) ...[
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
                  if (isExpired)
                    Container(
                      padding: const EdgeInsets.all(10),
                      margin: const EdgeInsets.only(bottom: 12),
                      decoration: BoxDecoration(color: Colors.red.shade50, borderRadius: BorderRadius.circular(8)),
                      child: const Text('Your license has expired. Please verify again and submit an updated photo.', style: TextStyle(color: Colors.red, fontSize: 12)),
                    ),

                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        child: TextField(
                          controller: _numberCtrl,
                          onChanged: (_) => setState(() {}),
                          decoration: InputDecoration(
                            labelText: 'License Number',
                            border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                            focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: const BorderSide(color: teal)),
                            contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      OutlinedButton(
                        onPressed: _numberCtrl.text.trim().isEmpty ? null : _verifyLicense,
                        style: OutlinedButton.styleFrom(foregroundColor: teal, side: const BorderSide(color: teal)),
                        child: const Text('Verify', style: TextStyle(fontSize: 12)),
                      ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Text(
                    'Verifying fetches your registered details from the government drug-license portal, including the expiry date — no need to enter it manually.',
                    style: TextStyle(fontSize: 11, color: Colors.grey.shade500),
                  ),
                  if (_dlScraped != null) ...[
                    const SizedBox(height: 10),
                    Container(
                      padding: const EdgeInsets.all(10),
                      decoration: BoxDecoration(color: teal.withValues(alpha: 0.06), borderRadius: BorderRadius.circular(8), border: Border.all(color: teal.withValues(alpha: 0.3))),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text('Details fetched — will be saved with this submission:', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: teal)),
                          if (_dlScraped!['licence_form_no'] != null) Text('Form: ${_dlScraped!['licence_form_no']}', style: const TextStyle(fontSize: 12)),
                          if (_dlScraped!['institute_name'] != null) Text('Firm Name: ${_dlScraped!['institute_name']}', style: const TextStyle(fontSize: 12)),
                          if (_dlScraped!['licence_status'] != null) Text('Status: ${_dlScraped!['licence_status']}', style: const TextStyle(fontSize: 12)),
                          if (_dlScraped!['dt_curr_validity_date'] != null) Text('Valid Until: ${_dlScraped!['dt_curr_validity_date']}', style: const TextStyle(fontSize: 12)),
                          if (_dlScraped!['full_address'] != null) Text('Address: ${_dlScraped!['full_address']}', style: const TextStyle(fontSize: 12)),
                        ],
                      ),
                    ),
                  ] else
                    Padding(
                      padding: const EdgeInsets.only(top: 8),
                      child: Text('Expiry date will be fetched automatically once you verify.', style: TextStyle(fontSize: 11, color: Colors.grey.shade500)),
                    ),
                  const SizedBox(height: 12),

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
