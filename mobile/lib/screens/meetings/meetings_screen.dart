import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../models/doctor.dart';
import '../../models/meeting.dart';
import '../../providers/auth_provider.dart';
import '../../services/doctor_service.dart';
import '../../services/meeting_service.dart';
import '../../services/request_service.dart';
import '../../widgets/notification_bell_button.dart';
import '../../widgets/chat_button.dart';
import '../../widgets/profile_button.dart';
import '../../utils/responsive.dart';
import '../../widgets/app_drawer.dart';

const _teal = Color(0xFF00A6A4);
const _ink = Color(0xFF1A1A1A);

String _dateKey(DateTime d) =>
    '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

class MeetingsScreen extends ConsumerStatefulWidget {
  final String? preselectedDoctorId;
  const MeetingsScreen({super.key, this.preselectedDoctorId});

  @override
  ConsumerState<MeetingsScreen> createState() => _MeetingsScreenState();
}

class _MeetingsScreenState extends ConsumerState<MeetingsScreen> {
  List<Meeting> _meetings = [];
  bool _loading = true;
  DateTime _monthCursor = DateTime(DateTime.now().year, DateTime.now().month, 1);
  final _meetingService = MeetingService();
  String? _editingMomId;
  final _momCtrl = TextEditingController();
  bool _savingMom = false;
  String _upcomingFilter = 'all';

  static const _upcomingFilters = [
    ('all', 'All'),
    ('tomorrow', 'Tomorrow'),
    ('week', 'Next 7 Days'),
    ('month', 'Next 30 Days'),
  ];

  List<Meeting> _applyUpcomingFilter(List<Meeting> upcoming) {
    if (_upcomingFilter == 'all') return upcoming;

    final now = DateTime.now();
    final startOfToday = DateTime(now.year, now.month, now.day);
    late DateTime from, to;

    switch (_upcomingFilter) {
      case 'tomorrow':
        from = startOfToday.add(const Duration(days: 1));
        to = from.add(const Duration(days: 1));
        break;
      case 'week':
        from = startOfToday;
        to = startOfToday.add(const Duration(days: 7));
        break;
      case 'month':
        from = startOfToday;
        to = startOfToday.add(const Duration(days: 30));
        break;
      default:
        return upcoming;
    }

    return upcoming.where((m) => !m.scheduledAt.isBefore(from) && m.scheduledAt.isBefore(to)).toList();
  }

