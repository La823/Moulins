import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../providers/auth_provider.dart';
import '../../widgets/notification_bell_button.dart';
import '../../widgets/chat_button.dart';
import '../../widgets/profile_button.dart';
import '../../widgets/home_highlights_section.dart';
import '../../widgets/home_carousel_section.dart';
import '../../widgets/upcoming_products_section.dart';
// import '../../widgets/areas_of_focus_section.dart'; // temporarily unused — see below
import '../../widgets/partnership_section.dart';
import '../../widgets/app_drawer.dart';
import '../../widgets/cart_button.dart';
import '../../widgets/cart_drawer.dart';
import '../../data/divisions.dart';
import '../../utils/responsive.dart';
import '../../widgets/play_once_video.dart';

const _ink = Color(0xFF1A1A1A);

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Doctors browse the catalogue but cannot order, so they get no cart —
    // the same rule the products screen applies.
    final canOrder = ref.watch(authProvider).user?.role != 'doctor';

    return Scaffold(
      backgroundColor: Colors.white,
      drawer: const AppDrawer(),
      endDrawer: canOrder ? const CartDrawer() : null,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        actions: [
          const ChatButton(),
          const NotificationBellButton(),
          if (canOrder) const CartButton(),
          const ProfileButton(),
          const SizedBox(width: 4),
        ],
      ),
      body: ListView(
        padding: EdgeInsets.zero,
        children: [
          _Hero(),
          _TrustBar(),
          _CategorySection(),
          const UpcomingProductsSection(),
          const HomeHighlightsSection(),
          const HomeCarouselSection(),
          // Areas of Focus — temporarily hidden, not removed; may be needed again later.
          // const AreasOfFocusSection(),
          const PartnershipSection(),
          const SizedBox(height: 24),
        ],
      ),
    );
  }
}

class _Hero extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final wide = isWide(context);
    final screen = MediaQuery.of(context).size;
    final available = screen.height - kToolbarHeight - MediaQuery.of(context).padding.top;
    // Phone: the hero fills the screen under the app bar. Tablet: the clip is
    // landscape, so a shorter hero shows most of it instead of a thin slice.
    final height = wide ? (available * 0.72).clamp(420.0, 760.0) : available;
    return Stack(
      children: [
        SizedBox(
          height: height,
          width: double.infinity,
          // Plays once, then rests on its last frame — same as the website
          child: PlayOnceVideo(
            asset: 'assets/videos/hero.mp4',
            poster: 'assets/images/hero_poster.jpg',
            alignment: wide ? Alignment.center : const Alignment(0.3, 0),
            background: const Color(0xFFC81E28),
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
          left: wide ? 48 : 24,
          right: wide ? null : 24,
          bottom: wide ? 48 : 28,
          width: wide ? 560 : null,
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
              Text.rich(
                const TextSpan(
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
                  fontSize: wide ? 46 : 30,
                  height: 1.15,
                ),
              ),
              const SizedBox(height: 14),
              Text(
                'Pharmaceuticals, nutraceuticals and active ingredients — manufactured with precision.',
                style: TextStyle(color: Colors.white.withValues(alpha: 0.7), fontSize: wide ? 16 : 13, height: 1.4),
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

const _navy = Color(0xFF0F2557);

/// Per-division look for the home grid: short specialty line, icon, and tint
/// (strip = card's lower band, badge = icon circle + its icon colour).
/// Keyed by route so the shared kDivisions list doesn't need to change.
class _DivisionStyle {
  final String desc;
  final IconData icon;
  final Color strip;
  final Color badge;
  final Color ink;
  const _DivisionStyle(this.desc, this.icon, this.strip, this.badge, this.ink);
}

const _divisionStyles = <String, _DivisionStyle>{
  '/aerozone': _DivisionStyle('Respiratory & ENT', Icons.air, Color(0xFFF0F9FF), Color(0xFFE0F2FE), Color(0xFF0284C7)),
  '/bonevoyage': _DivisionStyle('Orthopaedics', Icons.accessibility_new, Color(0xFFFFF1F2), Color(0xFFFFE4E6), Color(0xFFF43F5E)),
  '/fluidity': _DivisionStyle('Urology & Renal', Icons.water_drop_outlined, Color(0xFFECFEFF), Color(0xFFCFFAFE), Color(0xFF0891B2)),
  '/gutsy': _DivisionStyle('Gastro', Icons.restaurant_outlined, Color(0xFFFEF2F2), Color(0xFFFEE2E2), Color(0xFFEF4444)),
  '/jivya': _DivisionStyle('Cardio Diabetic', Icons.monitor_heart_outlined, Color(0xFFF5F3FF), Color(0xFFEDE9FE), Color(0xFF7C3AED)),
  '/lifegard': _DivisionStyle('Antibiotics & Trauma', Icons.health_and_safety_outlined, Color(0xFFFEF2F2), Color(0xFFFEE2E2), Color(0xFFEF4444)),
  '/littleplanet': _DivisionStyle('Pediatric', Icons.child_care_outlined, Color(0xFFECFDF5), Color(0xFFD1FAE5), Color(0xFF059669)),
  '/matrix': _DivisionStyle('General & Wellness', Icons.eco_outlined, Color(0xFFF0FDFA), Color(0xFFCCFBF1), Color(0xFF0D9488)),
  '/mindset': _DivisionStyle('Neuro & Psychiatry', Icons.psychology_outlined, Color(0xFFFAF5FF), Color(0xFFF3E8FF), Color(0xFF9333EA)),
  '/missbella': _DivisionStyle('Derma & Skin', Icons.face_retouching_natural_outlined, Color(0xFFFFFBEB), Color(0xFFFEF3C7), Color(0xFFD97706)),
  '/srishti': _DivisionStyle('Gynaecology', Icons.female, Color(0xFFFDF2F8), Color(0xFFFCE7F3), Color(0xFFEC4899)),
  '/viewpoint': _DivisionStyle('Ophthalmology', Icons.visibility_outlined, Color(0xFFEFF6FF), Color(0xFFDBEAFE), Color(0xFF2563EB)),
};

class _CategorySection extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final wide = isWide(context);
    // Phone: 2 compact columns. Tablet: 3 (portrait) or 4 (landscape) with the arrow.
    final columns = responsiveGridColumns(context, base: 2, wide: 3, wider: 4);
    const teal = Color(0xFF0D9488);
    return Container(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [Color(0xFFF8FAFC), Colors.white],
        ),
      ),
      padding: EdgeInsets.fromLTRB(wide ? 32 : 16, wide ? 40 : 28, wide ? 32 : 16, wide ? 32 : 20),
      child: Column(
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Container(width: 32, height: 1, color: teal.withValues(alpha: 0.6)),
              const SizedBox(width: 12),
              Text(
                'SPECIALIST CARE',
                style: TextStyle(fontSize: wide ? 12 : 10.5, fontWeight: FontWeight.w600, letterSpacing: 3, color: teal),
              ),
              const SizedBox(width: 12),
              Container(width: 32, height: 1, color: teal.withValues(alpha: 0.6)),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            'Our Divisions',
            style: TextStyle(fontSize: wide ? 36 : 26, fontWeight: FontWeight.w700, color: _navy, letterSpacing: -0.5),
          ),
          const SizedBox(height: 6),
          ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 520),
            child: Text(
              'From active pharmaceutical ingredients to finished formulations — explore our comprehensive catalogue.',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: wide ? 14 : 12.5, color: Colors.blueGrey.shade500, height: 1.45),
            ),
          ),
          SizedBox(height: wide ? 24 : 18),
          GridView.builder(
            shrinkWrap: true,
            padding: EdgeInsets.zero,
            physics: const NeverScrollableScrollPhysics(),
            itemCount: kDivisions.length,
            gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: columns,
              mainAxisSpacing: wide ? 14 : 10,
              crossAxisSpacing: wide ? 14 : 10,
              mainAxisExtent: wide ? 168 : 128,
            ),
            itemBuilder: (context, i) {
              final d = kDivisions[i];
              return _DivisionCard(
                name: d.heroLabel,
                image: d.gridImage,
                route: d.route,
                style: _divisionStyles[d.route],
                wide: wide,
              );
            },
          ),
        ],
      ),
    );
  }
}

