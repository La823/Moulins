import 'dart:io';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:http/http.dart' as http;
import 'package:intl/intl.dart';
import '../../models/payment.dart';
import '../../services/payment_service.dart';
import '../../utils/responsive.dart';
import '../../widgets/app_drawer.dart';

const _teal = Color(0xFF00A6A4);

final _dateTimeFmt = DateFormat('d MMM y, h:mm a');

class PaymentsScreen extends StatefulWidget {
  const PaymentsScreen({super.key});

  @override
  State<PaymentsScreen> createState() => _PaymentsScreenState();
}

class _PaymentsScreenState extends State<PaymentsScreen> {
  final _service = PaymentService();
  final _amountCtrl = TextEditingController();
  XFile? _screenshot;
  bool _submitting = false;
  String? _error;
  String? _success;

  List<Payment> _payments = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _amountCtrl.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final list = await _service.getMyPayments();
      setState(() { _payments = list; _loading = false; });
    } catch (_) {
      setState(() => _loading = false);
    }
  }

  Future<void> _pickScreenshot() async {
    final file = await ImagePicker().pickImage(source: ImageSource.gallery, imageQuality: 85);
    if (file != null) setState(() => _screenshot = file);
  }

  Future<void> _submit() async {
    setState(() { _error = null; _success = null; });
    final amount = double.tryParse(_amountCtrl.text.trim());
    if (amount == null || amount <= 0) {
      setState(() => _error = 'Enter a valid amount');
      return;
    }
    if (_screenshot == null) {
      setState(() => _error = 'Please attach a payment screenshot');
      return;
    }

    setState(() => _submitting = true);
    try {
      final urls = await _service.getUploadUrl(_screenshot!.name);
      final bytes = await File(_screenshot!.path).readAsBytes();
      await http.put(Uri.parse(urls['upload_url']!), body: bytes, headers: {'Content-Type': 'image/jpeg'});
      await _service.submitPayment(amount: amount, screenshotKey: urls['key']!);

      setState(() {
        _submitting = false;
        _success = 'Payment submitted for verification';
        _amountCtrl.clear();
        _screenshot = null;
      });
      _load();
    } catch (e) {
      setState(() { _submitting = false; _error = 'Failed to submit payment'; });
    }
  }

  Color _statusColor(String status) {
    switch (status) {
      case 'verified':
        return Colors.green;
      case 'rejected':
        return Colors.red;
      default:
        return Colors.orange;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.grey.shade50,
      drawer: const AppDrawer(),
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        title: const Text('My Payments', style: TextStyle(color: Color(0xFF1A1A1A), fontWeight: FontWeight.w600)),
      ),
      body: ResponsiveCenter(
        child: RefreshIndicator(
          onRefresh: _load,
          color: _teal,
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              // Upload form
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12), border: Border.all(color: Colors.grey.shade200)),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Submit a Payment', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 15)),
                    const SizedBox(height: 12),
                    TextField(
                      controller: _amountCtrl,
                      keyboardType: const TextInputType.numberWithOptions(decimal: true),
                      decoration: InputDecoration(
                        labelText: 'Amount (₹)',
                        filled: true,
                        fillColor: Colors.grey.shade50,
                        border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide(color: Colors.grey.shade200)),
                      ),
                    ),
                    const SizedBox(height: 12),
                    GestureDetector(
                      onTap: _pickScreenshot,
                      child: Container(
                        width: double.infinity,
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        decoration: BoxDecoration(
                          border: Border.all(color: _screenshot != null ? _teal : Colors.grey.shade300),
                          borderRadius: BorderRadius.circular(10),
                          color: _screenshot != null ? _teal.withValues(alpha: 0.05) : Colors.grey.shade50,
                        ),
                        child: Column(
                          children: [
                            Icon(_screenshot != null ? Icons.check_circle_outline : Icons.add_photo_alternate_outlined,
                                color: _screenshot != null ? _teal : Colors.grey, size: 28),
                            const SizedBox(height: 6),
                            Text(
                              _screenshot != null ? _screenshot!.name : 'Attach payment screenshot',
                              style: TextStyle(fontSize: 13, color: _screenshot != null ? _teal : Colors.grey),
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
                    if (_success != null) ...[
                      const SizedBox(height: 8),
                      Text(_success!, style: const TextStyle(color: Colors.green, fontSize: 12)),
                    ],
                    const SizedBox(height: 16),
                    SizedBox(
                      width: double.infinity,
                      child: ElevatedButton(
                        onPressed: _submitting ? null : _submit,
                        style: ElevatedButton.styleFrom(
                          backgroundColor: _teal,
                          foregroundColor: Colors.white,
                          padding: const EdgeInsets.symmetric(vertical: 12),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                        ),
                        child: _submitting
                            ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                            : const Text('Submit Payment', style: TextStyle(fontWeight: FontWeight.w600)),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 24),

              const Text('Payment History', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14, color: Colors.grey)),
              const SizedBox(height: 10),

              if (_loading)
                const Center(child: Padding(padding: EdgeInsets.all(24), child: CircularProgressIndicator(color: _teal)))
              else if (_payments.isEmpty)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 24),
                  child: Center(child: Text('No payments submitted yet', style: TextStyle(color: Colors.grey.shade400))),
                )
              else
                ..._payments.map((p) => Container(
                      margin: const EdgeInsets.only(bottom: 10),
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12), border: Border.all(color: Colors.grey.shade200)),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Text('₹${p.amount.toStringAsFixed(2)}', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                                decoration: BoxDecoration(color: _statusColor(p.status).withValues(alpha: 0.1), borderRadius: BorderRadius.circular(8)),
                                child: Text(p.status, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: _statusColor(p.status))),
                              ),
                            ],
                          ),
                          const SizedBox(height: 6),
                          Text('Submitted ${_dateTimeFmt.format(p.createdAt)}', style: TextStyle(fontSize: 12, color: Colors.grey.shade500)),
                          if (p.verifiedAt != null) ...[
                            const SizedBox(height: 2),
                            Text(
                              '${p.status == 'rejected' ? 'Rejected' : 'Verified'} ${_dateTimeFmt.format(p.verifiedAt!)}',
                              style: TextStyle(fontSize: 12, color: Colors.grey.shade500),
                            ),
                          ],
                          if (p.status == 'rejected' && p.rejectionReason != null) ...[
                            const SizedBox(height: 6),
                            Text('Reason: ${p.rejectionReason}', style: const TextStyle(fontSize: 12, color: Colors.red)),
                          ],
                        ],
                      ),
                    )),
            ],
          ),
        ),
      ),
    );
  }
}
