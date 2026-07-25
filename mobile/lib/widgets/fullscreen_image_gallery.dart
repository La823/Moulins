import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:cached_network_image/cached_network_image.dart';

// Pinch-to-zoom, swipe-between-images full-screen viewer. Registered as a
// real top-level go_router route (see main.dart) rather than pushed
// imperatively on an ad-hoc Navigator — it used to be pushed via
// Navigator.of(context, rootNavigator: true) to cover the persistent bottom
// nav bar, but that put it on a *different* Navigator than the one
// go_router's own back-button/predictive-back handling resolves against.
// Android's predictive-back gesture would then pop go_router's stack
// directly (product detail -> product list) while force-closing this
// overlay as a side effect, skipping the detail page entirely. Making this
// a proper top-level route (a sibling of the ShellRoute, not nested inside
// it — see main.dart) puts it on the same navigator go_router already
// manages, so back handling (button, gesture, predictive-back preview) all
// resolves correctly with no extra tricks needed.
//
// Returns the last-viewed image index via Navigator.pop's result when
// closed, so the caller can keep its own image carousel in sync.
class FullScreenImageGalleryScreen extends StatefulWidget {
  final List<String> imageUrls;
  final int initialIndex;

  const FullScreenImageGalleryScreen({
    super.key,
    required this.imageUrls,
    this.initialIndex = 0,
  });

  @override
  State<FullScreenImageGalleryScreen> createState() => _FullScreenImageGalleryScreenState();
}

class _FullScreenImageGalleryScreenState extends State<FullScreenImageGalleryScreen> {
  late final PageController _pageController = PageController(initialPage: widget.initialIndex);
  late final TransformationController _transformController = TransformationController();
  late int _current = widget.initialIndex;
  bool _zoomedIn = false;
  bool _chromeVisible = true;

  @override
  void initState() {
    super.initState();
    // Hide the status/nav bars while viewing — this is a full-screen viewer.
    SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersive);
    _transformController.addListener(_onTransformChanged);
  }

  void _toggleChrome() {
    setState(() => _chromeVisible = !_chromeVisible);
    SystemChrome.setEnabledSystemUIMode(
      _chromeVisible ? SystemUiMode.edgeToEdge : SystemUiMode.immersive,
    );
  }

  void _onTransformChanged() {
    final scale = _transformController.value.getMaxScaleOnAxis();
    final zoomed = scale > 1.01;
    if (zoomed != _zoomedIn) setState(() => _zoomedIn = zoomed);
  }

  @override
  void dispose() {
    SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
    _transformController.removeListener(_onTransformChanged);
    _transformController.dispose();
    _pageController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return PopScope<int>(
      canPop: false,
      onPopInvokedWithResult: (didPop, result) {
        if (!didPop) Navigator.of(context).pop(_current);
      },
      child: Scaffold(
        backgroundColor: Colors.black,
        body: Stack(
          children: [
            PageView.builder(
              controller: _pageController,
              // Disable page swiping while zoomed in — otherwise panning a
              // zoomed image fights with the page-swipe gesture and neither
              // works reliably (PageView's drag recognizer tends to win).
              physics: _zoomedIn ? const NeverScrollableScrollPhysics() : const PageScrollPhysics(),
              itemCount: widget.imageUrls.length,
              onPageChanged: (i) => setState(() => _current = i),
              itemBuilder: (context, i) => InteractiveViewer(
                transformationController: i == _current ? _transformController : null,
                minScale: 1,
                maxScale: 4,
                // Force the pannable/zoomable region to fill the entire
                // screen (not just the image's own bounds) — otherwise a
                // pinch gesture only registers when both fingers land
                // directly on the rendered image.
                child: GestureDetector(
                  onTap: _toggleChrome,
                  child: SizedBox.expand(
                    child: Center(
                      child: CachedNetworkImage(
                        imageUrl: widget.imageUrls[i],
                        fit: BoxFit.contain,
                        placeholder: (_, __) => const CircularProgressIndicator(color: Color(0xFF00A6A4)),
                        errorWidget: (_, __, ___) => const Icon(Icons.broken_image_outlined, color: Colors.white54, size: 48),
                      ),
                    ),
                  ),
                ),
              ),
            ),
            IgnorePointer(
              ignoring: !_chromeVisible,
              child: AnimatedOpacity(
                opacity: _chromeVisible ? 1 : 0,
                duration: const Duration(milliseconds: 200),
                child: SafeArea(
                  child: Padding(
                    padding: const EdgeInsets.all(8),
                    child: IconButton(
                      icon: const Icon(Icons.close, color: Colors.white),
                      onPressed: () => Navigator.of(context).pop(_current),
                    ),
                  ),
                ),
              ),
            ),
            if (widget.imageUrls.length > 1)
              Positioned(
                bottom: 24,
                left: 0,
                right: 0,
                child: IgnorePointer(
                  ignoring: !_chromeVisible,
                  child: AnimatedOpacity(
                    opacity: _chromeVisible ? 1 : 0,
                    duration: const Duration(milliseconds: 200),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: widget.imageUrls.asMap().entries.map((e) {
                        return Container(
                          width: 8,
                          height: 8,
                          margin: const EdgeInsets.symmetric(horizontal: 4),
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            color: _current == e.key ? const Color(0xFF00A6A4) : Colors.white.withValues(alpha: 0.4),
                          ),
                        );
                      }).toList(),
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
