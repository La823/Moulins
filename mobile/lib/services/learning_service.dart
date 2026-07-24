import '../config/api.dart';
import '../models/learning.dart';

class LearningService {
  final _dio = createDio();

  Future<List<LearningVideo>> getVideos({String search = '', String? playlistId, String? productId}) async {
    final res = await _dio.get('/learning/videos', queryParameters: {
      if (search.isNotEmpty) 'search': search,
      if (playlistId != null && playlistId.isNotEmpty) 'playlist_id': playlistId,
      if (productId != null && productId.isNotEmpty) 'product_id': productId,
    });
    return (res.data as List<dynamic>).map((e) => LearningVideo.fromJson(e)).toList();
  }

  Future<List<LearningPlaylist>> getPlaylists() async {
    final res = await _dio.get('/learning/playlists');
    return (res.data as List<dynamic>).map((e) => LearningPlaylist.fromJson(e)).toList();
  }

  Future<void> createVideo({
    required String youtubeUrl,
    required String title,
    String? description,
    String? playlistId,
    required String productId,
  }) async {
    await _dio.post('/admin/learning/videos', data: {
      'youtube_url': youtubeUrl,
      'title': title,
      if (description != null && description.isNotEmpty) 'description': description,
      if (playlistId != null && playlistId.isNotEmpty) 'playlist_id': playlistId,
      'product_id': productId,
    });
  }

  Future<void> deleteVideo(String id) async {
    await _dio.delete('/admin/learning/videos/$id');
  }
}
