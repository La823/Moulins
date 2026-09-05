import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter_cache_manager/flutter_cache_manager.dart';
import 'package:open_filex/open_filex.dart';
import 'package:go_router/go_router.dart';
import 'package:audioplayers/audioplayers.dart';
import '../../models/product.dart';
import '../../providers/cart_provider.dart';
import '../../services/special_product_service.dart';
import '../../utils/responsive.dart';

/// Detail view for a single special product. Mirrors [ProductDetailScreen]
/// but talks to the special-products endpoint and drops all the Moulins-
/// catalog cross-links (categories, "explore more", recently viewed,
/// portfolio, related videos) since special products are a private,
/// uncategorised catalog.
class SpecialProductDetailScreen extends ConsumerStatefulWidget {
  final String productId;
  const SpecialProductDetailScreen({super.key, required this.productId});

  @override
  ConsumerState<SpecialProductDetailScreen> createState() => _SpecialProductDetailScreenState();
}

class _SpecialProductDetailScreenState extends ConsumerState<SpecialProductDetailScreen> {
  Product? _product;
  bool _loading = true;
  int _selectedImage = 0;
  final _imagePageCtrl = PageController();
  final Set<String> _downloadingDocs = {};
  final _audioPlayer = AudioPlayer();
  bool _audioPlaying = false;
  bool _audioLoading = false;

  @override
  void initState() {
    super.initState();
    _audioPlayer.onPlayerStateChanged.listen((state) {
      if (mounted) setState(() => _audioPlaying = state == PlayerState.playing);
    });
    _load();
  }

  @override
  void dispose() {
    _imagePageCtrl.dispose();
    _audioPlayer.dispose();
    super.dispose();
  }

