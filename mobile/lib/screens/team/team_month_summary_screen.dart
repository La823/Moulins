import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../models/team_member.dart';
import '../../models/team_visit_log.dart';
import '../../services/team_service.dart';

// The partner's month at a glance, matching the website's Month summary:
// the whole team with their counts, or — once a person is picked — that
// person's month in detail: how often they came in and when, how much they
// reported, their doctor visits, what's worth a second look, and every day
// with its updates.
//
// Working days are Monday to Saturday, counted only up to today.

const _teal = Color(0xFF00A6A4);
const _ink = Color(0xFF1A1A1A);
const _months = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

class _Status {
  final String key;
  final String label;
  final Color color;
  const _Status(this.key, this.label, this.color);
}

const _statuses = [
  _Status('present', 'Present', Color(0xFF10B981)),
  _Status('late', 'Late', Color(0xFFF59E0B)),
  _Status('half-day', 'Half day', Color(0xFFF97316)),
  _Status('absent', 'Absent', Color(0xFFEF4444)),
];
const _notMarked = _Status('', 'Not marked', Color(0xFFD1D5DB));

_Status _statusOf(String? key) => _statuses.firstWhere((s) => s.key == key, orElse: () => _notMarked);

String _iso(DateTime d) => '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
bool _isSunday(String iso) => DateTime.parse(iso).weekday == DateTime.sunday;
String _plural(int n, String word) => '$n $word${n == 1 ? '' : 's'}';

/// "09:05:00" -> "9:05 AM"
String _clock(String hhmm) {
  final parts = hhmm.split(':');
  if (parts.length < 2) return '';
  final h = int.tryParse(parts[0]) ?? 0, m = int.tryParse(parts[1]) ?? 0;
  return '${(h + 11) % 12 + 1}:${m.toString().padLeft(2, '0')} ${h >= 12 ? 'PM' : 'AM'}';
}

String _timeOf(DateTime? t) => t == null ? '' : _clock('${t.hour}:${t.minute}');

String _friendly(String iso) {
  final d = DateTime.parse(iso);
  final today = DateTime.now();
  if (_iso(today) == iso) return 'Today';
  if (_iso(today.subtract(const Duration(days: 1))) == iso) return 'Yesterday';
  const wd = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  return '${wd[d.weekday - 1]}, ${d.day} ${_months[d.month - 1].substring(0, 3)}';
}

/// One entry on a day: a daily update or a doctor visit.
class _Entry {
  final DateTime? at;
  final DailyLog? update;
  final TeamVisitLog? visit;
  _Entry.update(DailyLog u) : at = u.createdAt, update = u, visit = null;
  _Entry.visit(TeamVisitLog v) : at = v.createdAt, update = null, visit = v;
}

class TeamMonthSummaryScreen extends StatefulWidget {
  /// Opens straight on this person's month (from their profile).
  final TeamMember? initialMember;
  const TeamMonthSummaryScreen({super.key, this.initialMember});

  @override
  State<TeamMonthSummaryScreen> createState() => _TeamMonthSummaryScreenState();
}

class _TeamMonthSummaryScreenState extends State<TeamMonthSummaryScreen> {
  final _service = TeamService();
  DateTime _month = DateTime(DateTime.now().year, DateTime.now().month);
  List<TeamMember> _members = [];
  String? _selectedId;
  bool _loading = true;

  Map<String, List<AttendanceRecord>> _attendance = {};
  List<TeamDailyLog> _teamLogs = [];
  List<TeamVisitLog> _visits = [];
  // the picked person's own updates — these carry the time they were sent
  List<DailyLog> _memberLogs = [];

