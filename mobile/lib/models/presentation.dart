class Presentation {
  final String id;
  final String name;
  final String? doctorId;
  final String? doctorName;
  final bool isDefaultForDoctor;
  final int slideCount;
  final List<String> previewUrls;

  Presentation({
    required this.id,
    required this.name,
    this.doctorId,
    this.doctorName,
    this.isDefaultForDoctor = false,
    this.slideCount = 0,
    this.previewUrls = const [],
  });

  factory Presentation.fromJson(Map<String, dynamic> json) => Presentation(
        id: json['id'] ?? '',
        name: json['name'] ?? '',
        doctorId: json['doctor_id'],
        doctorName: json['doctor_name'],
        isDefaultForDoctor: json['is_default_for_doctor'] ?? false,
        slideCount: json['slide_count'] ?? 0,
        previewUrls: (json['preview_urls'] as List<dynamic>? ?? []).cast<String>(),
      );
}

class PresentationSlide {
  final String productImageId;
  final String imageUrl;
  final String productId;
  final String productName;

  PresentationSlide({
    required this.productImageId,
    required this.imageUrl,
    required this.productId,
    required this.productName,
  });

  factory PresentationSlide.fromJson(Map<String, dynamic> json) => PresentationSlide(
        productImageId: json['product_image_id'] ?? '',
        imageUrl: json['image_url'] ?? '',
        productId: json['product_id'] ?? '',
        productName: json['product_name'] ?? '',
      );
}

class PresentationDetail {
  final Presentation presentation;
  final List<PresentationSlide> slides;

  PresentationDetail({required this.presentation, required this.slides});

  factory PresentationDetail.fromJson(Map<String, dynamic> json) => PresentationDetail(
        presentation: Presentation.fromJson(json),
        slides: (json['slides'] as List<dynamic>? ?? [])
            .map((e) => PresentationSlide.fromJson(e))
            .toList(),
      );
}