  Future<void> _toggleAudio(String url) async {
    if (_audioPlaying) {
      await _audioPlayer.pause();
      return;
    }
    setState(() => _audioLoading = true);
    try {
      await _audioPlayer.play(UrlSource(url));
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Could not play audio')),
        );
      }
    } finally {
      if (mounted) setState(() => _audioLoading = false);
    }
  }

  Future<void> _load() async {
    try {
      final p = await SpecialProductService().getSpecialProduct(widget.productId);
      if (mounted) setState(() { _product = p; _loading = false; });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Scaffold(body: Center(child: CircularProgressIndicator(color: Color(0xFF00A6A4))));
    }
    if (_product == null) {
      return Scaffold(
        appBar: AppBar(),
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.cloud_off, size: 40, color: Colors.grey.shade300),
                const SizedBox(height: 12),
                const Text('Product not available', style: TextStyle(fontWeight: FontWeight.w600)),
              ],
            ),
          ),
        ),
      );
    }

    final p = _product!;
    final cart = ref.watch(cartProvider);
    final inCart = cart.any((e) => e.product.id == p.id);
    final priceValue = p.mrp ?? p.price;

    return Scaffold(
      backgroundColor: Colors.white,
      body: ResponsiveCenter(child: CustomScrollView(
        slivers: [
          // Image header
          SliverAppBar(
            expandedHeight: 300,
            pinned: true,
            backgroundColor: Colors.white,
            foregroundColor: Colors.black,
            flexibleSpace: FlexibleSpaceBar(
              background: Padding(
                padding: EdgeInsets.only(top: MediaQuery.of(context).padding.top + kToolbarHeight + (isWide(context) ? 24 : 12)),
                child: p.visibleImages.isEmpty
                  ? Container(color: Colors.grey.shade100, child: const Icon(Icons.medication_outlined, size: 80, color: Colors.grey))
                  : Stack(
                      children: [
                        PageView.builder(
                          controller: _imagePageCtrl,
                          itemCount: p.visibleImages.length,
                          onPageChanged: (i) => setState(() => _selectedImage = i),
                          itemBuilder: (context, i) => GestureDetector(
                            onTap: () async {
                              final lastViewed = await context.push<int>('/gallery', extra: {
                                'imageUrls': p.visibleImages.map((img) => img.imageUrl).toList(),
                                'initialIndex': _selectedImage,
                              });
                              if (lastViewed != null && mounted) {
                                setState(() => _selectedImage = lastViewed);
                                _imagePageCtrl.jumpToPage(lastViewed);
                              }
                            },
                            child: Container(
                              color: Colors.white,
                              width: double.infinity,
                              child: CachedNetworkImage(
                                imageUrl: p.visibleImages[i].imageUrl,
                                fit: BoxFit.contain,
                                width: double.infinity,
                                placeholder: (_, __) => Container(color: Colors.grey.shade100),
                                errorWidget: (_, __, ___) => Container(color: Colors.grey.shade100, child: const Icon(Icons.medication_outlined, size: 60, color: Colors.grey)),
                              ),
                            ),
                          ),
                        ),
                        if (p.audioUrl != null)
                          Positioned(
                            top: 12,
                            left: 12,
                            child: Material(
                              color: Colors.white.withValues(alpha: 0.9),
                              shape: const CircleBorder(),
                              child: InkWell(
                                customBorder: const CircleBorder(),
                                onTap: _audioLoading ? null : () => _toggleAudio(p.audioUrl!),
                                child: Padding(
                                  padding: const EdgeInsets.all(8),
                                  child: _audioLoading
                                      ? const SizedBox(
                                          width: 20,
                                          height: 20,
                                          child: CircularProgressIndicator(strokeWidth: 2, color: Color(0xFF1A1A1A)),
                                        )
                                      : Icon(
                                          _audioPlaying ? Icons.pause : Icons.volume_up,
                                          size: 20,
                                          color: _audioPlaying ? Colors.red.shade600 : const Color(0xFF1A1A1A),
                                        ),
                                ),
                              ),
                            ),
                          ),
                        if (p.visibleImages.length > 1)
                          Positioned(
                            bottom: 12,
                            left: 0, right: 0,
                            child: Row(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: p.visibleImages.asMap().entries.map((e) => GestureDetector(
                                onTap: () => _imagePageCtrl.animateToPage(
                                  e.key,
                                  duration: const Duration(milliseconds: 250),
                                  curve: Curves.easeOut,
                                ),
                                child: Container(
                                  width: 8, height: 8,
                                  margin: const EdgeInsets.symmetric(horizontal: 4),
                                  decoration: BoxDecoration(
                                    shape: BoxShape.circle,
                                    color: _selectedImage == e.key ? const Color(0xFF00A6A4) : Colors.white.withValues(alpha: 0.6),
                                  ),
                                ),
                              )).toList(),
                            ),
                          ),
                      ],
                    ),
              ),
            ),
          ),

          // Details
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(p.name, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold, color: Color(0xFF1A1A1A))),
                  const SizedBox(height: 8),

                  if (priceValue > 0) ...[
                    Text(
                      'MRP Rs. ${priceValue.toStringAsFixed(2)}',
                      style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w700, color: Color(0xFF00A6A4)),
                    ),
                    const SizedBox(height: 16),
                  ],

                  if (p.description.isNotEmpty) ...[
                    const Text('Description', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600)),
                    const SizedBox(height: 6),
                    Text(p.description, style: TextStyle(fontSize: 14, color: Colors.grey.shade600, height: 1.5)),
                    const SizedBox(height: 16),
                  ],

                  if (p.keyIngredients != null && p.keyIngredients!.isNotEmpty) ...[
                    const Text('Composition', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600)),
                    const SizedBox(height: 6),
                    Text(
                      p.keyIngredients!,
                      style: TextStyle(fontSize: 14, color: Colors.grey.shade600, height: 1.5),
                    ),
                    const SizedBox(height: 16),
                  ],

                  // Details
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(color: Colors.grey.shade50, borderRadius: BorderRadius.circular(12)),
                    child: Column(
                      children: [
                        if (p.packSize != null) _detailRow('Pack Size', p.packSize!),
                        if (p.productForm != null) _detailRow('Form', p.productForm!),
                        _detailRow('Stock', 'In Stock', valueColor: Colors.green.shade600),
                      ],
                    ),
                  ),
                  if (p.documents.isNotEmpty) ...[
                    const SizedBox(height: 20),
                    const Text('Documents', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600)),
                    const SizedBox(height: 10),
                    for (final doc in p.documents)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 8),
                        child: InkWell(
                          onTap: () => _openDocument(doc.fileUrl),
                          borderRadius: BorderRadius.circular(10),
                          child: Container(
                            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                            decoration: BoxDecoration(
                              border: Border.all(color: Colors.grey.shade200),
                              borderRadius: BorderRadius.circular(10),
                            ),
                            child: Row(
                              children: [
                                Icon(Icons.picture_as_pdf_outlined, color: Colors.grey.shade500, size: 20),
                                const SizedBox(width: 10),
                                Expanded(
                                  child: Text(doc.name, style: const TextStyle(fontSize: 13.5, color: Color(0xFF1A1A1A)), maxLines: 1, overflow: TextOverflow.ellipsis),
                                ),
                                _downloadingDocs.contains(doc.fileUrl)
                                    ? const SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2))
                                    : Text('View', style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: Colors.red.shade600)),
                              ],
                            ),
                          ),
                        ),
                      ),
                  ],
                  const SizedBox(height: 100),
                ],
              ),
            ),
          ),
        ],
      )),

      // Add to cart button
      bottomNavigationBar: Container(
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 28),
        decoration: BoxDecoration(
          color: Colors.white,
          boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.08), blurRadius: 16, offset: const Offset(0, -4))],
        ),
        child: SizedBox(
          height: 52,
          child: ElevatedButton(
            onPressed: () {
              ref.read(cartProvider.notifier).add(p);
              ScaffoldMessenger.of(context).showSnackBar(
                SnackBar(content: Text('${p.name} added to cart'), backgroundColor: const Color(0xFF00A6A4), behavior: SnackBarBehavior.floating),
              );
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: inCart ? const Color(0xFF00A6A4).withValues(alpha: 0.8) : const Color(0xFF00A6A4),
              foregroundColor: Colors.white,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              elevation: 0,
            ),
            child: Text(inCart ? 'Add More' : 'Add to Cart', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
          ),
        ),
      ),
    );
  }

  // Downloads the document into the on-device cache then opens it with the
  // system's PDF viewer — same pattern as the regular product detail screen.
  Future<void> _openDocument(String url) async {
    if (url.isEmpty || _downloadingDocs.contains(url)) return;
    setState(() => _downloadingDocs.add(url));
    try {
      final file = await DefaultCacheManager().getSingleFile(url);
      final result = await OpenFilex.open(file.path);
      if (result.type != ResultType.done && mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(result.message.isNotEmpty ? result.message : 'Could not open document')),
        );
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Could not open document — check your connection')),
        );
      }
    } finally {
      if (mounted) setState(() => _downloadingDocs.remove(url));
    }
  }

  Widget _detailRow(String label, String value, {Color? valueColor}) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 4),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(label, style: TextStyle(fontSize: 13, color: Colors.grey.shade600)),
            Text(value, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w500, color: valueColor)),
          ],
        ),
      );
}
