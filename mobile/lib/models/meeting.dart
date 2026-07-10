class Meeting {
  final String id;
  final String doctorId;
  final String doctorName;
  final DateTime scheduledAt;
  final String? notes;
  final String? mom;
  final String status;

  Meeting({
    required this.id,
    required this.doctorId,
    required this.doctorName,
    required this.scheduledAt,
    this.notes,
    this.mom,
    required this.status,
  });

  factory Meeting.fromJson(Map<String, dynamic> json) => Meeting(
        id: json['id'] ?? '',
        doctorId: json['doctor_id'] ?? '',
        doctorName: json['doctor_name'] ?? '',
        scheduledAt: DateTime.tryParse(json['scheduled_at'] ?? '') ?? DateTime.now(),
        notes: json['notes'],
        mom: json['mom'],
        status: json['status'] ?? 'upcoming',
      );
}
