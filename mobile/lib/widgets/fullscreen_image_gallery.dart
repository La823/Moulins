import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:cached_network_image/cached_network_image.dart';

// Pinch-to-zoom, swipe-between-images full-screen viewer. Opens at
// [initialIndex] and reports page changes back via onPageChanged so the
// caller (e.g. the product detail header) can stay in sync.
void openFullScreenImageGallery(
  BuildContext context, {
  required List<String> imageUrls,
  int initialIndex = 0,
  void Function(int index)? onPageChanged,
}) {
  // rootNavigator: true — product detail (and other) screens live inside a
  // ShellRoute with a persistent bottom nav bar, so a plain Navigator.of()
  // push stays nested inside that shell and the nav bar remains visible
  // around the viewer. Pushing on the root navigator covers the whole screen.
  Navigator.of(context, rootNavigator: true).push(
    PageRouteBuilder(
      opaque: false,
      barrierColor: Colors.black,
      pageBuilder: (_, __, ___) => _FullScreenImageGallery(
        imageUrls: imageUrls,
        initialIndex: initialIndex,
        onPageChanged: onPageChanged,
      ),
    ),
  );
}

class _FullScreenImageGallery extends StatefulWidget {
  final List<String> imageUrls;
  final int initialIndex;
  final void Function(int index)? onPageChanged;

  const _FullScreenImageGallery({required this.imageUrls, required this.initialIndex, this.onPageChanged});

  @override
  State<_FullScreenImageGallery> createState() => _FullScreenImageGalleryState();
}

class _FullScreenImageGalleryState extends State<_FullScreenImageGallery> {
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
    return Scaffold(
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
            onPageChanged: (i) {
              setState(() => _current = i);
              widget.onPageChanged?.call(i);
            },
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
                    onPressed: () => Navigator.of(context).pop(),
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
    );
  }
}