  @override
  void initState() {
    super.initState();
    _selectedId = widget.initialMember?.id;
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      if (_members.isEmpty) _members = await _service.getTeamMembers();
      final y = _month.year, m = _month.month;
      final results = await Future.wait([
        Future.wait(_members.map((mem) => _service.getMemberAttendanceByMonth(mem.id, y, m).catchError((_) => <AttendanceRecord>[]))),
        _service.getTeamDailyLogs(y, m).catchError((_) => <TeamDailyLog>[]),
        _service.getTeamVisitLogs(y, m).catchError((_) => <TeamVisitLog>[]),
        _selectedId == null
            ? Future.value(<DailyLog>[])
            : _service.getMemberDailyLogs(_selectedId!, y, m).catchError((_) => <DailyLog>[]),
      ]);
      if (!mounted) return;
      final perMember = results[0] as List<List<AttendanceRecord>>;
      setState(() {
        _attendance = {for (var i = 0; i < _members.length; i++) _members[i].id: perMember[i]};
        _teamLogs = results[1] as List<TeamDailyLog>;
        _visits = results[2] as List<TeamVisitLog>;
        _memberLogs = results[3] as List<DailyLog>;
        _loading = false;
      });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _changeMonth(int delta) {
    setState(() => _month = DateTime(_month.year, _month.month + delta));
    _load();
  }

  void _select(String? id) {
    setState(() => _selectedId = id);
    _load();
  }

  TeamMember? get _selected => _members.where((m) => m.id == _selectedId).firstOrNull;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF7F7F8),
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        title: const Text('Month summary', style: TextStyle(color: _ink, fontWeight: FontWeight.w600)),
      ),
      body: Column(
        children: [
          _controls(),
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator(color: _teal))
                : _members.isEmpty
                    ? Center(child: Text('No team members yet.', style: TextStyle(color: Colors.grey.shade500)))
                    : RefreshIndicator(
                        color: _teal,
                        onRefresh: _load,
                        child: _selected == null ? _teamList() : _memberDetail(_selected!),
                      ),
          ),
        ],
      ),
    );
  }

  // Month switcher + who to look at
  Widget _controls() {
    return Container(
      color: Colors.white,
      padding: const EdgeInsets.fromLTRB(8, 4, 12, 10),
      child: Row(
        children: [
          IconButton(icon: const Icon(Icons.chevron_left), onPressed: () => _changeMonth(-1)),
          Text('${_months[_month.month - 1].substring(0, 3)} ${_month.year}', style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15)),
          IconButton(icon: const Icon(Icons.chevron_right), onPressed: () => _changeMonth(1)),
          const Spacer(),
          Flexible(
            flex: 3,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              decoration: BoxDecoration(border: Border.all(color: Colors.grey.shade300), borderRadius: BorderRadius.circular(10)),
              child: DropdownButtonHideUnderline(
                child: DropdownButton<String?>(
                  value: _selectedId,
                  isExpanded: true,
                  style: const TextStyle(fontSize: 14, color: _ink),
                  items: [
                    const DropdownMenuItem<String?>(value: null, child: Text('Whole team')),
                    for (final m in _members)
                      DropdownMenuItem<String?>(value: m.id, child: Text(m.displayName, overflow: TextOverflow.ellipsis)),
                  ],
                  onChanged: _select,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  List<String> get _days {
    final n = DateTime(_month.year, _month.month + 1, 0).day;
    return [for (var d = 1; d <= n; d++) _iso(DateTime(_month.year, _month.month, d))];
  }

  // ------------------------------------------------------------ whole team

  Widget _teamList() {
    final today = _iso(DateTime.now());
    return ListView(
      padding: const EdgeInsets.all(12),
      children: [
        for (final m in _members)
          Builder(builder: (_) {
            final recs = _attendance[m.id] ?? [];
            final byDate = {for (final r in recs) r.date: r};
            int count(String k) => recs.where((r) => r.status == k).length;
            final updates = _teamLogs.where((l) => l.teamMemberId == m.id).length;
            final visits = _visits.where((v) => v.teamMemberId == m.id).length;
            return _Card(
              onTap: () => _select(m.id),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      _Avatar(name: m.displayName),
                      const SizedBox(width: 10),
                      Expanded(child: Text(m.displayName, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15))),
                      Icon(Icons.chevron_right, color: Colors.grey.shade400),
                    ],
                  ),
                  const SizedBox(height: 10),
                  Wrap(
                    spacing: 12,
                    runSpacing: 4,
                    children: [
                      for (final s in _statuses) _Count(n: count(s.key), label: s.label.toLowerCase()),
                      _Count(n: updates, label: updates == 1 ? 'update' : 'updates'),
                      _Count(n: visits, label: visits == 1 ? 'visit' : 'visits'),
                    ],
                  ),
                  const SizedBox(height: 10),
                  Wrap(
                    spacing: 3,
                    runSpacing: 3,
                    children: [
                      for (final d in _days)
                        Container(
                          width: 14,
                          height: 14,
                          decoration: BoxDecoration(
                            color: byDate[d] != null
                                ? _statusOf(byDate[d]!.status).color
                                : (d.compareTo(today) > 0 || _isSunday(d))
                                    ? Colors.grey.shade100
                                    : _notMarked.color,
                            borderRadius: BorderRadius.circular(3),
                          ),
                        ),
                    ],
                  ),
                ],
              ),
            );
          }),
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 8),
          child: Text('Tap a person to see their month in detail.', textAlign: TextAlign.center, style: TextStyle(fontSize: 12, color: Colors.grey.shade500)),
        ),
      ],
    );
  }

  // ------------------------------------------------------------ one person

  Widget _memberDetail(TeamMember member) {
    final today = _iso(DateTime.now());
    final days = _days;
    final elapsed = days.where((d) => d.compareTo(today) <= 0).toList();
    final workingDays = elapsed.where((d) => !_isSunday(d)).toList();

    final records = _attendance[member.id] ?? [];
    final recordByDate = {for (final r in records) r.date: r};
    final visits = _visits.where((v) => v.teamMemberId == member.id).toList();
    final logs = _memberLogs;

    final entriesByDate = <String, List<_Entry>>{};
    for (final l in logs) {
      (entriesByDate[l.date] ??= []).add(_Entry.update(l));
    }
    for (final v in visits) {
      (entriesByDate[v.date] ??= []).add(_Entry.visit(v));
    }
    for (final list in entriesByDate.values) {
      list.sort((a, b) => (a.at ?? DateTime(0)).compareTo(b.at ?? DateTime(0)));
    }

    // attendance
    int count(String k) => records.where((r) => r.status == k).length;
    final cameIn = records.where((r) => r.status != 'absent').toList();
    final unmarked = workingDays.where((d) => recordByDate[d] == null).toList();
    final arrivals = cameIn.map((r) {
      final p = r.checkInTime.split(':');
      return p.length >= 2 ? (int.tryParse(p[0]) ?? 0) * 60 + (int.tryParse(p[1]) ?? 0) : null;
    }).whereType<int>().toList();
    String? hhmm(num mins) {
      final t = mins.round();
      return '${t ~/ 60}:${t % 60}';
    }

    final avgArrival = arrivals.isEmpty ? null : hhmm(arrivals.reduce((a, b) => a + b) / arrivals.length);
    final earliest = arrivals.isEmpty ? null : hhmm(arrivals.reduce((a, b) => a < b ? a : b));
    final latest = arrivals.isEmpty ? null : hhmm(arrivals.reduce((a, b) => a > b ? a : b));
    final rate = workingDays.isEmpty ? null : (cameIn.length * 100 / workingDays.length).round();

    // updates
    final updateDays = logs.map((l) => l.date).toSet();
    final silentDays = cameIn.map((r) => r.date).where((d) => entriesByDate[d] == null).toList()..sort();
    final noLocation = logs.where((l) => l.latitude == null || l.longitude == null).length;
    final places = logs.map((l) => l.address).whereType<String>().where((a) => a.isNotEmpty).toSet();
    String? busiest;
    var busiestCount = 0;
    for (final d in updateDays) {
      final n = logs.where((l) => l.date == d).length;
      if (n > busiestCount) {
        busiest = d;
        busiestCount = n;
      }
    }

    // visits
    final doctors = visits.map((v) => v.doctorName).where((n) => n.isNotEmpty).toSet();
    final measured = visits.where((v) => v.distanceFromClinicM != null).toList();
    final atClinic = measured.where((v) => v.withinExpectedProximity == true).length;
    final away = measured.length - atClinic;

    final flags = <_Flag>[
      if (count('late') > 0) _Flag(_statuses[1].color, 'Late on ${_plural(count('late'), 'day')}'),
      if (count('absent') > 0) _Flag(_statuses[3].color, 'Absent on ${_plural(count('absent'), 'day')}'),
      if (unmarked.isNotEmpty) _Flag(Colors.grey.shade400, '${_plural(unmarked.length, 'working day')} with no attendance marked', unmarked),
      if (silentDays.isNotEmpty) _Flag(_statuses[1].color, 'Came in but sent no update or visit on ${_plural(silentDays.length, 'day')}', silentDays),
      if (away > 0) _Flag(_statuses[1].color, '${_plural(away, 'doctor visit')} logged away from the clinic'),
      if (noLocation > 0) _Flag(Colors.grey.shade400, '${_plural(noLocation, 'update')} sent without a location'),
    ];

    return ListView(
      padding: const EdgeInsets.all(12),
      children: [
        // who
        Row(
          children: [
            _Avatar(name: member.displayName, size: 40),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(member.displayName, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 17)),
                  Text('${_plural(workingDays.length, 'working day')} so far this month', style: TextStyle(fontSize: 12, color: Colors.grey.shade600)),
                ],
              ),
            ),
            TextButton(onPressed: () => _select(null), child: const Text('Whole team', style: TextStyle(color: _teal))),
          ],
        ),
        const SizedBox(height: 12),

        // headline numbers
        GridView.count(
          crossAxisCount: 2,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          mainAxisSpacing: 10,
          crossAxisSpacing: 10,
          childAspectRatio: 1.45,
          children: [
            _Stat(label: 'Attendance', value: rate == null ? '—' : '$rate%', sub: 'Came in ${cameIn.length} of ${workingDays.length} working days'),
            _Stat(
              label: 'Avg arrival',
              value: avgArrival == null ? '—' : _clock(avgArrival),
              sub: earliest == null ? 'No arrival times yet' : 'Earliest ${_clock(earliest)}\nLatest ${_clock(latest!)}',
            ),
            _Stat(
              label: 'Updates sent',
              value: '${logs.length}',
              sub: logs.isEmpty
                  ? 'None this month'
                  : 'On ${_plural(updateDays.length, 'day')}${cameIn.isEmpty ? '' : '\n${(logs.length / cameIn.length).toStringAsFixed(1)} per day in'}',
            ),
            _Stat(
              label: 'Doctor visits',
              value: '${visits.length}',
              sub: visits.isEmpty
                  ? 'None this month'
                  : '${_plural(doctors.length, 'doctor')}${measured.isEmpty ? '' : '\n${(atClinic * 100 / measured.length).round()}% at the clinic'}',
            ),
          ],
        ),
        const SizedBox(height: 10),

        // attendance breakdown + the month's days
        _Card(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Wrap(
                spacing: 6,
                runSpacing: 6,
                children: [
                  for (final s in _statuses) _Chip(color: s.color, text: '${count(s.key)} ${s.label}'),
                  _Chip(color: _notMarked.color, text: '${unmarked.length} Not marked'),
                ],
              ),
              const SizedBox(height: 12),
              Wrap(
                spacing: 4,
                runSpacing: 4,
                children: [
                  for (final d in days)
                    _DayBox(
                      day: int.parse(d.substring(8)),
                      color: recordByDate[d] != null
                          ? _statusOf(recordByDate[d]!.status).color
                          : (d.compareTo(today) > 0 || _isSunday(d))
                              ? null
                              : _notMarked.color,
                      filled: recordByDate[d] != null,
                      hasEntries: entriesByDate[d] != null,
                      onTap: d.compareTo(today) > 0 ? null : () => _openDay(d, recordByDate[d], entriesByDate[d] ?? []),
                    ),
                ],
              ),
              const SizedBox(height: 8),
              Text('Teal dot: sent an update or logged a visit. Tap a day to see it.', style: TextStyle(fontSize: 11.5, color: Colors.grey.shade500)),
              if (busiest != null || places.isNotEmpty) ...[
                const Divider(height: 20),
                if (busiest != null) Text('Busiest day: ${_friendly(busiest)} (${_plural(busiestCount, 'update')})', style: const TextStyle(fontSize: 13)),
                if (places.isNotEmpty) Text('Reported from ${_plural(places.length, 'place')}', style: const TextStyle(fontSize: 13)),
              ],
            ],
          ),
        ),
        const SizedBox(height: 10),

        // worth a look
        _Card(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('WORTH A LOOK', style: TextStyle(fontSize: 11, letterSpacing: 1.2, fontWeight: FontWeight.w600, color: Colors.grey.shade500)),
              const SizedBox(height: 8),
              if (flags.isEmpty)
                const Text('Nothing stands out — a clean month so far.', style: TextStyle(color: Color(0xFF047857), fontSize: 13.5))
              else
                for (final f in flags) _FlagRow(flag: f, onDay: (d) => _openDay(d, recordByDate[d], entriesByDate[d] ?? [])),
            ],
          ),
        ),
        const SizedBox(height: 10),

        // day by day
        _Card(
          padding: EdgeInsets.zero,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Padding(
                padding: EdgeInsets.fromLTRB(14, 12, 14, 6),
                child: Text('Day by day', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
              ),
              for (final d in elapsed.reversed)
                if (!(_isSunday(d) && recordByDate[d] == null && entriesByDate[d] == null))
                  _DayRow(date: d, record: recordByDate[d], entries: entriesByDate[d] ?? []),
            ],
          ),
        ),
        const SizedBox(height: 16),
      ],
    );
  }

  void _openDay(String date, AttendanceRecord? record, List<_Entry> entries) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(16))),
      builder: (_) => DraggableScrollableSheet(
        expand: false,
        initialChildSize: 0.55,
        maxChildSize: 0.9,
        builder: (_, ctrl) => ListView(
          controller: ctrl,
          padding: const EdgeInsets.all(16),
          children: [
            Row(
              children: [
                Expanded(child: Text(_friendly(date), style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 17))),
                _StatusChip(status: record?.status),
              ],
            ),
            if (record != null && record.status != 'absent')
              Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Text('Came in at ${_clock(record.checkInTime)}', style: TextStyle(color: Colors.grey.shade700)),
              ),
            if (record?.description?.isNotEmpty == true)
              Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Text('“${record!.description}”', style: TextStyle(fontStyle: FontStyle.italic, color: Colors.grey.shade600)),
              ),
            const SizedBox(height: 14),
            if (entries.isEmpty)
              Text('No updates or visits this day.', style: TextStyle(color: Colors.grey.shade500))
            else
              for (final e in entries) _EntryTile(entry: e),
          ],
        ),
      ),
    );
  }
}

