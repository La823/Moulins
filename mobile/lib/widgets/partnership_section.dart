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

class _PartnershipSectionState extends State<PartnershipSection> with SingleTickerProviderStateMixin {
  late final AnimationController _controller;

  static const _logoSlotWidth = 160.0;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(vsync: this, duration: const Duration(seconds: 18))..repeat();
  }

  @override
  void dispose() {
    _controller.dispose();
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
              ClipRRect(
                borderRadius: BorderRadius.circular(10),
                child: Image.asset('assets/partnership/companyglobe.jpeg', fit: BoxFit.contain),
              ),
              const SizedBox(height: 12),
              ClipRRect(
                borderRadius: BorderRadius.circular(10),
                child: Image.asset('assets/partnership/companies.jpeg', fit: BoxFit.contain),
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
