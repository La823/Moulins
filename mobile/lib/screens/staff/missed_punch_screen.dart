import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../../services/missed_punch_service.dart';
import '../../services/staff_service.dart' show staffError;
import '../../widgets/shell_leading.dart';

const _teal = Color(0xFF00A6A4);

String _clock(String hhmm) {
  final p = hhmm.split(':');
  if (p.length < 2) return hhmm;
  final h = int.tryParse(p[0]) ?? 0;
  return '${h % 12 == 0 ? 12 : h % 12}:${p[1]} ${h < 12 ? 'AM' : 'PM'}';
}

String _day(String ymd) {
  final d = DateTime.tryParse(ymd);
  return d == null ? ymd : DateFormat('EEE, d MMM y').format(d);
}

Widget _statusChip(String status) {
  final (label, bg, fg) = switch (status) {
    'approved' => ('Approved', Colors.green.shade50, Colors.green.shade700),
    'rejected' => ('Rejected', Colors.red.shade50, Colors.red.shade700),
    'cancelled' => ('Withdrawn', Colors.grey.shade100, Colors.grey.shade600),
    _ => ('Pending', Colors.amber.shade50, Colors.amber.shade800),
  };
  return Container(
    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
    decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(20)),
    child: Text(label, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: fg)),
  );
}

/// The staff member's own missed punches: log one (check-in or check-out,
/// date and time), see their status, withdraw a pending one.
class MyMissedPunchesScreen extends StatefulWidget {
  const MyMissedPunchesScreen({super.key});

  @override
  State<MyMissedPunchesScreen> createState() => _MyMissedPunchesScreenState();
}

class _MyMissedPunchesScreenState extends State<MyMissedPunchesScreen> {
  final _service = MissedPunchService();
  MyMissedPunches? _data;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final d = await _service.mine();
      if (mounted)
        setState(() {
          _data = d;
          _error = null;
        });
    } catch (e) {
      if (mounted) setState(() => _error = staffError(e));
    }
  }

  Future<void> _withdraw(MissedPunch m) async {
    try {
      await _service.withdraw(m.id);
      _load();
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(staffError(e))));
    }
  }

  Future<void> _log() async {
    final sent = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      showDragHandle: true,
      backgroundColor: Colors.white,
      builder: (_) => _LogSheet(service: _service, today: _data?.today ?? ''),
    );
    if (sent == true) {
      _load();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Missed punch sent for approval.')));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final d = _data;
    return Scaffold(
      appBar: AppBar(leading: const ShellBack(), title: const Text('Missed Punch')),
      floatingActionButton: (d?.linked ?? false)
          ? FloatingActionButton.extended(
              backgroundColor: _teal,
              foregroundColor: Colors.white,
              onPressed: _log,
              icon: const Icon(Icons.more_time),
              label: const Text('Log missed punch'),
            )
          : null,
      body: _error != null
          ? Center(child: Padding(padding: const EdgeInsets.all(24), child: Text(_error!, textAlign: TextAlign.center)))
          : d == null
              ? const Center(child: CircularProgressIndicator(color: _teal))
              : !d.linked
                  ? const Center(
                      child: Padding(
                        padding: EdgeInsets.all(24),
                        child: Text("Your login isn't linked to the attendance system yet. Ask an admin.", textAlign: TextAlign.center),
                      ),
                    )
                  : RefreshIndicator(
                      color: _teal,
                      onRefresh: _load,
                      child: ListView(
                        padding: const EdgeInsets.fromLTRB(16, 12, 16, 96),
                        children: [
                          Text('Forgot to punch on the machine? Log the missed check-in or check-out for approval.',
                              style: TextStyle(fontSize: 12.5, color: Colors.grey.shade600)),
                          const SizedBox(height: 12),
                          if (d.items.isEmpty)
                            Padding(
                              padding: const EdgeInsets.only(top: 40),
                              child: Center(child: Text('None logged yet.', style: TextStyle(color: Colors.grey.shade400))),
                            ),
                          for (final m in d.items)
                            Card(
                              elevation: 0,
                              margin: const EdgeInsets.only(bottom: 8),
                              shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(12), side: BorderSide(color: Colors.grey.shade200)),
                              child: ListTile(
                                leading: Icon(m.type == 'out' ? Icons.logout : Icons.login, color: _teal),
                                title: Text('${m.kind} at ${_clock(m.time)}',
                                    style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
                                subtitle: Text(_day(m.date), style: const TextStyle(fontSize: 12.5)),
                                trailing: Column(
                                  mainAxisSize: MainAxisSize.min,
                                  crossAxisAlignment: CrossAxisAlignment.end,
                                  children: [
                                    _statusChip(m.status),
                                    if (m.status == 'pending')
                                      GestureDetector(
                                        onTap: () => _withdraw(m),
                                        child: Padding(
                                          padding: const EdgeInsets.only(top: 4),
                                          child: Text('Withdraw', style: TextStyle(fontSize: 11.5, color: Colors.grey.shade600)),
                                        ),
                                      ),
                                  ],
                                ),
                              ),
                            ),
                        ],
                      ),
                    ),
    );
  }
}

