import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../../services/staff_service.dart';
import '../../widgets/shell_leading.dart';

const _teal = Color(0xFF00A6A4);

/// A staff member's own fingerprint-scanner attendance and leave (server
/// /etime/me): the month's days, the leave balance, applying for leave and
/// cancelling a request still pending. Needs the login linked to their
/// scanner employee (website: Attendance → staff logins).
class MyLeaveScreen extends StatefulWidget {
  const MyLeaveScreen({super.key});

  @override
  State<MyLeaveScreen> createState() => _MyLeaveScreenState();
}

class _MyLeaveScreenState extends State<MyLeaveScreen> {
  final _service = StaffService();
  MyLeave? _me;
  AttendanceMonth? _month;
  DateTime _monthStart = DateTime(DateTime.now().year, DateTime.now().month);
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  String get _monthKey => DateFormat('yyyy-MM').format(_monthStart);

  Future<void> _load() async {
    setState(() => (_loading = true, _error = null));
    try {
      final me = await _service.myLeave();
      AttendanceMonth? month;
      if (me.linked) month = await _service.myMonth(_monthKey);
      if (mounted) setState(() => (_me = me, _month = month));
    } catch (e) {
      if (mounted) setState(() => _error = staffError(e));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _changeMonth(int by) async {
    setState(() => _monthStart = DateTime(_monthStart.year, _monthStart.month + by));
    try {
      final m = await _service.myMonth(_monthKey);
      if (mounted) setState(() => _month = m);
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(staffError(e))));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        leading: const ShellBack(),
        title: const Text('My Attendance & Leave'),
        actions: [
          // log a check-in or check-out that wasn't punched on the machine
          TextButton.icon(
            onPressed: () => context.push('/staff/missed-punch'),
            icon: const Icon(Icons.more_time, size: 18, color: _teal),
            label: const Text('Missed punch', style: TextStyle(color: _teal)),
          ),
        ],
      ),
      floatingActionButton: (_me?.linked ?? false)
          ? FloatingActionButton.extended(
              backgroundColor: _teal,
              foregroundColor: Colors.white,
              onPressed: _apply,
              icon: const Icon(Icons.event_busy),
              label: const Text('Apply for leave'),
            )
          : null,
      body: _body(),
    );
  }

  Widget _body() {
    if (_loading) return const Center(child: CircularProgressIndicator(color: _teal));
    if (_error != null) {
      return Center(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Padding(padding: const EdgeInsets.all(16), child: Text(_error!, textAlign: TextAlign.center)),
          OutlinedButton(onPressed: _load, child: const Text('Try again')),
        ]),
      );
    }
    final me = _me!;
    if (!me.linked) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(28),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Icon(Icons.fingerprint, size: 48, color: Colors.grey.shade400),
            const SizedBox(height: 12),
            const Text('Not linked to the attendance scanner yet', style: TextStyle(fontWeight: FontWeight.w600)),
            const SizedBox(height: 6),
            Text('Ask an admin to link your login to your scanner employee. Then your attendance and leave show here.',
                textAlign: TextAlign.center, style: TextStyle(color: Colors.grey.shade600, fontSize: 13)),
          ]),
        ),
      );
    }
    return RefreshIndicator(
      color: _teal,
      onRefresh: _load,
      child: ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 96), children: [
        _balanceCard(me),
        const SizedBox(height: 14),
        _monthCard(),
        const SizedBox(height: 14),
        const Text('My leave requests', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 15)),
        const SizedBox(height: 6),
        if (me.leaves.isEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 12),
            child: Text('No leave requests yet.', style: TextStyle(color: Colors.grey.shade500)),
          ),
        for (final l in me.leaves) _leaveTile(l),
      ]),
    );
  }

  Widget _balanceCard(MyLeave me) {
    String n(double v) => v == v.roundToDouble() ? v.toStringAsFixed(0) : v.toStringAsFixed(1);
    Widget stat(String label, String value, {Color? color}) => Expanded(
          child: Column(children: [
            Text(value, style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700, color: color)),
            const SizedBox(height: 2),
            Text(label, textAlign: TextAlign.center, style: TextStyle(fontSize: 11.5, color: Colors.grey.shade600)),
          ]),
        );
    return Card(
      elevation: 0,
      color: _teal.withValues(alpha: 0.06),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 8),
        child: Row(children: [
          stat('Leave available', n(me.balance.available), color: _teal),
          stat('Used this month', n(me.balance.usedThisMonth)),
          stat('Waiting approval', n(me.balance.pendingDays), color: Colors.orange.shade800),
        ]),
      ),
    );
  }

  static const _stateLabel = {
    'present': ('Present', Color(0xFF15803D)),
    'in': ('Punched in', Color(0xFF15803D)),
    'half_day': ('Half day', Color(0xFFB45309)),
    'absent': ('Absent', Color(0xFFB91C1C)),
    'missed_punch': ('Missed punch', Color(0xFFC2410C)),
    'weekly_off': ('Weekly off', Color(0xFF6B7280)),
    'holiday': ('Holiday', Color(0xFF7C3AED)),
    'leave': ('Leave', Color(0xFF1D4ED8)),
    'upcoming': ('', Color(0xFFD1D5DB)),
    'not_synced': ('Not synced', Color(0xFF9CA3AF)),
  };

  Widget _monthCard() {
    final m = _month;
    return Card(
      elevation: 0,
      shape: RoundedRectangleBorder(side: BorderSide(color: Colors.grey.shade200), borderRadius: BorderRadius.circular(12)),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(8, 4, 8, 10),
        child: Column(children: [
          Row(children: [
            IconButton(icon: const Icon(Icons.chevron_left), onPressed: () => _changeMonth(-1)),
            Expanded(
              child: Text(DateFormat('MMMM yyyy').format(_monthStart),
                  textAlign: TextAlign.center, style: const TextStyle(fontWeight: FontWeight.w600)),
            ),
            IconButton(
              icon: const Icon(Icons.chevron_right),
              onPressed: _monthStart.isBefore(DateTime(DateTime.now().year, DateTime.now().month)) ? () => _changeMonth(1) : null,
            ),
          ]),
          if (m != null) ...[
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 8),
              child: Text(
                'Present ${m.present == m.present.roundToDouble() ? m.present.toStringAsFixed(0) : m.present} · Absent ${m.absent} · Leave ${m.leave == m.leave.roundToDouble() ? m.leave.toStringAsFixed(0) : m.leave} · Late ${m.late}',
                style: TextStyle(fontSize: 12.5, color: Colors.grey.shade700),
              ),
            ),
            const SizedBox(height: 6),
            for (final d in m.days.reversed)
              if (d.state != 'upcoming') _dayRow(d),
          ],
        ]),
      ),
    );
  }

  Widget _dayRow(AttendanceDay d) {
    final date = DateTime.tryParse(d.date);
    final (label, color) = _stateLabel[d.state] ?? (d.state, Colors.grey);
    final times = [if (d.inTime.isNotEmpty) 'In ${d.inTime}', if (d.outTime.isNotEmpty) 'Out ${d.outTime}'].join(' · ');
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
      child: Row(children: [
        SizedBox(
          width: 86,
          child: Text(date == null ? d.date : DateFormat('EEE d MMM').format(date), style: const TextStyle(fontSize: 13)),
        ),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
          decoration: BoxDecoration(color: color.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(10)),
          child: Text(label, style: TextStyle(fontSize: 11.5, color: color, fontWeight: FontWeight.w600)),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
            [times, if (d.lateMinutes > 0) '${d.lateMinutes} min late'].where((s) => s.isNotEmpty).join(' · '),
            style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
            overflow: TextOverflow.ellipsis,
          ),
        ),
      ]),
    );
  }

  Widget _leaveTile(LeaveRequest l) {
    final color = switch (l.status) {
      'approved' => Colors.green.shade700,
      'rejected' => Colors.red.shade700,
      'cancelled' => Colors.grey.shade600,
      _ => Colors.orange.shade800,
    };
    final when = l.fromDate == l.toDate ? _d(l.fromDate) : '${_d(l.fromDate)} – ${_d(l.toDate)}';
    return Card(
      elevation: 0,
      margin: const EdgeInsets.symmetric(vertical: 4),
      shape: RoundedRectangleBorder(side: BorderSide(color: Colors.grey.shade200), borderRadius: BorderRadius.circular(10)),
      child: ListTile(
        title: Text('$when${l.halfDay ? ' (half day)' : ''}', style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
        subtitle: Text(
          [l.reason, if (l.decisionNote.isNotEmpty) 'Note: ${l.decisionNote}', if (l.decidedBy.isNotEmpty) 'By ${l.decidedBy}']
              .where((s) => s.isNotEmpty)
              .join('\n'),
          style: const TextStyle(fontSize: 12.5),
        ),
        trailing: Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.end, children: [
          Text('${l.status[0].toUpperCase()}${l.status.substring(1)}', style: TextStyle(color: color, fontWeight: FontWeight.w600, fontSize: 12.5)),
          if (l.status == 'pending')
            GestureDetector(
              onTap: () => _cancel(l),
              child: Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Text('Cancel', style: TextStyle(fontSize: 12, color: Colors.red.shade600, decoration: TextDecoration.underline)),
              ),
            ),
        ]),
      ),
    );
  }

  String _d(String iso) {
    final t = DateTime.tryParse(iso);
    return t == null ? iso : DateFormat('d MMM yyyy').format(t);
  }

  Future<void> _cancel(LeaveRequest l) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Cancel this leave request?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Keep it')),
          TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Cancel request')),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await _service.cancelMyLeave(l.id);
      await _load();
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(staffError(e))));
    }
  }

  Future<void> _apply() async {
    final done = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (ctx) => _ApplyLeaveSheet(service: _service),
    );
    if (done == true) {
      await _load();
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Leave request sent for approval.')));
    }
  }
}

