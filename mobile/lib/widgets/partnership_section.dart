import 'package:flutter/material.dart';

const _ink = Color(0xFF1A1A1A);

class _PartnerLogo {
  final String name;
  final String asset;
  final String tagline;

  const _PartnerLogo({required this.name, required this.asset, required this.tagline});
}

const _partnerLogos = [
  _PartnerLogo(
    name: 'OPITAC',
    asset: 'assets/partnership/opitac_logo.png',
    tagline: 'Advanced Glutathione Technology for antioxidant protection and cellular wellness.',
  ),
  _PartnerLogo(
    name: 'Lonza',
    asset: 'assets/partnership/Lonza.png',
    tagline: 'Patented UC-II® Collagen for clinically proven joint health and mobility.',
  ),
  _PartnerLogo(
    name: 'Sami-Sabinsa',
    asset: 'assets/partnership/Sami.png',
    tagline: 'Clinically Researched Boswellin® for musculoskeletal care and inflammation support.',
  ),
  _PartnerLogo(
    name: 'Fuji Chemical',
    asset: 'assets/partnership/Fuji.png',
    tagline: 'Premium Astaxanthin Innovation for vision, retinal and antioxidant health.',
  ),
  _PartnerLogo(
    name: 'Virchow Biotech',
    asset: 'assets/partnership/Virchow.png',
    tagline: 'Regenerative Biotechnology Solutions for advanced wound healing and specialized care.',
  ),
];

/// Mirrors the website's homepage Partnerships section: taglines, the two
/// banner graphics, then an endlessly scrolling logo strip at the bottom.
class PartnershipSection extends StatefulWidget {
  const PartnershipSection({super.key});

  @override
  State<PartnershipSection> createState() => _PartnershipSectionState();
}

const _bannerImages = [
  'assets/partnership/companyglobe.jpeg',
  'assets/partnership/companies.jpeg',
];

class _PartnershipSectionState extends State<PartnershipSection> with SingleTickerProviderStateMixin {
  late final AnimationController _controller;
  late final PageController _bannerController;
  int _bannerIndex = 0;

  static const _logoSlotWidth = 160.0;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(vsync: this, duration: const Duration(seconds: 18))..repeat();
    _bannerController = PageController();
  }

  @override
  void dispose() {
    _controller.dispose();
    _bannerController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final trackWidth = _logoSlotWidth * _partnerLogos.length;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 32, 20, 0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              const Text(
                'Our Global Partnerships',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 22, fontWeight: FontWeight.w400, color: _ink),
              ),
              const SizedBox(height: 20),
              for (final logo in _partnerLogos)
                Padding(
                  padding: const EdgeInsets.only(bottom: 16),
                  child: Column(
                    children: [
                      Image.asset(logo.asset, height: 32, fit: BoxFit.contain),
                      const SizedBox(height: 8),
                      Text(
                        logo.tagline,
                        textAlign: TextAlign.center,
                        style: TextStyle(fontSize: 12, color: Colors.grey.shade500, height: 1.4),
                      ),
                    ],
                  ),
                ),
              const SizedBox(height: 8),
              AspectRatio(
                aspectRatio: 3 / 4,
                child: Stack(
                  children: [
                    ClipRRect(
                      borderRadius: BorderRadius.circular(10),
                      child: PageView(
                        controller: _bannerController,
                        onPageChanged: (i) => setState(() => _bannerIndex = i),
                        children: [
                          for (final img in _bannerImages)
                            Container(
                              color: Colors.grey.shade50,
                              child: Image.asset(img, fit: BoxFit.contain),
                            ),
                        ],
                      ),
                    ),
                    Positioned(
                      left: 4,
                      top: 0,
                      bottom: 0,
                      child: Center(
                        child: _BannerArrow(
                          icon: Icons.chevron_left,
                          onTap: _bannerIndex == 0
                              ? null
                              : () => _bannerController.previousPage(
                                    duration: const Duration(milliseconds: 300),
                                    curve: Curves.easeOut,
                                  ),
                        ),
                      ),
                    ),
                    Positioned(
                      right: 4,
                      top: 0,
                      bottom: 0,
                      child: Center(
                        child: _BannerArrow(
                          icon: Icons.chevron_right,
                          onTap: _bannerIndex == _bannerImages.length - 1
                              ? null
                              : () => _bannerController.nextPage(
                                    duration: const Duration(milliseconds: 300),
                                    curve: Curves.easeOut,
                                  ),
                        ),
                      ),
                    ),
                    Positioned(
                      bottom: 10,
                      left: 0,
                      right: 0,
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          for (int i = 0; i < _bannerImages.length; i++)
                            AnimatedContainer(
                              duration: const Duration(milliseconds: 200),
                              margin: const EdgeInsets.symmetric(horizontal: 3),
                              width: i == _bannerIndex ? 18 : 6,
                              height: 6,
                              decoration: BoxDecoration(
                                color: i == _bannerIndex ? Colors.white : Colors.white.withValues(alpha: 0.6),
                                borderRadius: BorderRadius.circular(3),
                                boxShadow: const [BoxShadow(color: Colors.black26, blurRadius: 3)],
                              ),
                            ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 24),
        SizedBox(
          height: 56,
          child: ClipRect(
            child: AnimatedBuilder(
              animation: _controller,
              builder: (context, child) {
                final dx = -_controller.value * trackWidth;
                return OverflowBox(
                  maxWidth: double.infinity,
                  alignment: Alignment.centerLeft,
                  child: Transform.translate(
                    offset: Offset(dx, 0),
                    child: Row(
                      children: [
                        for (final logo in [..._partnerLogos, ..._partnerLogos, ..._partnerLogos])
                          SizedBox(
                            width: _logoSlotWidth,
                            child: Center(
                              child: Image.asset(logo.asset, height: 36, fit: BoxFit.contain),
                            ),
                          ),
                      ],
                    ),
                  ),
                );
              },
            ),
          ),
        ),
      ],
    );
  }
}

class _BannerArrow extends StatelessWidget {
  final IconData icon;
  final VoidCallback? onTap;

  const _BannerArrow({required this.icon, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final enabled = onTap != null;
    return Material(
      color: Colors.black.withValues(alpha: enabled ? 0.35 : 0.12),
      shape: const CircleBorder(),
      child: InkWell(
        customBorder: const CircleBorder(),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(4),
          child: Icon(icon, color: Colors.white, size: 22),
        ),
      ),
    );
  }
}