  @override
  void initState() {
    super.initState();
    _load();
    if (widget.preselectedDoctorId != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        _showDaySheet(DateTime.now(), preselectedDoctorId: widget.preselectedDoctorId);
      });
    }
  }

  Future<void> _load() async {
    try {
      final m = await _meetingService.getMeetings();
      setState(() { _meetings = m; _loading = false; });
    } catch (_) {
      setState(() => _loading = false);
    }
  }

  Future<void> _updateStatus(Meeting m, String status) async {
    try {
      await _meetingService.updateMeetingStatus(m.id, status);
      _load();
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Could not update meeting')),
        );
      }
    }
  }

  void _startEditMom(Meeting m) {
    setState(() {
      _editingMomId = m.id;
      _momCtrl.text = m.mom ?? '';
    });
  }

  Future<void> _saveMom(String id) async {
    setState(() => _savingMom = true);
    try {
      await _meetingService.updateMeetingMom(id, _momCtrl.text.trim().isEmpty ? null : _momCtrl.text.trim());
      setState(() => _editingMomId = null);
      _load();
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Could not save MOM')),
        );
      }
    } finally {
      if (mounted) setState(() => _savingMom = false);
    }
  }

  void _showDaySheet(DateTime date, {String? preselectedDoctorId}) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (_) => _DaySheet(
        date: date,
        meetings: _meetings.where((m) => _dateKey(m.scheduledAt) == _dateKey(date)).toList(),
        preselectedDoctorId: preselectedDoctorId,
        isPartner: ref.read(authProvider).user?.role == 'partner',
        onChanged: _load,
      ),
    );
  }

  Widget _buildMeetingCard(Meeting m) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: Colors.grey.shade200),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(m.displayTitle, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
          const SizedBox(height: 4),
          Text(_formatDateTime(m.scheduledAt), style: TextStyle(fontSize: 12.5, color: Colors.grey.shade500)),
          if (m.notes != null && m.notes!.isNotEmpty) ...[
            const SizedBox(height: 6),
            Text(m.notes!, style: TextStyle(fontSize: 12.5, color: Colors.grey.shade600)),
          ],
          const SizedBox(height: 10),
          Row(
            children: [
              TextButton(
                onPressed: () => _updateStatus(m, 'completed'),
                style: TextButton.styleFrom(padding: EdgeInsets.zero, minimumSize: const Size(0, 0)),
                child: const Text('Mark done', style: TextStyle(fontSize: 12.5, color: Colors.green, fontWeight: FontWeight.w600)),
              ),
              const SizedBox(width: 16),
              TextButton(
                onPressed: () => _updateStatus(m, 'cancelled'),
                style: TextButton.styleFrom(padding: EdgeInsets.zero, minimumSize: const Size(0, 0)),
                child: const Text('Cancel', style: TextStyle(fontSize: 12.5, color: Colors.red, fontWeight: FontWeight.w600)),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Container(height: 1, color: Colors.grey.shade100),
          const SizedBox(height: 10),
          if (_editingMomId == m.id) ...[
            TextField(
              controller: _momCtrl,
              maxLines: 2,
              autofocus: true,
              style: const TextStyle(fontSize: 12.5),
              decoration: InputDecoration(
                hintText: 'What was discussed / decided...',
                isDense: true,
                filled: true,
                fillColor: Colors.grey.shade50,
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: BorderSide(color: Colors.grey.shade200)),
              ),
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                TextButton(
                  onPressed: _savingMom ? null : () => _saveMom(m.id),
                  style: TextButton.styleFrom(padding: EdgeInsets.zero, minimumSize: const Size(0, 0)),
                  child: Text(_savingMom ? 'Saving...' : 'Save', style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: _ink)),
                ),
                const SizedBox(width: 16),
                TextButton(
                  onPressed: () => setState(() => _editingMomId = null),
                  style: TextButton.styleFrom(padding: EdgeInsets.zero, minimumSize: const Size(0, 0)),
                  child: Text('Cancel', style: TextStyle(fontSize: 12.5, color: Colors.grey.shade500)),
                ),
              ],
            ),
          ] else if (m.mom != null && m.mom!.isNotEmpty) ...[
            Text('MOM', style: TextStyle(fontSize: 10, letterSpacing: 0.5, color: Colors.grey.shade400)),
            const SizedBox(height: 2),
            Text(m.mom!, style: TextStyle(fontSize: 12.5, color: Colors.grey.shade600)),
            const SizedBox(height: 6),
            GestureDetector(
              onTap: () => _startEditMom(m),
              child: const Text('Edit', style: TextStyle(fontSize: 12, color: Colors.blue)),
            ),
          ] else
            GestureDetector(
              onTap: () => _startEditMom(m),
              child: const Text('+ Add MOM', style: TextStyle(fontSize: 12, color: Colors.blue)),
            ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final allUpcoming = _meetings.where((m) => m.status == 'upcoming').toList()
      ..sort((a, b) => a.scheduledAt.compareTo(b.scheduledAt));
    final upcoming = _applyUpcomingFilter(allUpcoming);

    final meetingDateKeys = _meetings.map((m) => _dateKey(m.scheduledAt)).toSet();
    final today = DateTime.now();
    final todayKey = _dateKey(today);

    final firstOfMonth = DateTime(_monthCursor.year, _monthCursor.month, 1);
    final daysInMonth = DateTime(_monthCursor.year, _monthCursor.month + 1, 0).day;
    final startWeekday = firstOfMonth.weekday % 7; // Sunday = 0

    return Scaffold(
      backgroundColor: Colors.white,
      drawer: const AppDrawer(),
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        title: const Text('My Meetings', style: TextStyle(color: _ink, fontWeight: FontWeight.w600)),
        actions: [
          IconButton(
            icon: const Icon(Icons.add, color: _teal),
            onPressed: () => _showDaySheet(DateTime.now()),
          ),
          const ChatButton(),
          const NotificationBellButton(),
          const ProfileButton(),
          const SizedBox(width: 4),
        ],
      ),
      body: ResponsiveCenter(child: _loading
          ? const Center(child: CircularProgressIndicator(color: _teal))
          : RefreshIndicator(
              onRefresh: _load,
              color: _teal,
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  // Calendar
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      border: Border.all(color: Colors.grey.shade200),
                      borderRadius: BorderRadius.circular(14),
                    ),
                    child: Column(
                      children: [
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            IconButton(
                              icon: const Icon(Icons.chevron_left, color: Colors.grey),
                              onPressed: () => setState(() => _monthCursor = DateTime(_monthCursor.year, _monthCursor.month - 1, 1)),
                            ),
                            Text(
                              '${_monthName(_monthCursor.month)} ${_monthCursor.year}',
                              style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14),
                            ),
                            IconButton(
                              icon: const Icon(Icons.chevron_right, color: Colors.grey),
                              onPressed: () => setState(() => _monthCursor = DateTime(_monthCursor.year, _monthCursor.month + 1, 1)),
                            ),
                          ],
                        ),
                        Row(
                          children: ['S', 'M', 'T', 'W', 'T', 'F', 'S']
                              .map((d) => Expanded(
                                    child: Center(
                                      child: Text(d, style: TextStyle(fontSize: 11, color: Colors.grey.shade400)),
                                    ),
                                  ))
                              .toList(),
                        ),
                        const SizedBox(height: 4),
                        GridView.builder(
                          shrinkWrap: true,
                          physics: const NeverScrollableScrollPhysics(),
                          itemCount: startWeekday + daysInMonth,
                          gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 7),
                          itemBuilder: (ctx, i) {
                            if (i < startWeekday) return const SizedBox();
                            final day = i - startWeekday + 1;
                            final date = DateTime(_monthCursor.year, _monthCursor.month, day);
                            final key = _dateKey(date);
                            final hasMeeting = meetingDateKeys.contains(key);
                            final isToday = key == todayKey;
                            return GestureDetector(
                              onTap: () => _showDaySheet(date),
                              child: Container(
                                margin: const EdgeInsets.all(2),
                                decoration: BoxDecoration(
                                  color: isToday ? _teal.withValues(alpha: 0.12) : null,
                                  borderRadius: BorderRadius.circular(8),
                                ),
                                child: Column(
                                  mainAxisAlignment: MainAxisAlignment.center,
                                  children: [
                                    Text(
                                      '$day',
                                      style: TextStyle(
                                        fontSize: 12.5,
                                        fontWeight: isToday ? FontWeight.w700 : FontWeight.w400,
                                        color: isToday ? _teal : _ink,
                                      ),
                                    ),
                                    if (hasMeeting)
                                      Container(
                                        margin: const EdgeInsets.only(top: 2),
                                        width: 4, height: 4,
                                        decoration: const BoxDecoration(color: Colors.red, shape: BoxShape.circle),
                                      ),
                                  ],
                                ),
                              ),
                            );
                          },
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 20),

                  // Upcoming list
                  Text('Upcoming (${upcoming.length})', style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14, color: _ink)),
                  const SizedBox(height: 10),
                  SizedBox(
                    height: 34,
                    child: ListView(
                      scrollDirection: Axis.horizontal,
                      children: [
                        for (final (value, label) in _upcomingFilters)
                          Padding(
                            padding: const EdgeInsets.only(right: 8),
                            child: ChoiceChip(
                              label: Text(label, style: TextStyle(fontSize: 12, color: _upcomingFilter == value ? Colors.white : Colors.grey.shade700)),
                              selected: _upcomingFilter == value,
                              onSelected: (_) => setState(() => _upcomingFilter = value),
                              selectedColor: _teal,
                              backgroundColor: Colors.grey.shade100,
                              showCheckmark: false,
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20), side: BorderSide.none),
                            ),
                          ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 14),
                  if (upcoming.isEmpty)
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 20),
                      child: Center(
                        child: Column(
                          children: [
                            Icon(Icons.calendar_today_outlined, size: 48, color: Colors.grey.shade300),
                            const SizedBox(height: 12),
                            Text(
                              _upcomingFilter == 'all' ? 'No upcoming meetings' : 'No meetings in this range',
                              style: const TextStyle(color: Colors.grey),
                            ),
                            const SizedBox(height: 8),
                            TextButton(
                              onPressed: () => _showDaySheet(DateTime.now()),
                              child: const Text('Schedule Meeting', style: TextStyle(color: _teal)),
                            ),
                          ],
                        ),
                      ),
                    )
                  else
                    for (final m in upcoming) ...[
                      _buildMeetingCard(m),
                      const SizedBox(height: 10),
                    ],
                ],
              ),
            ),
      ),
    );
  }
}

