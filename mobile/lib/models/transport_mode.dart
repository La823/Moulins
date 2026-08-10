class TransportMode {
  final String id;
  final String name;

  TransportMode({required this.id, required this.name});

  factory TransportMode.fromJson(Map<String, dynamic> json) => TransportMode(
        id: json['id'] ?? '',
        name: json['name'] ?? '',
      );
}
