import '../config/api.dart';
import '../models/learning.dart';

class LearningService {
  final _dio = createDio();

  Future<List<LearningVideo>> getVideos({String search = '', String? playlistId}) async {
    final res = await _dio.get('/learning/videos', queryParameters: {
      if (search.isNotEmpty) 'search': search,
      if (playlistId != null && playlistId.isNotEmpty) 'playlist_id': playlistId,
    });
    return (res.data as List<dynamic>).map((e) => LearningVideo.fromJson(e)).toList();
  }

  Future<List<LearningPlaylist>> getPlaylists() async {
    final res = await _dio.get('/learning/playlists');
    return (res.data as List<dynamic>).map((e) => LearningPlaylist.fromJson(e)).toList();
  }
}
