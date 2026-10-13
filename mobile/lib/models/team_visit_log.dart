/// A doctor visit logged by someone on the partner's team (GET
/// /team/visit-logs) — who, when, which doctor, and how far from the clinic.
class TeamVisitLog {
  final String id;
  final String meetingId;
  final String teamMemberId;
  final String memberName;
  final String date; // "2026-10-14", India time
  final DateTime? createdAt;
  final double latitude;
  final double longitude;
  final String? notes;
  final String doctorName;
  final String? meetingTitle;
  final String? clinicName;
  final double? distanceFromClinicM;
  final bool? withinExpectedProximity;

  TeamVisitLog({
    required this.id,
    required this.meetingId,
    required this.teamMemberId,
    required this.memberName,
    required this.date,
    this.createdAt,
    required this.latitude,
    required this.longitude,
    this.notes,
    required this.doctorName,
    this.meetingTitle,
    this.clinicName,
    this.distanceFromClinicM,
    this.withinExpectedProximity,
  });

  /// "Dr. Sharma", or the meeting's title when it had no doctor.
  String get displayName {
    if (doctorName.isNotEmpty) return 'Dr. ${doctorName.replaceFirst(RegExp(r'^dr\.?\s*', caseSensitive: false), '')}';
    return meetingTitle?.isNotEmpty == true ? meetingTitle! : 'Meeting';
  }

  factory TeamVisitLog.fromJson(Map<String, dynamic> json) => TeamVisitLog(
        id: json['id'] ?? '',
        meetingId: json['meeting_id'] ?? '',
        teamMemberId: json['team_member_id'] ?? '',
        memberName: json['member_name'] ?? '',
        date: json['date'] ?? '',
        createdAt: DateTime.tryParse(json['created_at'] ?? '')?.toLocal(),
        latitude: (json['latitude'] as num?)?.toDouble() ?? 0,
        longitude: (json['longitude'] as num?)?.toDouble() ?? 0,
        notes: json['notes'],
        doctorName: json['doctor_name'] ?? '',
        meetingTitle: json['meeting_title'],
        clinicName: json['clinic_name'],
        distanceFromClinicM: (json['distance_from_clinic_m'] as num?)?.toDouble(),
        withinExpectedProximity: json['within_expected_proximity'],
      );
}
