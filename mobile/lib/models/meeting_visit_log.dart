class MeetingVisitLog {
  final String id;
  final String userName;
  final DateTime recordedAt;
  final double latitude;
  final double longitude;
  final String? notes;
  final double? distanceFromClinicM;
  final bool? withinExpectedProximity;

  MeetingVisitLog({
    required this.id,
    required this.userName,
    required this.recordedAt,
    required this.latitude,
    required this.longitude,
    this.notes,
    this.distanceFromClinicM,
    this.withinExpectedProximity,
  });

  factory MeetingVisitLog.fromJson(Map<String, dynamic> json) => MeetingVisitLog(
        id: json['id'] ?? '',
        userName: json['user_name'] ?? '',
        recordedAt: DateTime.tryParse(json['recorded_at'] ?? '') ?? DateTime.now(),
        latitude: (json['latitude'] as num?)?.toDouble() ?? 0,
        longitude: (json['longitude'] as num?)?.toDouble() ?? 0,
        notes: json['notes'],
        distanceFromClinicM: (json['distance_from_clinic_m'] as num?)?.toDouble(),
        withinExpectedProximity: json['within_expected_proximity'],
      );
}
