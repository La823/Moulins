import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../models/home_sections.dart';
import '../services/home_sections_service.dart';

const _darkGreen = Color(0xFF1F3B2C);
const _cream = Color(0xFFF3EEE3);

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
    HomeSectionsService().getHighlights().then((d) {
      if (mounted) setState(() => _data = d);
    }).catchError((_) {});
  }

  @override
  Widget build(BuildContext context) {
    final d = _data;
    if (d == null || d.heading.isEmpty) return const SizedBox.shrink();

    return Container(
      color: _darkGreen,
      padding: const EdgeInsets.symmetric(vertical: 32, horizontal: 20),
      child: Column(
        children: [
          Text(
            d.heading,
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 24, color: _cream),
          ),
          const SizedBox(height: 24),
          _Card(imageUrl: d.card1ImageUrl, buttonText: d.card1ButtonText, linkUrl: d.card1LinkUrl),
          const SizedBox(height: 16),
          _Card(imageUrl: d.card2ImageUrl, buttonText: d.card2ButtonText, linkUrl: d.card2LinkUrl),
        ],
      ),
    );
  }
}

class _Card extends StatelessWidget {
  final String imageUrl;
  final String buttonText;
  final String linkUrl;

  const _Card({required this.imageUrl, required this.buttonText, required this.linkUrl});

  @override
  Widget build(BuildContext context) {
    if (buttonText.isEmpty) return const SizedBox.shrink();
    return GestureDetector(
      onTap: () => context.push(resolveMobileRoute(linkUrl)),
      child: Column(
        children: [
          AspectRatio(
            aspectRatio: 4 / 3,
            child: imageUrl.isEmpty
                ? Container(color: Colors.black12)
                : CachedNetworkImage(imageUrl: imageUrl, fit: BoxFit.cover, width: double.infinity),
          ),
          Container(
            width: double.infinity,
            color: _cream,
            padding: const EdgeInsets.symmetric(vertical: 16),
            alignment: Alignment.center,
            child: Text(
              buttonText,
              style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: _darkGreen),
            ),
          ),
        ],
      ),
    );
  }
}
