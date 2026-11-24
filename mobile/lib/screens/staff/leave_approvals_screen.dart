import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../../providers/auth_provider.dart';
import '../../services/staff_service.dart';
import '../../widgets/shell_leading.dart';

const _teal = Color(0xFF00A6A4);

/// Staff leave requests, as on the website's Leaves page (leaves_view):
/// pending first. Approvers (leaves_edit) approve or reject; the paid /
/// unpaid split is worked out from the balance, as on the website.
class LeaveApprovalsScreen extends ConsumerStatefulWidget {
  const LeaveApprovalsScreen({super.key});

  @override
  ConsumerState<LeaveApprovalsScreen> createState() => _LeaveApprovalsScreenState();
}

class _LeaveApprovalsScreenState extends ConsumerState<LeaveApprovalsScreen> {
  final _service = StaffService();
  String _status = 'pending';
  List<LeaveRequest> _leaves = [];
  int _pending = 0;
  bool _loading = true;
  String? _error;
  int? _busy;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => (_loading = true, _error = null));
    try {
      final (list, pending) = await _service.leaves(status: _status);
      if (mounted) setState(() => (_leaves = list, _pending = pending));
    } catch (e) {
      if (mounted) setState(() => _error = staffError(e));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _decide(LeaveRequest l, bool approve) async {
    final note = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(approve ? 'Approve leave for ${l.name}?' : 'Reject leave for ${l.name}?'),
        content: TextField(
          controller: note,
          decoration: InputDecoration(labelText: approve ? 'Note (optional)' : 'Reason (optional)'),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Back')),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: FilledButton.styleFrom(backgroundColor: approve ? Colors.green.shade700 : Colors.red.shade700),
            child: Text(approve ? 'Approve' : 'Reject'),
          ),
        ],
      ),
    );
    if (ok != true) return;
    setState(() => _busy = l.id);
    try {
      approve ? await _service.approveLeave(l.id, note: note.text.trim()) : await _service.rejectLeave(l.id, note: note.text.trim());
      await _load();
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(staffError(e))));
    } finally {
      if (mounted) setState(() => _busy = null);
    }
  }

  String _d(String iso) {
    final t = DateTime.tryParse(iso);
    return t == null ? iso : DateFormat('EEE d MMM').format(t);
  }

  @override
  Widget build(BuildContext context) {
    final canDecide = ref.watch(authProvider).user?.has('leaves_edit') ?? false;
    return Scaffold(
      appBar: AppBar(leading: const ShellBack(), title: Text(_pending > 0 ? 'Leave Requests ($_pending pending)' : 'Leave Requests')),
      body: Column(children: [
        SizedBox(
          height: 48,
          child: ListView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
            children: [
              for (final (k, l) in const [('pending', 'Pending'), ('approved', 'Approved'), ('rejected', 'Rejected'), ('', 'All')])
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 4),
                  child: ChoiceChip(
                    label: Text(l),
                    selected: _status == k,
                    selectedColor: _teal.withValues(alpha: 0.15),
                    onSelected: (_) {
                      setState(() => _status = k);
                      _load();
                    },
                  ),
                ),
            ],
          ),
        ),
        Expanded(
          child: _loading
              ? const Center(child: CircularProgressIndicator(color: _teal))
              : _error != null
                  ? Center(child: Text(_error!))
                  : _leaves.isEmpty
                      ? Center(child: Text('No leave requests here.', style: TextStyle(color: Colors.grey.shade500)))
                      : RefreshIndicator(
                          color: _teal,
                          onRefresh: _load,
                          child: ListView.builder(
                            padding: const EdgeInsets.fromLTRB(12, 4, 12, 24),
                            itemCount: _leaves.length,
                            itemBuilder: (context, i) {
                              final l = _leaves[i];
                              final when = l.fromDate == l.toDate ? _d(l.fromDate) : '${_d(l.fromDate)} – ${_d(l.toDate)}';
                              final days = l.days == l.days.roundToDouble() ? l.days.toStringAsFixed(0) : l.days.toString();
                              return Card(
                                elevation: 0,
                                margin: const EdgeInsets.symmetric(vertical: 5),
                                shape: RoundedRectangleBorder(side: BorderSide(color: Colors.grey.shade200), borderRadius: BorderRadius.circular(12)),
                                child: Padding(
                                  padding: const EdgeInsets.fromLTRB(14, 12, 14, 10),
                                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                                    Row(children: [
                                      Expanded(child: Text(l.name, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15))),
                                      Text(l.status, style: TextStyle(fontSize: 12.5, color: Colors.grey.shade700)),
                                    ]),
                                    const SizedBox(height: 4),
                                    Text('$when · $days day${days == '1' ? '' : 's'}${l.halfDay ? ' (half day)' : ''}',
                                        style: const TextStyle(fontSize: 13.5)),
                                    if (l.reason.isNotEmpty)
                                      Padding(
                                        padding: const EdgeInsets.only(top: 4),
                                        child: Text(l.reason, style: TextStyle(fontSize: 13, color: Colors.grey.shade700)),
                                      ),
                                    if (l.decidedBy.isNotEmpty)
                                      Padding(
                                        padding: const EdgeInsets.only(top: 4),
                                        child: Text('By ${l.decidedBy}${l.decisionNote.isNotEmpty ? ': ${l.decisionNote}' : ''}',
                                            style: TextStyle(fontSize: 12, color: Colors.grey.shade600)),
                                      ),
                                    if (canDecide && l.status == 'pending') ...[
                                      const SizedBox(height: 8),
                                      Row(children: [
                                        Expanded(
                                          child: OutlinedButton(
                                            onPressed: _busy == l.id ? null : () => _decide(l, false),
                                            style: OutlinedButton.styleFrom(foregroundColor: Colors.red.shade700),
                                            child: const Text('Reject'),
                                          ),
                                        ),
                                        const SizedBox(width: 10),
                                        Expanded(
                                          child: FilledButton(
                                            onPressed: _busy == l.id ? null : () => _decide(l, true),
                                            style: FilledButton.styleFrom(backgroundColor: Colors.green.shade700),
                                            child: const Text('Approve'),
                                          ),
                                        ),
                                      ]),
                                    ],
                                  ]),
                                ),
                              );
                            },
                          ),
                        ),
        ),
      ]),
    );
  }
}
