import '../config/api.dart';
import '../models/broadcast_list.dart';

class BroadcastListService {
  final _dio = createDio();

  Future<List<BroadcastList>> getLists() async {
    final res = await _dio.get('/admin/broadcast-lists');
    final list = res.data['lists'] as List<dynamic>? ?? [];
    return list.map((e) => BroadcastList.fromJson(e)).toList();
  }

  Future<(BroadcastList, List<BroadcastListMember>)> getList(String id) async {
    final res = await _dio.get('/admin/broadcast-lists/$id');
    final list = BroadcastList.fromJson(res.data['list']);
    final members = (res.data['members'] as List<dynamic>? ?? [])
        .map((e) => BroadcastListMember.fromJson(e))
        .toList();
    return (list, members);
  }

  Future<void> createList(String name, List<String> userIds) async {
    await _dio.post('/admin/broadcast-lists', data: {'name': name, 'user_ids': userIds});
  }

  Future<void> updateList(String id, String name, List<String> userIds) async {
    await _dio.put('/admin/broadcast-lists/$id', data: {'name': name, 'user_ids': userIds});
  }

  Future<void> deleteList(String id) async {
    await _dio.delete('/admin/broadcast-lists/$id');
  }

  // Shared partner picker — blank query lists all partners (capped) for
  // browsing; a query filters server-side.
  Future<List<BroadcastListMember>> searchPartners([String query = '']) async {
    final res = await _dio.get('/admin/users/search', queryParameters: query.isEmpty ? null : {'q': query});
    final list = res.data as List<dynamic>? ?? [];
    return list.map((e) => BroadcastListMember.fromJson(e)).toList();
  }
}
