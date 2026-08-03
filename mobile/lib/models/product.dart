class ProductImage {
  final String id;
  final String imageUrl;
  final int sortOrder;

  ProductImage({required this.id, required this.imageUrl, required this.sortOrder});

  factory ProductImage.fromJson(Map<String, dynamic> json) => ProductImage(
        id: json['id'] ?? '',
        imageUrl: json['image_url'] ?? '',
        sortOrder: json['sort_order'] ?? 0,
      );

  Map<String, dynamic> toJson() => {'id': id, 'image_url': imageUrl, 'sort_order': sortOrder};
}

class ProductDocument {
  final String id;
  final String name;
  final String fileUrl;

  ProductDocument({required this.id, required this.name, required this.fileUrl});

  factory ProductDocument.fromJson(Map<String, dynamic> json) => ProductDocument(
        id: json['id'] ?? '',
        name: json['name'] ?? '',
        fileUrl: json['file_url'] ?? '',
      );

  Map<String, dynamic> toJson() => {'id': id, 'name': name, 'file_url': fileUrl};
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
  final String? packSize;
  final String? productForm;
  final String? keyIngredients;
  final String? strength;
  final List<ProductImage> images;
  final List<ProductDocument> documents;
  final String? audioUrl;

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
    this.packSize,
    this.productForm,
    this.keyIngredients,
    this.strength,
    this.images = const [],
    this.documents = const [],
    this.audioUrl,
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
        packSize: json['pack_size'],
        productForm: json['product_form'],
        keyIngredients: json['key_ingredients'],
        strength: json['strength'],
        images: (json['images'] as List<dynamic>? ?? [])
            .map((e) => ProductImage.fromJson(e))
            .toList(),
        documents: (json['documents'] as List<dynamic>? ?? [])
            .map((e) => ProductDocument.fromJson(e))
            .toList(),
        audioUrl: json['audio_url'],
      );

  String? get primaryImageUrl =>
      images.isNotEmpty ? images.first.imageUrl : null;

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
        'pack_size': packSize,
        'product_form': productForm,
        'key_ingredients': keyIngredients,
        'strength': strength,
        'images': images.map((e) => e.toJson()).toList(),
        'documents': documents.map((e) => e.toJson()).toList(),
      };
}

class ProductListResponse {
  final List<Product> products;
  final int total;
  final int page;
  final int totalPages;
  final bool isFromCache;

  ProductListResponse({
    required this.products,
    required this.total,
    required this.page,
    required this.totalPages,
    this.isFromCache = false,
  });

  factory ProductListResponse.fromJson(Map<String, dynamic> json) =>
      ProductListResponse(
        products: (json['products'] as List<dynamic>? ?? [])
            .map((e) => Product.fromJson(e))
            .toList(),
        total: json['total'] ?? 0,
        page: json['page'] ?? 1,
        totalPages: json['total_pages'] ?? 1,
      );
}
