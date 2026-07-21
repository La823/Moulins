import '../config/api.dart';
import '../models/admin_user.dart';
import '../models/product.dart';

class DashboardStats {
  // null means "not shown" — either the request failed or the caller isn't
  // permitted to see that stat, distinct from a real value of 0.
  final int? totalProducts;
  final int? activeProducts;
  final int? totalCustomers;
  final int? totalEmployees;

  DashboardStats({
    this.totalProducts,
    this.activeProducts,
    this.totalCustomers,
    this.totalEmployees,
  });
}

class AdminService {
  final _dio = createDio();

  Future<int?> _tryCount(Future<int> Function() fetch) async {
    try {
      return await fetch();
    } catch (_) {
      return null;
    }
  }

  // Each stat is fetched independently so a 403 on one (e.g. an employee
  // without the "customers" permission) doesn't blank out the others —
  // mirrors the web dashboard's per-card fetch-and-catch pattern.
  Future<DashboardStats> getDashboardStats({
    required bool canSeeProducts,
    required bool canSeeCustomers,
    required bool canSeeEmployees,
  }) async {
    final results = await Future.wait([
      canSeeProducts
          ? _tryCount(() async => (await _dio.get('/admin/products', queryParameters: {'page': 1, 'limit': 1})).data['total'] ?? 0)
          : Future.value(null),
      canSeeProducts
          ? _tryCount(() async => (await _dio.get('/products', queryParameters: {'page': 1, 'limit': 1})).data['total'] ?? 0)
          : Future.value(null),
      canSeeCustomers
          ? _tryCount(() async => ((await _dio.get('/admin/customers')).data as List<dynamic>? ?? []).length)
          : Future.value(null),
      canSeeEmployees
          ? _tryCount(() async => ((await _dio.get('/admin/employees')).data as List<dynamic>? ?? []).length)
          : Future.value(null),
    ]);
    return DashboardStats(
      totalProducts: results[0],
      activeProducts: results[1],
      totalCustomers: results[2],
      totalEmployees: results[3],
    );
  }

  Future<List<AdminCustomer>> getCustomers() async {
    final res = await _dio.get('/admin/customers');
    return (res.data as List<dynamic>).map((e) => AdminCustomer.fromJson(e)).toList();
  }

  Future<AdminCustomer> getCustomerDetail(String id) async {
    final res = await _dio.get('/admin/customers/$id');
    return AdminCustomer.fromJson(res.data);
  }

  Future<void> updateCustomerPassword(String id, String password) async {
    await _dio.put('/admin/customers/$id/password', data: {'password': password});
  }

  Future<void> deleteCustomer(String id) async {
    await _dio.delete('/admin/customers/$id');
  }

  Future<void> verifyCustomerDocument(String userId, String docType, bool isVerified, String? rejectionReason) async {
    await _dio.post('/admin/customers/verify-document', data: {
      'user_id': userId,
      'doc_type': docType,
      'is_verified': isVerified,
      'rejection_reason': rejectionReason,
    });
  }

  Future<Map<String, String>?> getCustomerLedger(String id) async {
    final res = await _dio.get('/admin/customers/$id/ledger');
    if (res.data == null) return null;
    return {
      'file_url': res.data['file_url'] ?? '',
      'updated_at': res.data['updated_at'] ?? '',
    };
  }

  Future<List<AdminEmployee>> getEmployees() async {
    final res = await _dio.get('/admin/employees');
    return (res.data as List<dynamic>).map((e) => AdminEmployee.fromJson(e)).toList();
  }

  Future<AdminEmployee> getEmployeeDetail(String id) async {
    final res = await _dio.get('/admin/employees/$id');
    return AdminEmployee.fromJson(res.data);
  }

  Future<void> updateEmployeePassword(String id, String password) async {
    await _dio.put('/admin/employees/$id/password', data: {'password': password});
  }

  Future<List<PermissionDef>> getAllPermissions() async {
    final res = await _dio.get('/admin/permissions');
    return (res.data['permissions'] as List<dynamic>).map((e) => PermissionDef.fromJson(e)).toList();
  }

  Future<void> updateEmployeePermissions(String id, List<String> permissions) async {
    await _dio.put('/admin/employees/$id/permissions', data: {'permissions': permissions});
  }

  Future<void> deleteEmployee(String id) async {
    await _dio.delete('/admin/employees/$id');
  }

  Future<ProductListResponse> getAdminProducts({
    int page = 1,
    int limit = 20,
    String search = '',
  }) async {
    final res = await _dio.get('/admin/products', queryParameters: {
      'page': page,
      'limit': limit,
      if (search.isNotEmpty) 'search': search,
    });
    return ProductListResponse.fromJson(res.data);
  }

  Future<String> createProduct({
    required String name,
    required double price,
    String description = '',
    int stock = 0,
    double? mrp,
    String? brandName,
  }) async {
    final res = await _dio.post('/admin/products', data: {
      'name': name,
      'price': price,
      'description': description,
      'stock': stock,
      'categories': <String>[],
      if (mrp != null) 'mrp': mrp,
      if (brandName != null && brandName.isNotEmpty) 'brand_name': brandName,
    });
    return res.data['id'] as String;
  }

  Future<void> deleteProduct(String id) async {
    await _dio.delete('/admin/products/$id');
  }

  Future<Map<String, String>> getProductImageUploadUrl(String filename) async {
    final res = await _dio.post('/admin/products/upload-url', data: {'filename': filename});
    return {'upload_url': res.data['upload_url'], 'key': res.data['key']};
  }

  Future<void> addProductImage(String productId, String imageKey) async {
    await _dio.post('/admin/products/$productId/images', data: {'image_key': imageKey});
  }
}
