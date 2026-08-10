class Transport {
  final String id;
  final String mode;
  final String name;
  final String? gstNumber;

  Transport({required this.id, required this.mode, required this.name, this.gstNumber});

  factory Transport.fromJson(Map<String, dynamic> json) => Transport(
        id: json['id'] ?? '',
        mode: json['mode'] ?? '',
        name: json['name'] ?? '',
        gstNumber: json['gst_number'],
      );
}