// The log form: what was missed, date, time.
class _LogSheet extends StatefulWidget {
  final MissedPunchService service;
  final String today;
  const _LogSheet({required this.service, required this.today});

  @override
  State<_LogSheet> createState() => _LogSheetState();
}

class _LogSheetState extends State<_LogSheet> {
  String _type = 'in';
  late DateTime _date = DateTime.tryParse(widget.today) ?? DateTime.now();
  TimeOfDay? _time;
  bool _sending = false;
  String? _error;

  Future<void> _send() async {
    if (_time == null) {
      setState(() => _error = 'Choose the time.');
      return;
    }
    setState(() {
      _sending = true;
      _error = null;
    });
    try {
      final t = '${_time!.hour.toString().padLeft(2, '0')}:${_time!.minute.toString().padLeft(2, '0')}';
      await widget.service.log(date: DateFormat('yyyy-MM-dd').format(_date), type: _type, time: t);
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      if (mounted) {
        setState(() {
          _sending = false;
          _error = staffError(e);
        });
      }
    }
  }

  Widget _box(IconData icon, String label, String value, VoidCallback onTap) => InkWell(
        borderRadius: BorderRadius.circular(10),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          decoration: BoxDecoration(
            color: Colors.grey.shade50,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: Colors.grey.shade200),
          ),
          child: Row(children: [
            Icon(icon, size: 19, color: _teal),
            const SizedBox(width: 10),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(label, style: TextStyle(fontSize: 11, color: Colors.grey.shade500)),
                Text(value, style: const TextStyle(fontSize: 14)),
              ]),
            ),
          ]),
        ),
      );

  @override
  Widget build(BuildContext context) {
    final today = DateTime.tryParse(widget.today) ?? DateTime.now();
    return Padding(
      padding: EdgeInsets.fromLTRB(20, 0, 20, MediaQuery.of(context).viewInsets.bottom + 20),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text('Log a missed punch', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
          const SizedBox(height: 16),
          Text('What was missed', style: TextStyle(fontSize: 12, color: Colors.grey.shade600)),
          const SizedBox(height: 6),
          SegmentedButton<String>(
            segments: const [
              ButtonSegment(value: 'in', label: Text('Check-in'), icon: Icon(Icons.login)),
              ButtonSegment(value: 'out', label: Text('Check-out'), icon: Icon(Icons.logout)),
            ],
            selected: {_type},
            onSelectionChanged: (s) => setState(() => _type = s.first),
          ),
          const SizedBox(height: 14),
          Row(children: [
            Expanded(
              child: _box(Icons.calendar_today_outlined, 'Date', DateFormat('d MMM y').format(_date), () async {
                final d = await showDatePicker(
                  context: context,
                  initialDate: _date,
                  firstDate: today.subtract(const Duration(days: 60)),
                  lastDate: today,
                );
                if (d != null) setState(() => _date = d);
              }),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: _box(Icons.schedule, 'Time', _time == null ? 'Choose' : _time!.format(context), () async {
                final t = await showTimePicker(context: context, initialTime: _time ?? TimeOfDay(hour: _type == 'in' ? 9 : 18, minute: 0));
                if (t != null) setState(() => _time = t);
              }),
            ),
          ]),
          if (_error != null) ...[
            const SizedBox(height: 10),
            Text(_error!, style: const TextStyle(color: Colors.red, fontSize: 12.5)),
          ],
          const SizedBox(height: 16),
          SizedBox(
            height: 48,
            child: ElevatedButton(
              onPressed: _sending ? null : _send,
              style: ElevatedButton.styleFrom(
                backgroundColor: _teal,
                foregroundColor: Colors.white,
                elevation: 0,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              ),
              child: _sending
                  ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                  : const Text('Send for approval', style: TextStyle(fontWeight: FontWeight.w600)),
            ),
          ),
        ],
      ),
    );
  }
}

