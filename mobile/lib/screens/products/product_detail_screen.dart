import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter_cache_manager/flutter_cache_manager.dart';
import 'package:open_filex/open_filex.dart';
import 'package:go_router/go_router.dart';
import 'package:audioplayers/audioplayers.dart';
import '../../models/product.dart';
import '../../providers/cart_provider.dart';
import '../../providers/favorites_provider.dart';
import '../../services/product_service.dart';
import '../../services/learning_service.dart';
import '../../models/learning.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../utils/responsive.dart';
import '../../widgets/product_card.dart';
import '../../data/divisions.dart';

// Falls back to the filtered products list for any category that isn't one
// of the 12 dedicated divisions.
String _divisionRouteForCategory(String category) {
  for (final d in kDivisions) {
    if (d.category == category) return d.route;
  }
  return '/products?category=${Uri.encodeComponent(category)}';
}

class ProductDetailScreen extends ConsumerStatefulWidget {
  final String productId;
  const ProductDetailScreen({super.key, required this.productId});

  @override
  ConsumerState<ProductDetailScreen> createState() => _ProductDetailScreenState();
}

class _ProductDetailScreenState extends ConsumerState<ProductDetailScreen> {
  Product? _product;
  bool _loading = true;
  int _selectedImage = 0;
  final _imagePageCtrl = PageController();
  final Set<String> _downloadingDocs = {};
  bool _downloadingImage = false;
  List<LearningVideo> _videos = [];
  List<Product> _recentlyViewed = [];
  List<Product> _sameCategory = [];
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
    LearningService().getVideos(productId: widget.productId).then((v) {
      if (mounted) setState(() => _videos = v);
    }).catchError((_) {});
    ProductService().recordView(widget.productId).whenComplete(() {
      ProductService().getRecentlyViewed().then((list) {
        if (mounted) {
          setState(() => _recentlyViewed = list.where((p) => p.id != widget.productId).toList());
        }
      });
    });
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
      final p = await ProductService().getProduct(widget.productId);
      setState(() { _product = p; _loading = false; });
      if (p.categories.isNotEmpty) {
        ProductService().getProducts(category: p.categories.first, limit: 13).then((res) {
          if (mounted) {
            setState(() => _sameCategory = res.products.where((sp) => sp.id != widget.productId).take(12).toList());
          }
        }).catchError((_) {});
      }
    } catch (_) {
      setState(() => _loading = false);
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
                const SizedBox(height: 6),
                Text(
                  'This product hasn\'t been viewed on this device yet, so it can\'t be shown offline.',
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 13, color: Colors.grey.shade500),
                ),
              ],
            ),
          ),
        ),
      );
    }

    final p = _product!;
    final cart = ref.watch(cartProvider);
    final inCart = cart.any((e) => e.product.id == p.id);

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
            actions: [
              if (p.images.isNotEmpty)
                _downloadingImage
                    ? const Padding(
                        padding: EdgeInsets.all(14),
                        child: SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Color(0xFF00A6A4))),
                      )
                    : IconButton(
                        icon: Icon(Icons.download_outlined, color: Colors.grey.shade600),
                        onPressed: () => _downloadImage(p.images[_selectedImage].id),
                        tooltip: 'Download image',
                      ),
              IconButton(
                icon: Icon(
                  ref.watch(favoritesProvider).contains(p.id) ? Icons.star : Icons.star_border,
                  color: ref.watch(favoritesProvider).contains(p.id) ? const Color(0xFFF5A623) : Colors.grey.shade600,
                ),
                onPressed: () => ref.read(favoritesProvider.notifier).toggle(p),
                tooltip: 'Favorite',
              ),
              const SizedBox(width: 4),
            ],
            flexibleSpace: FlexibleSpaceBar(
              background: Padding(
                padding: EdgeInsets.only(top: MediaQuery.of(context).padding.top + kToolbarHeight + (isWide(context) ? 24 : 12)),
                child: p.images.isEmpty
                  ? Container(color: Colors.grey.shade100, child: const Icon(Icons.medication_outlined, size: 80, color: Colors.grey))
                  : Stack(
                      children: [
                        PageView.builder(
                          controller: _imagePageCtrl,
                          itemCount: p.images.length,
                          onPageChanged: (i) => setState(() => _selectedImage = i),
                          itemBuilder: (context, i) => GestureDetector(
                            onTap: () async {
                              final lastViewed = await context.push<int>('/gallery', extra: {
                                'imageUrls': p.images.map((img) => img.imageUrl).toList(),
                                'initialIndex': _selectedImage,
                              });
                              if (lastViewed != null && mounted) {
                                setState(() => _selectedImage = lastViewed);
                                _imagePageCtrl.jumpToPage(lastViewed);
                              }
                            },
                            child: CachedNetworkImage(
                              imageUrl: p.images[i].imageUrl,
                              fit: BoxFit.cover,
                              width: double.infinity,
                              placeholder: (_, __) => Container(color: Colors.grey.shade100),
                              errorWidget: (_, __, ___) => Container(color: Colors.grey.shade100, child: const Icon(Icons.medication_outlined, size: 60, color: Colors.grey)),
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
                        if (p.images.length > 1)
                          Positioned(
                            bottom: 12,
                            left: 0, right: 0,
                            child: Row(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: p.images.asMap().entries.map((e) => GestureDetector(
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
                  // Categories
                  if (p.categories.isNotEmpty)
                    Wrap(
                      spacing: 6,
                      children: p.categories.map((cat) => Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                        decoration: BoxDecoration(
                          color: const Color(0xFF00A6A4).withValues(alpha: 0.1),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Text(cat, style: const TextStyle(fontSize: 11, color: Color(0xFF00A6A4), fontWeight: FontWeight.w500)),
                      )).toList(),
                    ),
                  if (p.tags.isNotEmpty) ...[
                    const SizedBox(height: 6),
                    Wrap(
                      spacing: 6,
                      children: p.tags.map((tag) => Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                        decoration: BoxDecoration(
                          color: Colors.grey.shade200,
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Text(tag, style: TextStyle(fontSize: 11, color: Colors.grey.shade700, fontWeight: FontWeight.w500)),
                      )).toList(),
                    ),
                  ],
                  const SizedBox(height: 12),

                  Text(p.name, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold, color: Color(0xFF1A1A1A))),
                  const SizedBox(height: 8),

                  Text(
                    'MRP Rs. ${(p.mrp ?? p.price).toStringAsFixed(2)}',
                    style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w700, color: Color(0xFF00A6A4)),
                  ),
                  const SizedBox(height: 16),

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
                  if (_videos.isNotEmpty) ...[
                    const SizedBox(height: 20),
                    const Text('Related Videos', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600)),
                    const SizedBox(height: 10),
                    GridView.builder(
                      shrinkWrap: true,
                      physics: const NeverScrollableScrollPhysics(),
                      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                        crossAxisCount: 2,
                        crossAxisSpacing: 10,
                        mainAxisSpacing: 10,
                        childAspectRatio: 1.4,
                      ),
                      itemCount: _videos.length,
                      itemBuilder: (context, i) {
                        final v = _videos[i];
                        return GestureDetector(
                          onTap: () => launchUrl(Uri.parse(v.youtubeUrl), mode: LaunchMode.externalApplication),
                          child: ClipRRect(
                            borderRadius: BorderRadius.circular(10),
                            child: Stack(
                              children: [
                                SizedBox.expand(
                                  child: CachedNetworkImage(
                                    imageUrl: v.thumbnailUrl,
                                    fit: BoxFit.cover,
                                    placeholder: (_, __) => Container(color: Colors.grey.shade100),
                                    errorWidget: (_, __, ___) => Container(color: Colors.grey.shade100),
                                  ),
                                ),
                                const Positioned.fill(
                                  child: Center(
                                    child: Icon(Icons.play_circle_fill, color: Colors.white, size: 32, shadows: [Shadow(color: Colors.black45, blurRadius: 8)]),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        );
                      },
                    ),
                  ],
                  const SizedBox(height: 100),
                ],
              ),
            ),
          ),
          if (_recentlyViewed.isNotEmpty) ...[
            SliverToBoxAdapter(child: Container(height: 1, color: Colors.grey.shade300, margin: const EdgeInsets.only(bottom: 16))),
            SliverToBoxAdapter(child: _ProductRow(title: 'Recently Viewed', products: _recentlyViewed)),
          ],
          if (_sameCategory.isNotEmpty)
            SliverToBoxAdapter(
              child: _ProductRow(
                title: 'Explore more in "${p.categories.first}"',
                products: _sameCategory,
                onTitleTap: () => context.push(_divisionRouteForCategory(p.categories.first)),
              ),
            ),
          const SliverToBoxAdapter(child: _ExplorePortfolioGrid()),
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

  // Downloads the document into the on-device cache (flutter_cache_manager
  // dedupes by URL and skips the network entirely once cached), then opens
  // the local file with the system's PDF viewer — this works offline for
  // any document already viewed once while online.
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

  // Fetches the login-gated, short-lived download URL then opens it with the
  // system viewer (same cache-then-open pattern as _openDocument) — from
  // there the user can save to gallery / share, since no gallery-saver
  // package is installed.
  Future<void> _downloadImage(String imageId) async {
    if (_downloadingImage) return;
    setState(() => _downloadingImage = true);
    try {
      final downloadUrl = await ProductService().getImageDownloadUrl(imageId);
      final file = await DefaultCacheManager().getSingleFile(downloadUrl);
      final result = await OpenFilex.open(file.path);
      if (result.type != ResultType.done && mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(result.message.isNotEmpty ? result.message : 'Could not open image')),
        );
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Could not download image — check your connection')),
        );
      }
    } finally {
      if (mounted) setState(() => _downloadingImage = false);
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

class _ProductRow extends ConsumerWidget {
  final String title;
  final List<Product> products;
  final VoidCallback? onTitleTap;

  const _ProductRow({required this.title, required this.products, this.onTitleTap});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Container(
      margin: const EdgeInsets.fromLTRB(20, 0, 20, 16),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.grey.shade200,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          GestureDetector(
            onTap: onTitleTap,
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Flexible(
                  child: Text(
                    title,
                    style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: onTitleTap != null ? const Color(0xFF00A6A4) : const Color(0xFF1A1A1A)),
                  ),
                ),
                if (onTitleTap != null) ...[
                  const SizedBox(width: 4),
                  const Icon(Icons.arrow_forward, size: 15, color: Color(0xFF00A6A4)),
                ],
              ],
            ),
          ),
          const SizedBox(height: 10),
          SizedBox(
            height: 240,
            child: ScrollConfiguration(
              behavior: ScrollConfiguration.of(context).copyWith(scrollbars: false),
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                itemCount: products.length,
                separatorBuilder: (_, __) => const SizedBox(width: 12),
                itemBuilder: (context, i) {
                  final rp = products[i];
                  return SizedBox(
                    width: 160,
                    child: ProductCard(
                      product: rp,
                      onTap: () => context.push('/products/${rp.id}'),
                      onAddToCart: () => ref.read(cartProvider.notifier).add(rp),
                    ),
                  );
                },
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// "Explore Our Portfolio" — 3x4 grid of all 12 divisions, matching the web
// product detail page: fixed height (~1/5-ish of screen height, scaled down
// a bit further for 3 columns), full width cover-cropped image, bottom-left
// label + desc overlay, white background, no rounded corners.
class _ExplorePortfolioGrid extends StatelessWidget {
  const _ExplorePortfolioGrid();

  @override
  Widget build(BuildContext context) {
    final tileHeight = MediaQuery.of(context).size.height * 0.15;
    return Container(
      color: Colors.white,
      padding: const EdgeInsets.fromLTRB(20, 24, 20, 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Explore Our Portfolio', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
          const SizedBox(height: 12),
          GridView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            itemCount: kDivisions.length,
            gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 3,
              mainAxisSpacing: 8,
              crossAxisSpacing: 8,
              childAspectRatio: (MediaQuery.of(context).size.width / 3 - 6) / tileHeight,
            ),
            itemBuilder: (context, i) {
              final d = kDivisions[i];
              return GestureDetector(
                onTap: () => context.push(d.route),
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    Image.asset(
                      d.heroImage,
                      fit: BoxFit.cover,
                      errorBuilder: (_, __, ___) => Container(color: Colors.grey.shade200),
                    ),
                    Container(color: Colors.black.withValues(alpha: 0.35)),
                    Positioned(
                      left: 8,
                      bottom: 8,
                      right: 8,
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(
                            d.heroLabel,
                            style: const TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w700),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                          if (d.heroTitle.isNotEmpty)
                            Text(
                              d.heroTitle.toUpperCase(),
                              style: TextStyle(color: Colors.white.withValues(alpha: 0.7), fontSize: 8, fontWeight: FontWeight.w600, letterSpacing: 0.5),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                        ],
                      ),
                    ),
                  ],
                ),
              );
            },
          ),
        ],
      ),
    );
  }
}
