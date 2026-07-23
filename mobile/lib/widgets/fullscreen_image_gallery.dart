import 'package:flutter/material.dart';
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
  Navigator.of(context).push(
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
  late final PageController _controller = PageController(initialPage: widget.initialIndex);
  late int _current = widget.initialIndex;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        children: [
          PageView.builder(
            controller: _controller,
            itemCount: widget.imageUrls.length,
            onPageChanged: (i) {
              setState(() => _current = i);
              widget.onPageChanged?.call(i);
            },
            itemBuilder: (context, i) => GestureDetector(
              onTap: () => Navigator.of(context).pop(),
              child: Center(
                child: InteractiveViewer(
                  minScale: 1,
                  maxScale: 4,
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
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.all(8),
              child: IconButton(
                icon: const Icon(Icons.close, color: Colors.white),
                onPressed: () => Navigator.of(context).pop(),
              ),
            ),
          ),
          if (widget.imageUrls.length > 1)
            Positioned(
              bottom: 24,
              left: 0,
              right: 0,
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
        ],
      ),
    );
  }
}
