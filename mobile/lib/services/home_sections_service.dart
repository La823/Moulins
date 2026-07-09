import '../config/api.dart';
import '../models/home_sections.dart';

class HomeSectionsService {
  final _dio = createDio();

  Future<HomeHighlights> getHighlights() async {
    final res = await _dio.get('/home-highlights');
    return HomeHighlights.fromJson(res.data);
  }

  Future<List<CarouselSlide>> getCarouselSlides() async {
    final res = await _dio.get('/home-carousel');
    final list = res.data as List<dynamic>? ?? [];
    return list.map((s) => CarouselSlide.fromJson(s)).toList();
  }

  Future<HomeFocusSection> getFocusSection() async {
    final res = await _dio.get('/home-focus');
    return HomeFocusSection.fromJson(res.data);
  }
}