// ------------------------------------------------------------ pieces

class _Card extends StatelessWidget {
  final Widget child;
  final VoidCallback? onTap;
  final EdgeInsets padding;
  const _Card({required this.child, this.onTap, this.padding = const EdgeInsets.all(14)});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Material(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: Container(
            padding: padding,
            decoration: BoxDecoration(border: Border.all(color: Colors.grey.shade200), borderRadius: BorderRadius.circular(14)),
            child: child,
          ),
        ),
      ),
    );
  }
}

class _Avatar extends StatelessWidget {
  final String name;
  final double size;
  const _Avatar({required this.name, this.size = 34});

  @override
  Widget build(BuildContext context) {
    return CircleAvatar(
      radius: size / 2,
      backgroundColor: Colors.grey.shade100,
      child: Text(name.isEmpty ? '?' : name[0].toUpperCase(), style: TextStyle(fontWeight: FontWeight.w700, color: Colors.grey.shade700, fontSize: size * 0.4)),
    );
  }
}

class _Count extends StatelessWidget {
  final int n;
  final String label;
  const _Count({required this.n, required this.label});

  @override
  Widget build(BuildContext context) {
    return Text.rich(TextSpan(children: [
      TextSpan(text: '$n ', style: const TextStyle(fontWeight: FontWeight.w700, color: _ink)),
      TextSpan(text: label, style: TextStyle(color: Colors.grey.shade600)),
    ]), style: const TextStyle(fontSize: 13));
  }
}

