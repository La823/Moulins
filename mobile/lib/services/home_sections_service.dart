import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';
import '../config/api.dart';
import '../models/home_sections.dart';

const _highlightsKey = 'cached_home_highlights';
const _carouselKey = 'cached_home_carousel';
const _focusKey = 'cached_home_focus';

/// Home page content barely changes (it's admin-managed marketing content),
/// so every screen open re-fetching it over the network is pure latency
/// with nothing to show for it. Each getter now follows a stale-while-
/// revalidate pattern: callers can paint instantly from the last-cached
/// copy via the `getCached*` methods, then the network fetch (still run
/// via `get*`) refreshes it and updates the local cache for next time.
class HomeSectionsService {
  final _dio = createDio();

  Future<HomeHighlights> getHighlights() async {
    final res = await _dio.get('/home-highlights');
    final data = HomeHighlights.fromJson(res.data);
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_highlightsKey, jsonEncode(data.toJson()));
    return data;
  }

  Future<HomeHighlights?> getCachedHighlights() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_highlightsKey);
    if (raw == null) return null;
    try {
      return HomeHighlights.fromJson(jsonDecode(raw));
    } catch (_) {
      return null;
    }
  }

  Future<List<CarouselSlide>> getCarouselSlides() async {
    final res = await _dio.get('/home-carousel');
    final list = res.data as List<dynamic>? ?? [];
    final slides = list.map((s) => CarouselSlide.fromJson(s)).toList();
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_carouselKey, jsonEncode(slides.map((s) => s.toJson()).toList()));
    return slides;
  }

  Future<List<CarouselSlide>> getCachedCarouselSlides() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_carouselKey);
    if (raw == null) return [];
    try {
      return (jsonDecode(raw) as List<dynamic>).map((s) => CarouselSlide.fromJson(s)).toList();
    } catch (_) {
      return [];
    }
  }

  Future<HomeFocusSection> getFocusSection() async {
    final res = await _dio.get('/home-focus');
    final data = HomeFocusSection.fromJson(res.data);
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_focusKey, jsonEncode(data.toJson()));
    return data;
  }

  Future<HomeFocusSection?> getCachedFocusSection() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_focusKey);
    if (raw == null) return null;
    try {
      return HomeFocusSection.fromJson(jsonDecode(raw));
    } catch (_) {
      return null;
    }
  }
}