String _monthName(int month) {
  const names = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return names[month - 1];
}

String _formatDateTime(DateTime dt) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  final hour = dt.hour % 12 == 0 ? 12 : dt.hour % 12;
  final ampm = dt.hour >= 12 ? 'PM' : 'AM';
  final minute = dt.minute.toString().padLeft(2, '0');
  return '${months[dt.month - 1]} ${dt.day}, $hour:$minute $ampm';
}

String _formatTime(DateTime dt) {
  final hour = dt.hour % 12 == 0 ? 12 : dt.hour % 12;
  final ampm = dt.hour >= 12 ? 'PM' : 'AM';
  final minute = dt.minute.toString().padLeft(2, '0');
  return '$hour:$minute $ampm';
}

// Bottom sheet shown when a calendar day is tapped: lists that day's
// meetings and lets you schedule another one for that exact date.
class _DaySheet extends StatefulWidget {
  final DateTime date;
  final List<Meeting> meetings;
  final String? preselectedDoctorId;
  final bool isPartner;
  final VoidCallback onChanged;

  const _DaySheet({
    required this.date,
    required this.meetings,
    this.preselectedDoctorId,
    required this.isPartner,
    required this.onChanged,
  });

  @override
  State<_DaySheet> createState() => _DaySheetState();
}