class _ApplyLeaveSheet extends StatefulWidget {
  final StaffService service;
  const _ApplyLeaveSheet({required this.service});

  @override
  State<_ApplyLeaveSheet> createState() => _ApplyLeaveSheetState();
}

class _ApplyLeaveSheetState extends State<_ApplyLeaveSheet> {
  DateTime _from = DateTime.now();
  DateTime _to = DateTime.now();
  bool _halfDay = false;
  final _reason = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _reason.dispose();
    super.dispose();
  }

  Future<void> _pick(bool from) async {
    final now = DateTime.now();
    final d = await showDatePicker(
      context: context,
      initialDate: from ? _from : _to,
      firstDate: DateTime(now.year, now.month - 1),
      lastDate: DateTime(now.year + 1, now.month),
    );
    if (d == null) return;
    setState(() {
      if (from) {
        _from = d;
        if (_to.isBefore(d)) _to = d;
      } else {
        _to = d.isBefore(_from) ? _from : d;
      }
      if (_from != _to) _halfDay = false;
    });
  }

  Future<void> _submit() async {
    if (_reason.text.trim().isEmpty) return setState(() => _error = 'Please give a reason.');
    setState(() => (_busy = true, _error = null));
    final f = DateFormat('yyyy-MM-dd');
    try {
      await widget.service.applyLeave(from: f.format(_from), to: f.format(_to), halfDay: _halfDay, reason: _reason.text.trim());
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      if (mounted) setState(() => (_busy = false, _error = staffError(e)));
    }
  }

  @override
  Widget build(BuildContext context) {
    final fmt = DateFormat('EEE d MMM yyyy');
    final oneDay = _from.year == _to.year && _from.month == _to.month && _from.day == _to.day;
    return Padding(
      padding: EdgeInsets.fromLTRB(20, 16, 20, MediaQuery.of(context).viewInsets.bottom + 20),
      child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        const Text('Apply for leave', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700)),
        const SizedBox(height: 12),
        Row(children: [
          Expanded(
            child: OutlinedButton(onPressed: () => _pick(true), child: Text('From: ${fmt.format(_from)}', style: const TextStyle(fontSize: 13))),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: OutlinedButton(onPressed: () => _pick(false), child: Text('To: ${fmt.format(_to)}', style: const TextStyle(fontSize: 13))),
          ),
        ]),
        if (oneDay)
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('Half day'),
            value: _halfDay,
            activeThumbColor: _teal,
            onChanged: (v) => setState(() => _halfDay = v),
          ),
        const SizedBox(height: 8),
        TextField(
          controller: _reason,
          maxLines: 3,
          textCapitalization: TextCapitalization.sentences,
          decoration: const InputDecoration(labelText: 'Reason', border: OutlineInputBorder()),
        ),
        if (_error != null) Padding(padding: const EdgeInsets.only(top: 8), child: Text(_error!, style: TextStyle(color: Colors.red.shade700))),
        const SizedBox(height: 14),
        FilledButton(
          onPressed: _busy ? null : _submit,
          style: FilledButton.styleFrom(backgroundColor: _teal, minimumSize: const Size.fromHeight(46)),
          child: Text(_busy ? 'Sending…' : 'Send for approval'),
        ),
      ]),
    );
  }
}
