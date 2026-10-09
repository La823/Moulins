import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../models/home_sections.dart';
import '../services/home_sections_service.dart';
import '../utils/responsive.dart';

// Warm "product spotlight" palette, same as the website section
const _cream = Color(0xFFFBF3EA);
const _peach = Color(0xFFF6DFC8);
const _orange = Color(0xFFE0661F);
const _orangeLight = Color(0xFFF08A3C);
const _border = Color(0xFFF1C9A5);
const _forest = Color(0xFF10261C);
const _serif = 'Erode';

class HomeHighlightsSection extends StatefulWidget {
  const HomeHighlightsSection({super.key});

  @override
  State<HomeHighlightsSection> createState() => _HomeHighlightsSectionState();
}

class _HomeHighlightsSectionState extends State<HomeHighlightsSection> {
  HomeHighlights? _data;

  @override
  void initState() {
    super.initState();
    final service = HomeSectionsService();
    service.getCachedHighlights().then((cached) {
      if (mounted && cached != null) setState(() => _data = cached);
    });
    service.getHighlights().then((d) {
      if (mounted) setState(() => _data = d);
    }).catchError((_) {});
  }

  @override
  Widget build(BuildContext context) {
    final d = _data;
    if (d == null || d.heading.isEmpty) return const SizedBox.shrink();

    final wide = isWide(context);
    final card1 = _Card(imageUrl: d.card1ImageUrl, buttonText: d.card1ButtonText, linkUrl: d.card1LinkUrl, wide: wide);
    final card2 = _Card(imageUrl: d.card2ImageUrl, buttonText: d.card2ButtonText, linkUrl: d.card2LinkUrl, wide: wide);

    return ClipRect(
      child: Container(
        color: _cream,
        child: Stack(
          children: [
            // Soft peach arcs + orange dot field, top right
            Positioned(
              top: -140,
              right: -140,
              child: Container(
                width: wide ? 460 : 320,
                height: wide ? 460 : 320,
                decoration: BoxDecoration(color: _peach.withValues(alpha: 0.6), shape: BoxShape.circle),
              ),
            ),
            Positioned(
              bottom: -160,
              left: -120,
              child: Container(
                width: 360,
                height: 360,
                decoration: BoxDecoration(color: const Color(0xFFF8E7D6).withValues(alpha: 0.7), shape: BoxShape.circle),
              ),
            ),
            Positioned(
              top: 0,
              right: 0,
              child: CustomPaint(size: Size(wide ? 280 : 170, wide ? 200 : 130), painter: _DotFieldPainter()),
            ),
            Padding(
              padding: EdgeInsets.fromLTRB(wide ? 40 : 20, wide ? 48 : 32, wide ? 40 : 20, wide ? 48 : 32),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Text(
                        'PRODUCT SPOTLIGHT',
                        style: TextStyle(
                          fontSize: wide ? 12 : 10.5,
                          fontWeight: FontWeight.w600,
                          letterSpacing: 2.5,
                          color: _orange,
                        ),
                      ),
                      const SizedBox(width: 12),
                      Container(width: 44, height: 1, color: _orange.withValues(alpha: 0.6)),
                    ],
                  ),
                  const SizedBox(height: 10),
                  ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 640),
                    child: Text(
                      d.heading,
                      style: TextStyle(
                        fontFamily: _serif,
                        fontSize: wide ? 44 : 30,
                        fontWeight: FontWeight.w700,
                        height: 1.08,
                        color: _forest,
                      ),
                    ),
                  ),
                  SizedBox(height: wide ? 28 : 22),
                  // Tablet: the two cards side by side. Phone: stacked.
                  if (wide)
                    IntrinsicHeight(
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Expanded(child: card1),
                          const SizedBox(width: 20),
                          Expanded(child: card2),
                        ],
                      ),
                    )
                  else ...[
                    card1,
                    const SizedBox(height: 16),
                    card2,
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Orange dots that fade out away from the top-right corner.
class _DotFieldPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    const gap = 18.0;
    final paint = Paint()..color = _orangeLight;
    final maxDist = size.width;
    for (double x = gap / 2; x < size.width; x += gap) {
      for (double y = gap / 2; y < size.height; y += gap) {
        final dist = Offset(size.width - x, y).distance;
        final t = (1 - dist / maxDist).clamp(0.0, 1.0);
        if (t <= 0.05) continue;
        paint.color = _orangeLight.withValues(alpha: 0.85 * t);
        canvas.drawCircle(Offset(x, y), 1.2 + 2.0 * t, paint);
      }
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

class _Card extends StatelessWidget {
  final String imageUrl;
  final String buttonText;
  final String linkUrl;
  final bool wide;

  const _Card({required this.imageUrl, required this.buttonText, required this.linkUrl, required this.wide});

  @override
  Widget build(BuildContext context) {
    if (buttonText.isEmpty) return const SizedBox.shrink();
    return Material(
      color: Colors.white,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(18),
        side: const BorderSide(color: _border),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: () => context.push(resolveMobileRoute(linkUrl)),
        child: Column(
          children: [
            // Product photo with breathing room around it
            AspectRatio(
              aspectRatio: 16 / 10,
              child: Padding(
                padding: EdgeInsets.all(wide ? 32 : 22),
                child: imageUrl.isEmpty
                    ? const SizedBox.shrink()
                    : CachedNetworkImage(imageUrl: imageUrl, fit: BoxFit.contain),
              ),
            ),
            Padding(
              padding: EdgeInsets.fromLTRB(wide ? 22 : 18, 4, wide ? 18 : 14, wide ? 20 : 16),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      buttonText,
                      style: TextStyle(
                        fontFamily: _serif,
                        fontSize: wide ? 26 : 21,
                        fontWeight: FontWeight.w700,
                        color: _forest,
                        height: 1.15,
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Container(
                    width: wide ? 44 : 40,
                    height: wide ? 44 : 40,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      gradient: const LinearGradient(colors: [_orange, _orangeLight]),
                      boxShadow: [BoxShadow(color: _orange.withValues(alpha: 0.3), blurRadius: 8, offset: const Offset(0, 3))],
                    ),
                    child: const Icon(Icons.arrow_forward, color: Colors.white, size: 20),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
