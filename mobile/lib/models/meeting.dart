class Meeting {
  final String id;
  final String? doctorId;
  final String doctorName;
  final String? title;
  final DateTime scheduledAt;
  final String? notes;
  final String? mom;
  final String status;

  Meeting({
    required this.id,
    this.doctorId,
    required this.doctorName,
    this.title,
    required this.scheduledAt,
    this.notes,
    this.mom,
    required this.status,
  });

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
      );
}
