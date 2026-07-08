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
}

class Product {
  final String id;
  final String name;
  final String description;
  final double price;
  final List<String> categories;
  final int stock;
  final bool isActive;
  final double? mrp;
  final String? packSize;
  final String? productForm;
  final List<ProductImage> images;
  final List<ProductDocument> documents;

  Product({
    required this.id,
    required this.name,
    required this.description,
    required this.price,
    required this.categories,
    required this.stock,
    required this.isActive,
    this.mrp,
    this.packSize,
    this.productForm,
    this.images = const [],
    this.documents = const [],
  });

  factory Product.fromJson(Map<String, dynamic> json) => Product(
        id: json['id'] ?? '',
        name: json['name'] ?? '',
        description: json['description'] ?? '',
        price: (json['price'] ?? 0).toDouble(),
        categories: List<String>.from(json['categories'] ?? []),
        stock: json['stock'] ?? 0,
        isActive: json['is_active'] ?? true,
        mrp: json['mrp']?.toDouble(),
        packSize: json['pack_size'],
        productForm: json['product_form'],
        images: (json['images'] as List<dynamic>? ?? [])
            .map((e) => ProductImage.fromJson(e))
            .toList(),
        documents: (json['documents'] as List<dynamic>? ?? [])
            .map((e) => ProductDocument.fromJson(e))
            .toList(),
      );

  String? get primaryImageUrl =>
      images.isNotEmpty ? images.first.imageUrl : null;
}

class ProductListResponse {
  final List<Product> products;
  final int total;
  final int page;
  final int totalPages;

  ProductListResponse({
    required this.products,
    required this.total,
    required this.page,
    required this.totalPages,
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
