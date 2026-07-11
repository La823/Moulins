import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../models/home_sections.dart';
import '../services/home_sections_service.dart';

const _maroon = Color(0xFF4E1111);
const _cream = Color(0xFFF3EEE3);
const _darkGreen = Color(0xFF1F3B2C);

class HomeCarouselSection extends StatefulWidget {
  const HomeCarouselSection({super.key});

  @override
  State<HomeCarouselSection> createState() => _HomeCarouselSectionState();
}

class _HomeCarouselSectionState extends State<HomeCarouselSection> {
  List<CarouselSlide> _slides = [];
  int _index = 0;
  final _controller = PageController();

  @override
  void initState() {
    super.initState();
    final service = HomeSectionsService();
    service.getCachedCarouselSlides().then((cached) {
      if (mounted && cached.isNotEmpty) {
        setState(() => _slides = cached.where((s) => s.heading.isNotEmpty).toList());
      }
    });
    service.getCarouselSlides().then((slides) {
      if (mounted) setState(() => _slides = slides.where((s) => s.heading.isNotEmpty).toList());
    }).catchError((_) {});
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _goTo(int i) {
    final target = (i + _slides.length) % _slides.length;
    _controller.animateToPage(target, duration: const Duration(milliseconds: 400), curve: Curves.easeOut);
  }

  @override
  Widget build(BuildContext context) {
    if (_slides.isEmpty) return const SizedBox.shrink();

    return Container(
      padding: const EdgeInsets.symmetric(vertical: 32),
      child: Column(
        children: [
          SizedBox(
            height: 500,
            child: PageView.builder(
              controller: _controller,
              itemCount: _slides.length,
              onPageChanged: (i) => setState(() => _index = i),
              itemBuilder: (_, i) => _SlideCard(slide: _slides[i]),
            ),
          ),
          const SizedBox(height: 20),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              _ArrowButton(icon: Icons.arrow_back, onTap: () => _goTo(_index - 1)),
              const SizedBox(width: 16),
              Row(
                children: [
                  for (int i = 0; i < _slides.length; i++)
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 4),
                      child: GestureDetector(
                        onTap: () => _goTo(i),
                        child: Transform.rotate(
                          angle: 0.785398,
                          child: Container(
                            width: i == _index ? 9 : 7,
                            height: i == _index ? 9 : 7,
                            color: i == _index ? _darkGreen : Colors.grey.shade300,
                          ),
                        ),
                      ),
                    ),
                ],
              ),
              const SizedBox(width: 16),
              _ArrowButton(icon: Icons.arrow_forward, onTap: () => _goTo(_index + 1)),
            ],
          ),
        ],
      ),
    );
  }
}

class _SlideCard extends StatelessWidget {
  final CarouselSlide slide;
  const _SlideCard({required this.slide});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20),
      child: Column(
        children: [
          Expanded(
            flex: 7,
            child: ClipRRect(
              child: Container(
                color: Colors.grey.shade100,
                width: double.infinity,
                child: slide.imageUrl.isEmpty
                    ? null
                    : CachedNetworkImage(imageUrl: slide.imageUrl, fit: BoxFit.contain, width: double.infinity),
              ),
            ),
          ),
          Expanded(
            flex: 3,
            child: Container(
              width: double.infinity,
              color: _maroon,
              padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(
                    slide.heading,
                    textAlign: TextAlign.center,
                    style: const TextStyle(fontSize: 17, color: _cream, height: 1.15),
                  ),
                  if (slide.description.isNotEmpty) ...[
                    const SizedBox(height: 6),
                    Text(
                      slide.description,
                      textAlign: TextAlign.center,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(fontSize: 11.5, color: _cream.withValues(alpha: 0.8), height: 1.3),
                    ),
                  ],
                  const SizedBox(height: 10),
                  GestureDetector(
                    onTap: () => context.push(resolveMobileRoute(slide.buttonLink)),
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 9),
                      color: _cream,
                      child: Text(
                        slide.buttonText,
                        style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: _maroon),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _ArrowButton extends StatelessWidget {
  final IconData icon;
  final VoidCallback onTap;
  const _ArrowButton({required this.icon, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 32,
        height: 32,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          border: Border.all(color: _darkGreen),
        ),
        child: Icon(icon, size: 16, color: _darkGreen),
      ),
    );
  }
}