class _Stat extends StatelessWidget {
  final String label, value, sub;
  const _Stat({required this.label, required this.value, required this.sub});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(color: Colors.white, border: Border.all(color: Colors.grey.shade200), borderRadius: BorderRadius.circular(14)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label.toUpperCase(), style: TextStyle(fontSize: 10.5, letterSpacing: 1, fontWeight: FontWeight.w600, color: Colors.grey.shade500)),
          const SizedBox(height: 4),
          Text(value, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w700, color: _ink)),
          const SizedBox(height: 2),
          Expanded(child: Text(sub, style: TextStyle(fontSize: 11.5, color: Colors.grey.shade600, height: 1.3), overflow: TextOverflow.fade)),
        ],
      ),
    );
  }
}

class _Chip extends StatelessWidget {
  final Color color;
  final String text;
  const _Chip({required this.color, required this.text});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(color: color.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(20), border: Border.all(color: color.withValues(alpha: 0.35))),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Container(width: 7, height: 7, decoration: BoxDecoration(color: color, shape: BoxShape.circle)),
        const SizedBox(width: 6),
        Text(text, style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w500)),
      ]),
    );
  }
}

class _StatusChip extends StatelessWidget {
  final String? status;
  const _StatusChip({this.status});

  @override
  Widget build(BuildContext context) {
    final s = _statusOf(status);
    return _Chip(color: s.color, text: s.label);
  }
}

