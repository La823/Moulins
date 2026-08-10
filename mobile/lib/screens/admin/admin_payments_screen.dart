import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../../models/payment.dart';
import '../../services/payment_service.dart';

const _teal = Color(0xFF00A6A4);
const _ink = Color(0xFF1A1A1A);

final _dateTimeFmt = DateFormat('d MMM y, h:mm a');

class AdminPaymentsScreen extends StatefulWidget {
  const AdminPaymentsScreen({super.key});

  @override
  State<AdminPaymentsScreen> createState() => _AdminPaymentsScreenState();
}

class _AdminPaymentsScreenState extends State<AdminPaymentsScreen> {
  final _service = PaymentService();
  List<Payment> _payments = [];
  bool _loading = true;
  String _statusFilter = '';
  String? _updatingId;

  static const _tabs = [
    ('', 'All'),
    ('pending', 'Pending'),
    ('verified', 'Verified'),
    ('rejected', 'Rejected'),
  ];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final list = await _service.getAllPayments(status: _statusFilter);
      setState(() { _payments = list; _loading = false; });
    } catch (_) {
      setState(() => _loading = false);
    }
  }

  Future<void> _setStatus(Payment p, String status, {String? reason}) async {
    setState(() => _updatingId = p.id);
    try {
      await _service.setPaymentStatus(p.id, status, rejectionReason: reason);
      _load();
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Could not update payment')),
        );
      }
    } finally {
      if (mounted) setState(() => _updatingId = null);
    }
  }

  Future<void> _confirmReject(Payment p) async {
    final ctrl = TextEditingController();
    final reason = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Reject payment?'),
        content: TextField(
          controller: ctrl,
          decoration: const InputDecoration(hintText: 'Reason (optional)'),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          TextButton(onPressed: () => Navigator.pop(ctx, ctrl.text.trim()), child: const Text('Reject', style: TextStyle(color: Colors.red))),
        ],
      ),
    );
    if (reason != null) _setStatus(p, 'rejected', reason: reason.isEmpty ? null : reason);
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
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        foregroundColor: Colors.black,
        title: const Text('Payments', style: TextStyle(color: _ink, fontWeight: FontWeight.w600)),
      ),
      body: Column(
        children: [
          Container(
            color: Colors.white,
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            child: Row(
              children: _tabs.map((t) {
                final (value, label) = t;
                final active = _statusFilter == value;
                return Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: GestureDetector(
                    onTap: () { setState(() => _statusFilter = value); _load(); },
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                      decoration: BoxDecoration(
                        color: active ? _ink : Colors.grey.shade100,
                        borderRadius: BorderRadius.circular(20),
                      ),
                      child: Text(label, style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: active ? Colors.white : Colors.grey.shade600)),
                    ),
                  ),
                );
              }).toList(),
            ),
          ),
          Expanded(
            child: RefreshIndicator(
              onRefresh: _load,
              color: _teal,
              child: _loading
                  ? const Center(child: CircularProgressIndicator(color: _teal))
                  : _payments.isEmpty
                      ? ListView(
                          children: [
                            Padding(
                              padding: const EdgeInsets.symmetric(vertical: 60),
                              child: Center(child: Text('No payments found', style: TextStyle(color: Colors.grey.shade400))),
                            ),
                          ],
                        )
                      : ListView.builder(
                          padding: const EdgeInsets.all(16),
                          itemCount: _payments.length,
                          itemBuilder: (ctx, i) {
                            final p = _payments[i];
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
                                      Expanded(
                                        child: Column(
                                          crossAxisAlignment: CrossAxisAlignment.start,
                                          children: [
                                            Text(p.userName?.isNotEmpty == true ? p.userName! : 'No name', style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
                                            Text(p.userPhone ?? '', style: TextStyle(fontSize: 12, color: Colors.grey.shade500)),
                                          ],
                                        ),
                                      ),
                                      Container(
                                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                                        decoration: BoxDecoration(color: _statusColor(p.status).withValues(alpha: 0.1), borderRadius: BorderRadius.circular(8)),
                                        child: Text(p.status, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: _statusColor(p.status))),
                                      ),
                                    ],
                                  ),
                                  const SizedBox(height: 10),
                                  GestureDetector(
                                    onTap: () => showDialog(
                                      context: context,
                                      builder: (_) => Dialog(
                                        child: InteractiveViewer(child: Image.network(p.screenshotUrl)),
                                      ),
                                    ),
                                    child: ClipRRect(
                                      borderRadius: BorderRadius.circular(8),
                                      child: Image.network(p.screenshotUrl, height: 120, width: double.infinity, fit: BoxFit.cover,
                                          errorBuilder: (_, __, ___) => Container(height: 120, color: Colors.grey.shade100, child: const Icon(Icons.image_not_supported_outlined, color: Colors.grey))),
                                    ),
                                  ),
                                  const SizedBox(height: 10),
                                  Row(
                                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                    children: [
                                      Text('₹${p.amount.toStringAsFixed(2)}', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16, color: _teal)),
                                      Text('Submitted ${_dateTimeFmt.format(p.createdAt)}', style: TextStyle(fontSize: 11, color: Colors.grey.shade400)),
                                    ],
                                  ),
                                  if (p.verifiedAt != null) ...[
                                    const SizedBox(height: 4),
                                    Text(
                                      '${p.status == 'rejected' ? 'Rejected' : 'Verified'} ${_dateTimeFmt.format(p.verifiedAt!)}',
                                      style: TextStyle(fontSize: 11, color: Colors.grey.shade400),
                                    ),
                                  ],
                                  if (p.status == 'rejected' && p.rejectionReason != null) ...[
                                    const SizedBox(height: 6),
                                    Text('Reason: ${p.rejectionReason}', style: const TextStyle(fontSize: 12, color: Colors.red)),
                                  ],
                                  const SizedBox(height: 12),
                                  Row(
                                    children: [
                                      if (p.status != 'pending') ...[
                                        Expanded(
                                          child: OutlinedButton(
                                            onPressed: _updatingId == p.id ? null : () => _setStatus(p, 'pending'),
                                            style: OutlinedButton.styleFrom(foregroundColor: Colors.grey.shade700, side: BorderSide(color: Colors.grey.shade400)),
                                            child: const Text('Revert to Pending'),
                                          ),
                                        ),
                                        const SizedBox(width: 10),
                                      ],
                                      if (p.status != 'rejected') ...[
                                        Expanded(
                                          child: OutlinedButton(
                                            onPressed: _updatingId == p.id ? null : () => _confirmReject(p),
                                            style: OutlinedButton.styleFrom(foregroundColor: Colors.red, side: const BorderSide(color: Colors.red)),
                                            child: const Text('Reject'),
                                          ),
                                        ),
                                        const SizedBox(width: 10),
                                      ],
                                      if (p.status != 'verified')
                                        Expanded(
                                          child: ElevatedButton(
                                            onPressed: _updatingId == p.id ? null : () => _setStatus(p, 'verified'),
                                            style: ElevatedButton.styleFrom(backgroundColor: _teal, foregroundColor: Colors.white),
                                            child: _updatingId == p.id
                                                ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                                                : const Text('Verify'),
                                          ),
                                        ),
                                    ],
                                  ),
                                ],
                              ),
                            );
                          },
                        ),
            ),
          ),
        ],
      ),
    );
  }
}