class _DaySheetState extends State<_DaySheet> {
  List<Doctor> _doctors = [];
  String? _selectedDoctorId;
  TimeOfDay? _time = const TimeOfDay(hour: 11, minute: 0);
  final _titleCtrl = TextEditingController();
  final _notesCtrl = TextEditingController();
  final _momCtrl = TextEditingController();
  final _requestCtrl = TextEditingController();
  bool _loadingDoctors = true;
  bool _submitting = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    if (!widget.isPartner) {
      _loadingDoctors = false;
      return;
    }
    _selectedDoctorId = widget.preselectedDoctorId;
    DoctorService().getDoctors().then((d) {
      if (mounted) setState(() { _doctors = d; _loadingDoctors = false; });
    }).catchError((_) {
      if (mounted) setState(() => _loadingDoctors = false);
    });
  }

  Future<void> _submit() async {
    if (_time == null) {
      setState(() => _error = 'Time is required');
      return;
    }
    if (widget.isPartner && _selectedDoctorId == null) {
      setState(() => _error = 'Doctor is required');
      return;
    }
    if (!widget.isPartner && _titleCtrl.text.trim().isEmpty) {
      setState(() => _error = 'Title is required');
      return;
    }
    setState(() { _submitting = true; _error = null; });
    try {
      final scheduledAt = DateTime(widget.date.year, widget.date.month, widget.date.day, _time!.hour, _time!.minute);
      await MeetingService().createMeeting(
        doctorId: widget.isPartner ? _selectedDoctorId : null,
        title: widget.isPartner ? null : _titleCtrl.text.trim(),
        scheduledAt: scheduledAt,
        notes: _notesCtrl.text.trim().isEmpty ? null : _notesCtrl.text.trim(),
        mom: _momCtrl.text.trim().isEmpty ? null : _momCtrl.text.trim(),
      );

      if (widget.isPartner && _requestCtrl.text.trim().isNotEmpty) {
        final matches = _doctors.where((d) => d.id == _selectedDoctorId);
        final doctorName = matches.isEmpty ? 'doctor' : matches.first.name;
        try {
          await RequestService().createRequest(
            '[Meeting with Dr. $doctorName on ${_dateKey(widget.date)}] ${_requestCtrl.text.trim()}',
          );
        } catch (_) {}
      }

      if (mounted) {
        Navigator.pop(context);
        widget.onChanged();
      }
    } catch (e) {
      setState(() => _error = 'Could not schedule meeting');
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.fromLTRB(20, 20, 20, MediaQuery.of(context).viewInsets.bottom + 20),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              '${_monthName(widget.date.month)} ${widget.date.day}, ${widget.date.year}',
              style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 16),

            if (widget.meetings.isNotEmpty) ...[
              for (final m in widget.meetings)
                Container(
                  margin: const EdgeInsets.only(bottom: 8),
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    border: Border.all(color: Colors.grey.shade200),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(m.displayTitle, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
                            Text(_formatTime(m.scheduledAt), style: TextStyle(fontSize: 12, color: Colors.grey.shade500)),
                            if (m.notes != null && m.notes!.isNotEmpty)
                              Text(m.notes!, style: TextStyle(fontSize: 12, color: Colors.grey.shade600)),
                          ],
                        ),
                      ),
                      Text(
                        m.status,
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                          color: m.status == 'upcoming' ? Colors.blue : m.status == 'completed' ? Colors.green : Colors.red,
                        ),
                      ),
                    ],
                  ),
                ),
              const SizedBox(height: 8),
            ],

            Text(
              widget.meetings.isNotEmpty ? 'Schedule another meeting for this day' : 'Schedule a meeting for this day',
              style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: Colors.grey.shade600),
            ),
            const SizedBox(height: 12),

            if (widget.isPartner)
              _loadingDoctors
                  ? const Center(child: CircularProgressIndicator(color: _teal))
                  : DropdownButtonFormField<String>(
                      initialValue: _selectedDoctorId,
                      decoration: InputDecoration(
                        labelText: 'Doctor',
                        filled: true,
                        fillColor: Colors.grey.shade50,
                        border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide(color: Colors.grey.shade200)),
                      ),
                      items: _doctors
                          .map((d) => DropdownMenuItem(value: d.id, child: Text(d.name, overflow: TextOverflow.ellipsis)))
                          .toList(),
                      onChanged: (v) => setState(() => _selectedDoctorId = v),
                    )
            else
              TextField(
                controller: _titleCtrl,
                decoration: InputDecoration(
                  labelText: 'Title',
                  hintText: 'e.g. Team sync, Client call...',
                  filled: true,
                  fillColor: Colors.grey.shade50,
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide(color: Colors.grey.shade200)),
                ),
              ),
            const SizedBox(height: 12),
            OutlinedButton(
              onPressed: () async {
                final picked = await showTimePicker(context: context, initialTime: _time ?? const TimeOfDay(hour: 11, minute: 0));
                if (picked != null) setState(() => _time = picked);
              },
              child: Text(_time == null ? 'Pick time' : _time!.format(context)),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _notesCtrl,
              maxLines: 2,
              decoration: InputDecoration(
                labelText: 'Notes (optional)',
                filled: true,
                fillColor: Colors.grey.shade50,
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide(color: Colors.grey.shade200)),
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _momCtrl,
              maxLines: 2,
              decoration: InputDecoration(
                labelText: 'MOM — Minutes of Meeting (optional)',
                hintText: 'What was discussed / decided...',
                filled: true,
                fillColor: Colors.grey.shade50,
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide(color: Colors.grey.shade200)),
              ),
            ),
            if (widget.isPartner) ...[
              const SizedBox(height: 12),
              TextField(
                controller: _requestCtrl,
                maxLines: 2,
                decoration: InputDecoration(
                  labelText: 'Doctor requested something? (optional)',
                  hintText: 'e.g. needs more samples, a brochure...',
                  filled: true,
                  fillColor: Colors.grey.shade50,
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide(color: Colors.grey.shade200)),
                ),
              ),
              const SizedBox(height: 4),
              Text(
                'This gets flagged to our team separately so it doesn\'t get lost in the notes.',
                style: TextStyle(fontSize: 11, color: Colors.grey.shade400),
              ),
            ],
            if (_error != null) ...[
              const SizedBox(height: 10),
              Text(_error!, style: const TextStyle(color: Colors.red, fontSize: 12.5)),
            ],
            const SizedBox(height: 20),
            SizedBox(
              width: double.infinity,
              height: 48,
              child: ElevatedButton(
                onPressed: _submitting ? null : _submit,
                style: ElevatedButton.styleFrom(
                  backgroundColor: _teal,
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  elevation: 0,
                ),
                child: _submitting
                    ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                    : const Text('Schedule Meeting'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
