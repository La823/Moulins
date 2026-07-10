import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../widgets/notification_bell_button.dart';
import '../../widgets/chat_button.dart';
import '../../widgets/profile_button.dart';
import '../../widgets/home_highlights_section.dart';
import '../../widgets/home_carousel_section.dart';
import '../../widgets/areas_of_focus_section.dart';

const _ink = Color(0xFF1A1A1A);

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        actions: const [ChatButton(), NotificationBellButton(), ProfileButton(), SizedBox(width: 4)],
      ),
      body: ListView(
        padding: EdgeInsets.zero,
        children: [
          _Hero(),
          _TrustBar(),
          _CategorySection(),
          const HomeHighlightsSection(),
          const HomeCarouselSection(),
          const AreasOfFocusSection(),
          const SizedBox(height: 24),
        ],
      ),
    );
  }
}

class _Hero extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final height = MediaQuery.of(context).size.height - kToolbarHeight - MediaQuery.of(context).padding.top;
    return Stack(
      children: [
        SizedBox(
          height: height,
          width: double.infinity,
          child: Image.asset(
            'assets/images/hero.jpg',
            fit: BoxFit.cover,
            alignment: const Alignment(-0.4, -1.0),
          ),
        ),
        Positioned.fill(
          child: DecoratedBox(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.bottomCenter,
                end: Alignment.topCenter,
                colors: [
                  Colors.black.withValues(alpha: 0.75),
                  Colors.black.withValues(alpha: 0.35),
                  Colors.black.withValues(alpha: 0.05),
                ],
              ),
            ),
          ),
        ),
        Positioned(
          left: 24,
          right: 24,
          bottom: 28,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'TRUSTED PHARMACEUTICAL PARTNER',
                style: TextStyle(
                  color: Colors.white.withValues(alpha: 0.6),
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                  letterSpacing: 2,
                ),
              ),
              const SizedBox(height: 12),
              const Text(
                'Quality medicines,\ndelivered with care',
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 30,
                  fontWeight: FontWeight.w500,
                  height: 1.15,
                ),
              ),
              const SizedBox(height: 14),
              Text(
                'Pharmaceuticals, nutraceuticals and active ingredients — manufactured with precision.',
                style: TextStyle(color: Colors.white.withValues(alpha: 0.7), fontSize: 13, height: 1.4),
              ),
              const SizedBox(height: 20),
              Row(
                children: [
                  ElevatedButton(
                    onPressed: () => context.push('/products'),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.white,
                      foregroundColor: _ink,
                      elevation: 0,
                      padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 14),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                    ),
                    child: const Text('Browse Products', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
                  ),
                ],
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _TrustBar extends StatelessWidget {
  static const _stats = [
    ('500+', 'Products'),
    ('15+', 'Years Experience'),
    ('ISO', 'Certified'),
    ('Pan India', 'Delivery'),
  ];

  @override
  Widget build(BuildContext context) {
    return Container(
      color: const Color(0xFF111827),
      padding: const EdgeInsets.symmetric(vertical: 24, horizontal: 16),
      child: GridView.count(
        crossAxisCount: 2,
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        childAspectRatio: 2.4,
        children: [
          for (final (value, label) in _stats)
            Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(value, style: const TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.w300)),
                const SizedBox(height: 4),
                Text(
                  label.toUpperCase(),
                  style: TextStyle(color: Colors.grey.shade400, fontSize: 10, letterSpacing: 1),
                ),
              ],
            ),
        ],
      ),
    );
  }
}

class _CategorySection extends StatelessWidget {
  static const _categories = [
    ('Pharmaceuticals', 'Tablets, capsules, syrups and injectables across therapeutic categories.'),
    ('Nutraceuticals', 'Vitamins, supplements and wellness products for everyday health.'),
    ('Custom Formulations', 'Tailored manufacturing solutions for your specific requirements.'),
  ];

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 32, 20, 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Our Product Range', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w400, color: _ink)),
          const SizedBox(height: 8),
          Text(
            'From active ingredients to finished formulations — explore our catalogue.',
            style: TextStyle(fontSize: 13, color: Colors.grey.shade500, height: 1.4),
          ),
          const SizedBox(height: 20),
          for (final (title, desc) in _categories)
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: InkWell(
                onTap: () => context.push('/products'),
                borderRadius: BorderRadius.circular(12),
                child: Container(
                  padding: const EdgeInsets.all(18),
                  decoration: BoxDecoration(
                    border: Border.all(color: Colors.grey.shade200),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(title, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: _ink)),
                      const SizedBox(height: 6),
                      Text(desc, style: TextStyle(fontSize: 12.5, color: Colors.grey.shade500, height: 1.4)),
                      const SizedBox(height: 10),
                      const Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text('Explore', style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: Colors.red)),
                          SizedBox(width: 4),
                          Icon(Icons.arrow_forward, size: 14, color: Colors.red),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

