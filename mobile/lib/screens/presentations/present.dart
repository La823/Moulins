import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../../models/presentation.dart';
import '../../services/presentation_downloads.dart';

/// Which viewer "Present" opens — the swipe-through slideshow or the
/// page-turning notebook. Remembered on this device.
const presentationViewerKey = 'presentation_viewer';

Future<bool> notebookPreferred() async {
  final prefs = await SharedPreferences.getInstance();
  return prefs.getString(presentationViewerKey) == 'notebook';
}

/// Opens [slides] in the chosen viewer. Images load through the
/// presentations cache, so a downloaded deck plays with no internet.
void presentSlides(BuildContext context, List<PresentationSlide> slides, {required bool notebook}) {
  if (slides.isEmpty) return;
  if (notebook) {
    context.push('/notebook', extra: List<PresentationSlide>.of(slides));
    return;
  }
  context.push('/gallery', extra: {
    'imageUrls': slides.map((s) => s.imageUrl).toList(),
    'initialIndex': 0,
    'cacheManager': PresentationDownloads.cache,
  });
}
