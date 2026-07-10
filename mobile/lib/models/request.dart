class RequestItem {
  final String id;
  final String description;
  final String status;
  final String? adminNotes;
  final DateTime createdAt;

  RequestItem({
    required this.id,
    required this.description,
    required this.status,
    this.adminNotes,
    required this.createdAt,
  });

  factory RequestItem.fromJson(Map<String, dynamic> json) => RequestItem(
        id: json['id'] ?? '',
        description: json['description'] ?? '',
        status: json['status'] ?? 'pending',
        adminNotes: json['admin_notes'],
        createdAt: DateTime.tryParse(json['created_at'] ?? '') ?? DateTime.now(),
      );
}