class _DayBox extends StatelessWidget {
  final int day;
  final Color? color; // null = Sunday / future
  final bool filled, hasEntries;
  final VoidCallback? onTap;
  const _DayBox({required this.day, this.color, required this.filled, required this.hasEntries, this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: SizedBox(
        width: 34,
        height: 34,
        child: Stack(
          clipBehavior: Clip.none,
          children: [
            Container(
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: color ?? Colors.grey.shade50,
                borderRadius: BorderRadius.circular(6),
                border: color == null ? Border.all(color: Colors.grey.shade200) : null,
              ),
              child: Text('$day', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: filled ? Colors.white : Colors.grey.shade500)),
            ),
            if (hasEntries)
              Positioned(
                top: -2,
                right: -2,
                child: Container(width: 9, height: 9, decoration: BoxDecoration(color: _teal, shape: BoxShape.circle, border: Border.all(color: Colors.white, width: 1.5))),
              ),
          ],
        ),
      ),
    );
  }
}

class _Flag {
  final Color color;
  final String text;
  final List<String>? days;
  _Flag(this.color, this.text, [this.days]);
}

class _FlagRow extends StatefulWidget {
  final _Flag flag;
  final void Function(String) onDay;
  const _FlagRow({required this.flag, required this.onDay});

  @override
  State<_FlagRow> createState() => _FlagRowState();
}