/// Everyone's missed punches for approvers (leaves_view to see, leaves_edit
/// to approve or reject): pending first.
class MissedPunchApprovalsScreen extends StatefulWidget {
  final bool canDecide;
  const MissedPunchApprovalsScreen({super.key, required this.canDecide});

  @override
  State<MissedPunchApprovalsScreen> createState() => _MissedPunchApprovalsScreenState();
}

class _MissedPunchApprovalsScreenState extends State<MissedPunchApprovalsScreen> {
  final _service = MissedPunchService();
  String _status = 'pending';
  List<MissedPunch>? _items;
  int _pending = 0;
  String? _error;
  int? _busy;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final (list, pending) = await _service.all(status: _status);
      if (mounted)
        setState(() {
          _items = list;
          _pending = pending;
          _error = null;
        });
    } catch (e) {
      if (mounted) setState(() => _error = staffError(e));
    }
  }

  Future<void> _decide(MissedPunch m, bool approve) async {
    setState(() => _busy = m.id);
    try {
      await _service.decide(m.id, approve: approve);
      await _load();
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(staffError(e))));
    } finally {
      if (mounted) setState(() => _busy = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final items = _items;
    return Scaffold(
      appBar: AppBar(leading: const ShellBack(), title: Text(_pending > 0 ? 'Missed Punches ($_pending)' : 'Missed Punches')),
      body: Column(children: [
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.fromLTRB(12, 8, 12, 4),
          child: Row(children: [
            for (final (v, l) in const [('pending', 'Pending'), ('approved', 'Approved'), ('rejected', 'Rejected'), ('', 'All')])
              Padding(
                padding: const EdgeInsets.only(right: 6),
                child: ChoiceChip(
                  label: Text(l),
                  selected: _status == v,
                  onSelected: (_) {
                    setState(() {
                      _status = v;
                      _items = null;
                    });
                    _load();
                  },
                ),
              ),
          ]),
        ),
        Expanded(
          child: _error != null
              ? Center(child: Text(_error!))
              : items == null
                  ? const Center(child: CircularProgressIndicator(color: _teal))
                  : RefreshIndicator(
                      color: _teal,
                      onRefresh: _load,
                      child: items.isEmpty
                          ? ListView(children: [
                              Padding(
                                padding: const EdgeInsets.only(top: 80),
                                child: Center(
                                    child: Text(_status == 'pending' ? 'Nothing waiting.' : 'None.',
                                        style: TextStyle(color: Colors.grey.shade400))),
                              ),
                            ])
                          : ListView.builder(
                              padding: const EdgeInsets.fromLTRB(12, 4, 12, 24),
                              itemCount: items.length,
                              itemBuilder: (_, i) {
                                final m = items[i];
                                return Card(
                                  elevation: 0,
                                  margin: const EdgeInsets.only(bottom: 8),
                                  shape: RoundedRectangleBorder(
                                      borderRadius: BorderRadius.circular(12), side: BorderSide(color: Colors.grey.shade200)),
                                  child: Padding(
                                    padding: const EdgeInsets.all(12),
                                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                                      Row(children: [
                                        Expanded(
                                          child: Text('${m.name}  #${m.empCode}',
                                              style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
                                        ),
                                        _statusChip(m.status),
                                      ]),
                                      const SizedBox(height: 4),
                                      Text('Missed ${m.kind.toLowerCase()} at ${_clock(m.time)} · ${_day(m.date)}',
                                          style: TextStyle(fontSize: 13, color: Colors.grey.shade800)),
                                      if (m.status == 'pending' && widget.canDecide) ...[
                                        const SizedBox(height: 10),
                                        Row(children: [
                                          Expanded(
                                            child: OutlinedButton(
                                              onPressed: _busy == m.id ? null : () => _decide(m, false),
                                              child: const Text('Reject'),
                                            ),
                                          ),
                                          const SizedBox(width: 10),
                                          Expanded(
                                            child: ElevatedButton(
                                              onPressed: _busy == m.id ? null : () => _decide(m, true),
                                              style: ElevatedButton.styleFrom(
                                                  backgroundColor: Colors.green.shade600, foregroundColor: Colors.white, elevation: 0),
                                              child: const Text('Approve'),
                                            ),
                                          ),
                                        ]),
                                      ] else if (m.decidedByName != null && m.status != 'pending')
                                        Padding(
                                          padding: const EdgeInsets.only(top: 4),
                                          child: Text('${m.status[0].toUpperCase()}${m.status.substring(1)} by ${m.decidedByName}',
                                              style: TextStyle(fontSize: 11.5, color: Colors.grey.shade500)),
                                        ),
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
