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
  // Recorded when it was marked done / cancelled
  final DateTime? statusChangedAt;
  final String? statusReason;
  final double? statusLatitude;
  final double? statusLongitude;
  final double? statusDistanceFromClinicM;

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
    this.statusChangedAt,
    this.statusReason,
    this.statusLatitude,
    this.statusLongitude,
    this.statusDistanceFromClinicM,
  });

  /// Still "upcoming" but its day has passed — nobody closed it.
  bool get isOverdue {
    if (status != 'upcoming') return false;
    final now = DateTime.now();
    return scheduledAt.toLocal().isBefore(DateTime(now.year, now.month, now.day));
  }

  /// Its day hasn't come yet — it can't be marked done until then.
  bool get isFutureDay {
    final now = DateTime.now();
    final s = scheduledAt.toLocal();
    return DateTime(s.year, s.month, s.day).isAfter(DateTime(now.year, now.month, now.day));
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
        // the server sends UTC; screens read .hour/.day straight off this, so
        // it must be the phone's local time (a 3:05 PM meeting showed 9:35 AM)
        scheduledAt: DateTime.tryParse(json['scheduled_at'] ?? '')?.toLocal() ?? DateTime.now(),
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
        statusChangedAt: DateTime.tryParse(json['status_changed_at'] ?? '')?.toLocal(),
        statusReason: json['status_reason'],
        statusLatitude: (json['status_latitude'] as num?)?.toDouble(),
        statusLongitude: (json['status_longitude'] as num?)?.toDouble(),
        statusDistanceFromClinicM: (json['status_distance_from_clinic_m'] as num?)?.toDouble(),
      );
}
