import '../config/api.dart';
import '../models/admin_user.dart';

class DashboardStats {
  final int totalProducts;
  final int activeProducts;
  final int totalCustomers;
  final int totalEmployees;

  DashboardStats({
    required this.totalProducts,
    required this.activeProducts,
    required this.totalCustomers,
    required this.totalEmployees,
  });
}

class AdminService {
  final _dio = createDio();

  Future<DashboardStats> getDashboardStats() async {
    final results = await Future.wait([
      _dio.get('/admin/products', queryParameters: {'page': 1, 'limit': 1}),
      _dio.get('/products', queryParameters: {'page': 1, 'limit': 1}),
      _dio.get('/admin/customers'),
      _dio.get('/admin/employees'),
    ]);
    return DashboardStats(
      totalProducts: results[0].data['total'] ?? 0,
      activeProducts: results[1].data['total'] ?? 0,
      totalCustomers: (results[2].data as List<dynamic>? ?? []).length,
      totalEmployees: (results[3].data as List<dynamic>? ?? []).length,
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
}