class _FlagRowState extends State<_FlagRow> {
  bool _open = false;

  @override
  Widget build(BuildContext context) {
    final f = widget.flag;
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.only(top: 6),
            child: Container(width: 8, height: 8, decoration: BoxDecoration(color: f.color, shape: BoxShape.circle)),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(f.text, style: const TextStyle(fontSize: 13.5)),
                if (f.days != null)
                  GestureDetector(
                    onTap: () => setState(() => _open = !_open),
                    child: Padding(
                      padding: const EdgeInsets.only(top: 2),
                      child: Text(_open ? 'Hide days' : 'Show days', style: const TextStyle(fontSize: 12.5, color: _teal, fontWeight: FontWeight.w500)),
                    ),
                  ),
                if (_open && f.days != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 6),
                    child: Wrap(
                      spacing: 6,
                      runSpacing: 6,
                      children: [
                        for (final d in f.days!)
                          ActionChip(
                            label: Text(_friendly(d), style: const TextStyle(fontSize: 12)),
                            visualDensity: VisualDensity.compact,
                            onPressed: () => widget.onDay(d),
                          ),
                      ],
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _DayRow extends StatefulWidget {
  final String date;
  final AttendanceRecord? record;
  final List<_Entry> entries;
  const _DayRow({required this.date, this.record, required this.entries});

  @override
  State<_DayRow> createState() => _DayRowState();
}

class _DayRowState extends State<_DayRow> {
  bool _open = false;

  @override
  Widget build(BuildContext context) {
    final r = widget.record;
    final updates = widget.entries.where((e) => e.update != null).length;
    final visits = widget.entries.length - updates;
    final summary = widget.entries.isEmpty
        ? 'No updates'
        : [if (updates > 0) _plural(updates, 'update'), if (visits > 0) _plural(visits, 'visit')].join(' · ');
    final first = widget.entries.isEmpty ? null : widget.entries.first.at;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Divider(height: 1, color: Colors.grey.shade100),
        InkWell(
          onTap: widget.entries.isEmpty ? null : () => setState(() => _open = !_open),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Text(_friendly(widget.date), style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
                          const SizedBox(width: 8),
                          _StatusChip(status: r?.status),
                        ],
                      ),
                      const SizedBox(height: 3),
                      Text(
                        [
                          if (r != null && r.status != 'absent') 'In at ${_clock(r.checkInTime)}',
                          summary,
                          if (first != null) 'first at ${_timeOf(first)}',
                        ].join(' · '),
                        style: TextStyle(fontSize: 12.5, color: widget.entries.isEmpty ? Colors.grey.shade400 : Colors.grey.shade600),
                      ),
                      if (r?.description?.isNotEmpty == true)
                        Text('“${r!.description}”', style: TextStyle(fontSize: 12, fontStyle: FontStyle.italic, color: Colors.grey.shade500)),
                    ],
                  ),
                ),
                if (widget.entries.isNotEmpty) Icon(_open ? Icons.expand_less : Icons.expand_more, color: Colors.grey.shade400),
              ],
            ),
          ),
        ),
        if (_open)
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 0, 14, 10),
            child: Column(children: [for (final e in widget.entries) _EntryTile(entry: e)]),
          ),
      ],
    );
  }
}

