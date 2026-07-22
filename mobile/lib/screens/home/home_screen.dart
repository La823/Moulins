import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../widgets/notification_bell_button.dart';
import '../../widgets/chat_button.dart';
import '../../widgets/profile_button.dart';
import '../../widgets/home_highlights_section.dart';
import '../../widgets/home_carousel_section.dart';
// import '../../widgets/areas_of_focus_section.dart'; // temporarily unused — see below
import '../../widgets/app_drawer.dart';
import '../../data/divisions.dart';

const _ink = Color(0xFF1A1A1A);

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      drawer: const AppDrawer(),
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
          // Areas of Focus — temporarily hidden, not removed; may be needed again later.
          // const AreasOfFocusSection(),
          const SizedBox(height: 24),
        ],
      ),
    );
  }
}

class _Hero extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final width = MediaQuery.of(context).size.width;
    final height = MediaQuery.of(context).size.height - kToolbarHeight - MediaQuery.of(context).padding.top;
    // Crop 20% off the image overall — 8% from the top, 12% from the bottom —
    // then scale the remaining 80% back up to fill the hero height.
    const topCropFraction = 0.08;
    const bottomCropFraction = 0.12;
    final virtualHeight = height / (1 - topCropFraction - bottomCropFraction);
    final topOffset = topCropFraction * virtualHeight;
    return Stack(
      children: [
        SizedBox(
          height: height,
          width: double.infinity,
          child: ClipRect(
            child: OverflowBox(
              maxHeight: virtualHeight,
              alignment: Alignment.topCenter,
              child: Transform.translate(
                offset: Offset(0, -topOffset),
                child: SizedBox(
                  height: virtualHeight,
                  width: width,
                  child: Image.asset(
                    'assets/images/mobilehome.png',
                    fit: BoxFit.cover,
                    alignment: const Alignment(-0.4, -1.0),
                  ),
                ),
              ),
            ),
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
              const Text.rich(
                TextSpan(
                  children: [
                    TextSpan(
                      text: 'Healthcare\n',
                      style: TextStyle(fontWeight: FontWeight.w600),
                    ),
                    TextSpan(
                      text: 'beyond medicine',
                      style: TextStyle(fontWeight: FontWeight.w300),
                    ),
                  ],
                ),
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 30,
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
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 32, 20, 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Our Divisions', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w400, color: _ink)),
          const SizedBox(height: 8),
          Text(
            'From active ingredients to finished formulations — explore our catalogue.',
            style: TextStyle(fontSize: 13, color: Colors.grey.shade500, height: 1.4),
          ),
          const SizedBox(height: 20),
          GridView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            itemCount: kDivisions.length,
            gridDelegate: const SliceGridDelegate(),
            itemBuilder: (context, i) {
              final d = kDivisions[i];
              return _DivisionCard(name: d.heroLabel, desc: d.heroTitle, image: d.gridImage, route: d.route);
            },
          ),
        ],
      ),
    );
  }
}

/// 2 columns × 6 rows, matching the website's division grid.
class SliceGridDelegate extends SliverGridDelegateWithFixedCrossAxisCount {
  const SliceGridDelegate()
      : super(crossAxisCount: 2, mainAxisSpacing: 10, crossAxisSpacing: 10, childAspectRatio: 16 / 9);
}

class _DivisionCard extends StatelessWidget {
  final String name;
  final String desc;
  final String image;
  final String route;

  const _DivisionCard({required this.name, required this.desc, required this.image, required this.route});

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: () => context.push(route),
      child: ClipRRect(
        child: Stack(
          fit: StackFit.expand,
          children: [
            Container(
              color: Colors.white,
              child: Image.asset(
                image,
                fit: BoxFit.contain,
                errorBuilder: (context, error, stackTrace) =>
                    Container(color: Colors.grey.shade200, child: const Icon(Icons.image_not_supported_outlined, color: Colors.grey)),
              ),
            ),
            Positioned(
              left: 0,
              right: 0,
              bottom: 0,
              height: 44,
              child: DecoratedBox(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.bottomCenter,
                    end: Alignment.topCenter,
                    colors: [Colors.black.withValues(alpha: 0.7), Colors.transparent],
                  ),
                ),
              ),
            ),
            Positioned(
              left: 10,
              right: 10,
              bottom: 6,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    name,
                    style: const TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w600),
                    overflow: TextOverflow.ellipsis,
                  ),
                  if (desc.isNotEmpty)
                    Text(
                      desc,
                      style: TextStyle(color: Colors.white.withValues(alpha: 0.7), fontSize: 10),
                      overflow: TextOverflow.ellipsis,
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

