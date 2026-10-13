class Meeting {
  final String id;
  final String? doctorId;
  final String doctorName;
  final String? title;
  final DateTime scheduledAt;
  final String? notes;
  final String? mom;
  final String status;
  final String? assignedTo;
  final String? assignedToName;
  // Who scheduled it (null for meetings made before this was recorded and
  // for the automatic birthday / anniversary entries) and who closed it.
  final String? createdBy;
  final String? createdByName;
  final String? statusChangedByName;
  final bool assignedToRemoved;
  final bool hasVisitLog;

  Meeting({
    required this.id,
    this.doctorId,
    required this.doctorName,
    this.title,
    required this.scheduledAt,
    this.notes,
    this.mom,
    required this.status,
    this.assignedTo,
    this.assignedToName,
    this.createdBy,
    this.createdByName,
    this.statusChangedByName,
    this.assignedToRemoved = false,
    this.hasVisitLog = false,
  });

  /// Still "upcoming" but its day has passed — nobody closed it.
  bool get isOverdue {
    if (status != 'upcoming') return false;
    final now = DateTime.now();
    return scheduledAt.toLocal().isBefore(DateTime(now.year, now.month, now.day));
  }

  // What to actually show as the meeting's "who/what" — the doctor's name
  // if there is one, otherwise the free-text title (staff meetings without
  // a doctor), falling back to a generic label if somehow neither is set.
  String get displayTitle {
    if (doctorName.isNotEmpty) return 'Dr. $doctorName';
    if (title != null && title!.isNotEmpty) return title!;
    return 'Meeting';
  }

  factory Meeting.fromJson(Map<String, dynamic> json) => Meeting(
        id: json['id'] ?? '',
        doctorId: json['doctor_id'],
        doctorName: json['doctor_name'] ?? '',
        title: json['title'],
        scheduledAt: DateTime.tryParse(json['scheduled_at'] ?? '') ?? DateTime.now(),
        notes: json['notes'],
        mom: json['mom'],
        status: json['status'] ?? 'upcoming',
        assignedTo: json['assigned_to'],
        assignedToName: json['assigned_to_name'],
        createdBy: json['created_by'],
        createdByName: json['created_by_name'],
        statusChangedByName: json['status_changed_by_name'],
        assignedToRemoved: json['assigned_to_removed'] == true,
        hasVisitLog: json['has_visit_log'] == true,
      );
}
