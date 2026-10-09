class ProductImage {
  final String id;
  final String imageUrl;
  /// The S3 key — compared with [Product.thumbSourceKey] to tell whether the
  /// card thumbnail is still of this image.
  final String imageKey;
  final int sortOrder;
  final bool visualAid;
  final bool hidden;

  ProductImage(
      {required this.id,
      required this.imageUrl,
      this.imageKey = '',
      required this.sortOrder,
      this.visualAid = false,
      this.hidden = false});

  factory ProductImage.fromJson(Map<String, dynamic> json) => ProductImage(
        id: json['id'] ?? '',
        imageUrl: json['image_url'] ?? '',
        imageKey: json['image_key'] ?? '',
        sortOrder: json['sort_order'] ?? 0,
        visualAid: json['visual_aid'] ?? false,
        hidden: json['hidden'] ?? false,
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'image_url': imageUrl,
        'image_key': imageKey,
        'sort_order': sortOrder,
        'visual_aid': visualAid,
        'hidden': hidden,
      };
}

class ProductDocument {
  final String id;
  final String name;
  final String fileUrl;

  ProductDocument(
      {required this.id, required this.name, required this.fileUrl});

  factory ProductDocument.fromJson(Map<String, dynamic> json) =>
      ProductDocument(
        id: json['id'] ?? '',
        name: json['name'] ?? '',
        fileUrl: json['file_url'] ?? '',
      );

  Map<String, dynamic> toJson() =>
      {'id': id, 'name': name, 'file_url': fileUrl};
}

class Product {
  final String id;
  final int? productId;
  final String name;
  final String description;
  final double price;
  final List<String> categories;
  final List<String> tags;
  final int stock;
  final int moq;
  final bool isActive;
  final double? mrp;
  final String? mrpUnit;
  final String? packSize;
  final String? productForm;
  final String? keyIngredients;
  final String? strength;
  final String? directionForUse;
  final String? safetyInformation;
  final String? edetailing;
  final List<ProductImage> images;
  final List<ProductDocument> documents;
  final String? audioUrl;
  /// Small card thumbnail of the first image ('' until one is made), and the
  /// image key it was made from. See [cardImageUrl].
  final String thumbUrl;
  final String thumbSourceKey;

  Product({
    required this.id,
    this.productId,
    required this.name,
    required this.description,
    required this.price,
    required this.categories,
    this.tags = const [],
    required this.stock,
    this.moq = 1,
    required this.isActive,
    this.mrp,
    this.mrpUnit,
    this.packSize,
    this.productForm,
    this.keyIngredients,
    this.strength,
    this.directionForUse,
    this.safetyInformation,
    this.edetailing,
    this.images = const [],
    this.documents = const [],
    this.audioUrl,
    this.thumbUrl = '',
    this.thumbSourceKey = '',
  });

  factory Product.fromJson(Map<String, dynamic> json) => Product(
        id: json['id'] ?? '',
        productId: json['product_id'],
        name: json['name'] ?? '',
        description: json['description'] ?? '',
        price: (json['price'] ?? 0).toDouble(),
        categories: List<String>.from(json['categories'] ?? []),
        tags: List<String>.from(json['tags'] ?? []),
        stock: json['stock'] ?? 0,
        moq: json['moq'] ?? 1,
        isActive: json['is_active'] ?? true,
        mrp: json['mrp']?.toDouble(),
        mrpUnit: json['mrp_unit'],
        packSize: json['pack_size'],
        productForm: json['product_form'],
        keyIngredients: json['key_ingredients'],
        strength: json['strength'],
        directionForUse: json['direction_for_use'],
        safetyInformation: json['safety_information'],
        edetailing: json['edetailing'],
        images: (json['images'] as List<dynamic>? ?? [])
            .map((e) => ProductImage.fromJson(e))
            .toList(),
        documents: (json['documents'] as List<dynamic>? ?? [])
            .map((e) => ProductDocument.fromJson(e))
            .toList(),
        audioUrl: json['audio_url'],
        thumbUrl: json['thumb_url'] ?? '',
        thumbSourceKey: json['thumb_source_key'] ?? '',
      );

  // Customer-facing screens must never show an image staff have marked
  // hidden — it still exists (and stays visible/toggleable in the admin
  // panel), just excluded from what customers see. Admin/presentation
  // screens intentionally use `images` directly, not this getter.
  List<ProductImage> get visibleImages =>
      images.where((img) => !img.hidden).toList();

  String? get primaryImageUrl =>
      visibleImages.isNotEmpty ? visibleImages.first.imageUrl : null;

  /// The picture for product cards and list rows: the small thumbnail of the
  /// first image, so a screen of cards doesn't download full-size originals.
  /// Only while it was made from the current first image — if that image has
  /// changed since, use the image itself until the thumbnail is regenerated.
  /// Same rule as the website's cardImageUrl. Detail and full-screen views
  /// keep using [primaryImageUrl] / the originals.
  String? get cardImageUrl {
    final imgs = visibleImages;
    if (imgs.isEmpty) return null;
    final first = imgs.first;
    if (thumbUrl.isNotEmpty && first.imageKey.isNotEmpty && thumbSourceKey == first.imageKey) {
      return thumbUrl;
    }
    return first.imageUrl;
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'product_id': productId,
        'name': name,
        'description': description,
        'price': price,
        'categories': categories,
        'tags': tags,
        'stock': stock,
        'moq': moq,
        'is_active': isActive,
        'mrp': mrp,
        'mrp_unit': mrpUnit,
        'pack_size': packSize,
        'product_form': productForm,
        'key_ingredients': keyIngredients,
        'strength': strength,
        'direction_for_use': directionForUse,
        'safety_information': safetyInformation,
        'edetailing': edetailing,
        'images': images.map((e) => e.toJson()).toList(),
        'documents': documents.map((e) => e.toJson()).toList(),
        'thumb_url': thumbUrl,
        'thumb_source_key': thumbSourceKey,
      };
}

class ProductListResponse {
  final List<Product> products;
  final int total;
  final int page;
  final int totalPages;
  final bool isFromCache;
  final List<String> suggestions;

  ProductListResponse({
    required this.products,
    required this.total,
    required this.page,
    required this.totalPages,
    this.isFromCache = false,
    this.suggestions = const [],
  });

  factory ProductListResponse.fromJson(Map<String, dynamic> json) =>
      ProductListResponse(
        products: (json['products'] as List<dynamic>? ?? [])
            .map((e) => Product.fromJson(e))
            .toList(),
        total: json['total'] ?? 0,
        page: json['page'] ?? 1,
        totalPages: json['total_pages'] ?? 1,
        suggestions: (json['suggestions'] as List<dynamic>? ?? [])
            .map((e) => e.toString())
            .toList(),
      );
}