class _DivisionCard extends StatelessWidget {
  final String name;
  final String image;
  final String route;
  final _DivisionStyle? style;
  final bool wide;

  const _DivisionCard({required this.name, required this.image, required this.route, required this.style, required this.wide});

  @override
  Widget build(BuildContext context) {
    final st = style ?? const _DivisionStyle('', Icons.medical_services_outlined, Color(0xFFF1F5F9), Color(0xFFE2E8F0), Color(0xFF475569));
    final iconSize = wide ? 38.0 : 28.0;
    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(14),
      clipBehavior: Clip.antiAlias,
      elevation: 0,
      shadowColor: Colors.black12,
      child: InkWell(
        onTap: () => context.push(route),
        child: DecoratedBox(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: const Color(0xFFF1F5F9)),
          ),
          child: Column(
            children: [
              // Division logo — the logos carry their own "A division for…" line
              Expanded(
                child: Padding(
                  padding: EdgeInsets.symmetric(horizontal: wide ? 16 : 10, vertical: wide ? 10 : 8),
                  child: Image.asset(
                    image,
                    fit: BoxFit.contain,
                    errorBuilder: (context, error, stackTrace) =>
                        const Icon(Icons.image_not_supported_outlined, color: Colors.grey),
                  ),
                ),
              ),
              Container(
                color: st.strip,
                padding: EdgeInsets.symmetric(horizontal: wide ? 12 : 8, vertical: wide ? 10 : 8),
                child: Row(
                  children: [
                    Container(
                      width: iconSize,
                      height: iconSize,
                      decoration: BoxDecoration(color: st.badge, shape: BoxShape.circle),
                      child: Icon(st.icon, size: iconSize * 0.52, color: st.ink),
                    ),
                    SizedBox(width: wide ? 10 : 7),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(
                            name,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(fontSize: wide ? 14.5 : 12.5, fontWeight: FontWeight.w700, color: _navy),
                          ),
                          if (st.desc.isNotEmpty)
                            Text(
                              st.desc,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(fontSize: wide ? 12 : 10.5, color: Colors.blueGrey.shade500),
                            ),
                        ],
                      ),
                    ),
                    // The arrow only fits comfortably at tablet widths
                    if (wide) ...[
                      const SizedBox(width: 6),
                      Container(
                        width: 28,
                        height: 28,
                        decoration: BoxDecoration(color: st.badge, shape: BoxShape.circle),
                        child: Icon(Icons.arrow_forward, size: 15, color: st.ink),
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