/// One update or visit: time, where, what.
class _EntryTile extends StatelessWidget {
  final _Entry entry;
  const _EntryTile({required this.entry});

  @override
  Widget build(BuildContext context) {
    final u = entry.update, v = entry.visit;
    final lat = u?.latitude ?? v?.latitude, lng = u?.longitude ?? v?.longitude;
    final isVisit = v != null;
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(11),
      decoration: BoxDecoration(
        color: isVisit ? const Color(0xFFEEF2FF) : const Color(0xFFF0FDFA),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(isVisit ? Icons.medical_services_outlined : Icons.edit_note, size: 16, color: isVisit ? const Color(0xFF4F46E5) : _teal),
              const SizedBox(width: 6),
              Text(_timeOf(entry.at), style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 12.5)),
              const SizedBox(width: 8),
              if (lat != null && lng != null)
                Expanded(
                  child: GestureDetector(
                    onTap: () => launchUrl(Uri.parse('https://www.google.com/maps?q=$lat,$lng'), mode: LaunchMode.externalApplication),
                    child: Text(
                      u?.address?.isNotEmpty == true ? u!.address! : 'See on map',
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 12.5, color: _teal),
                    ),
                  ),
                )
              else
                Text('No location', style: TextStyle(fontSize: 12, color: Colors.grey.shade400)),
            ],
          ),
          if (isVisit) ...[
            const SizedBox(height: 5),
            Text(
              '${v.doctorName.isNotEmpty ? 'Doctor visit' : 'Meeting'} — ${v.displayName}${v.clinicName?.isNotEmpty == true ? ' · ${v.clinicName}' : ''}',
              style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w500),
            ),
            const SizedBox(height: 5),
            _ClinicDistance(visit: v),
          ],
          if ((u?.notes ?? v?.notes)?.isNotEmpty == true) ...[
            const SizedBox(height: 5),
            Text((u?.notes ?? v?.notes)!, style: const TextStyle(fontSize: 13.5, height: 1.4)),
          ],
        ],
      ),
    );
  }
}

class _ClinicDistance extends StatelessWidget {
  final TeamVisitLog visit;
  const _ClinicDistance({required this.visit});

  @override
  Widget build(BuildContext context) {
    final m = visit.distanceFromClinicM;
    if (m == null) return Text('Clinic location not saved — distance unknown', style: TextStyle(fontSize: 12, color: Colors.grey.shade500));
    final near = visit.withinExpectedProximity == true;
    final dist = m < 1000 ? '${m.round()} m' : '${(m / 1000).toStringAsFixed(1)} km';
    final color = near ? const Color(0xFF047857) : const Color(0xFFB45309);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(color: color.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(20)),
      child: Text(near ? '✓ At the clinic · $dist away' : '⚠ Away from the clinic · $dist from it', style: TextStyle(fontSize: 12, color: color, fontWeight: FontWeight.w500)),
    );
  }
}
