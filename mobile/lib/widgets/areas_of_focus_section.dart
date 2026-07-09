import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../models/home_sections.dart';
import '../services/home_sections_service.dart';

const _ink = Color(0xFF1A1A1A);

class AreasOfFocusSection extends StatefulWidget {
  const AreasOfFocusSection({super.key});

  @override
  State<AreasOfFocusSection> createState() => _AreasOfFocusSectionState();
}

class _AreasOfFocusSectionState extends State<AreasOfFocusSection> {
  HomeFocusSection? _data;

  @override
  void initState() {
    super.initState();
    HomeSectionsService().getFocusSection().then((d) {
      if (mounted) setState(() => _data = d);
    }).catchError((_) {});
  }

  @override
  Widget build(BuildContext context) {
    final d = _data;
    if (d == null) return const SizedBox.shrink();
    final cards = d.cards.where((c) => c.title.isNotEmpty).toList();
    if (cards.isEmpty) return const SizedBox.shrink();

    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 32, 20, 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(d.heading, style: const TextStyle(fontSize: 24, color: _ink)),
          if (d.description.isNotEmpty) ...[
            const SizedBox(height: 10),
            Text(
              d.description,
              style: TextStyle(fontSize: 13, color: Colors.grey.shade500, height: 1.5),
            ),
          ],
          const SizedBox(height: 20),
          GridView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            itemCount: cards.length,
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 2,
              mainAxisSpacing: 20,
              crossAxisSpacing: 14,
              childAspectRatio: 0.68,
            ),
            itemBuilder: (_, i) => _FocusCardTile(card: cards[i]),
          ),
        ],
      ),
    );
  }
}

class _FocusCardTile extends StatelessWidget {
  final FocusCard card;
  const _FocusCardTile({required this.card});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () => context.push(resolveMobileRoute(card.linkUrl)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: ClipRRect(
              child: card.imageUrl.isEmpty
                  ? Container(color: Colors.grey.shade100, width: double.infinity)
                  : CachedNetworkImage(imageUrl: card.imageUrl, fit: BoxFit.cover, width: double.infinity),
            ),
          ),
          const SizedBox(height: 8),
          Text(card.title, style: const TextStyle(fontSize: 13.5, color: _ink)),
          const SizedBox(height: 4),
          const Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text('Learn more', style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w600, color: Colors.red)),
              SizedBox(width: 3),
              Icon(Icons.arrow_forward, size: 12, color: Colors.red),
            ],
          ),
        ],
      ),
    );
  }
}
