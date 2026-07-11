const _knownMobileRoutes = {
  '/home',
  '/products',
  '/orders',
  '/doctors',
  '/profile',
  '/notifications',
  '/cart',
};

/// The website and app share the same admin-entered link text (e.g. "/about"
/// which only exists on the website), so unrecognized paths fall back to
/// the products catalogue instead of crashing go_router with an unknown route.
String resolveMobileRoute(String link) {
  final path = link.split('?').first;
  final segment = path.startsWith('/') ? path : '/$path';
  final parts = segment.split('/').where((s) => s.isNotEmpty).toList();
  final firstSegment = '/${parts.isNotEmpty ? parts.first : ''}';
  return _knownMobileRoutes.contains(firstSegment) ? segment : '/products';
}

class HomeHighlights {
  final String heading;
  final String card1ImageUrl;
  final String card1ButtonText;
  final String card1LinkUrl;
  final String card2ImageUrl;
  final String card2ButtonText;
  final String card2LinkUrl;

  HomeHighlights({
    required this.heading,
    required this.card1ImageUrl,
    required this.card1ButtonText,
    required this.card1LinkUrl,
    required this.card2ImageUrl,
    required this.card2ButtonText,
    required this.card2LinkUrl,
  });

  factory HomeHighlights.fromJson(Map<String, dynamic> json) => HomeHighlights(
        heading: json['heading'] ?? '',
        card1ImageUrl: json['card1_image_url'] ?? '',
        card1ButtonText: json['card1_button_text'] ?? '',
        card1LinkUrl: json['card1_link_url'] ?? '/products',
        card2ImageUrl: json['card2_image_url'] ?? '',
        card2ButtonText: json['card2_button_text'] ?? '',
        card2LinkUrl: json['card2_link_url'] ?? '/products',
      );

  Map<String, dynamic> toJson() => {
        'heading': heading,
        'card1_image_url': card1ImageUrl,
        'card1_button_text': card1ButtonText,
        'card1_link_url': card1LinkUrl,
        'card2_image_url': card2ImageUrl,
        'card2_button_text': card2ButtonText,
        'card2_link_url': card2LinkUrl,
      };
}

class CarouselSlide {
  final int position;
  final String imageUrl;
  final String heading;
  final String description;
  final String buttonText;
  final String buttonLink;

  CarouselSlide({
    required this.position,
    required this.imageUrl,
    required this.heading,
    required this.description,
    required this.buttonText,
    required this.buttonLink,
  });

  factory CarouselSlide.fromJson(Map<String, dynamic> json) => CarouselSlide(
        position: json['position'] ?? 0,
        imageUrl: json['image_url'] ?? '',
        heading: json['heading'] ?? '',
        description: json['description'] ?? '',
        buttonText: json['button_text'] ?? '',
        buttonLink: json['button_link'] ?? '/products',
      );

  Map<String, dynamic> toJson() => {
        'position': position,
        'image_url': imageUrl,
        'heading': heading,
        'description': description,
        'button_text': buttonText,
        'button_link': buttonLink,
      };
}

class FocusCard {
  final int position;
  final String imageUrl;
  final String title;
  final String linkUrl;

  FocusCard({
    required this.position,
    required this.imageUrl,
    required this.title,
    required this.linkUrl,
  });

  factory FocusCard.fromJson(Map<String, dynamic> json) => FocusCard(
        position: json['position'] ?? 0,
        imageUrl: json['image_url'] ?? '',
        title: json['title'] ?? '',
        linkUrl: json['link_url'] ?? '/products',
      );

  Map<String, dynamic> toJson() => {
        'position': position,
        'image_url': imageUrl,
        'title': title,
        'link_url': linkUrl,
      };
}

class HomeFocusSection {
  final String heading;
  final String description;
  final List<FocusCard> cards;

  HomeFocusSection({
    required this.heading,
    required this.description,
    required this.cards,
  });

  factory HomeFocusSection.fromJson(Map<String, dynamic> json) => HomeFocusSection(
        heading: json['heading'] ?? '',
        description: json['description'] ?? '',
        cards: ((json['cards'] as List<dynamic>?) ?? [])
            .map((c) => FocusCard.fromJson(c))
            .toList(),
      );

  Map<String, dynamic> toJson() => {
        'heading': heading,
        'description': description,
        'cards': cards.map((c) => c.toJson()).toList(),
      };
}
