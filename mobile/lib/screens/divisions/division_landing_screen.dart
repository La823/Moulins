import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../models/product.dart';
import '../../providers/cart_provider.dart';
import '../../services/product_service.dart';
import '../../widgets/notification_bell_button.dart';
import '../../widgets/chat_button.dart';
import '../../widgets/product_card.dart';
import '../../widgets/product_list_row.dart';
import '../../widgets/product_view_toggle.dart';
import '../../widgets/profile_button.dart';
import '../../utils/responsive.dart';

final _productService = ProductService();

/// Mirrors the website's `CategoryLandingPage`: a hero banner for the
/// division, then its products pre-filtered by category — one reusable
/// screen shared by all 12 divisions instead of 12 near-identical ones.
class DivisionLandingScreen extends ConsumerStatefulWidget {
  final String heroLabel;
  final String heroTitle;
  final String heroImage;
  final String category;
  /// Filtering keys off this rather than [category]: a uuid survives the
  /// category being renamed, a name does not.
  final String categoryId;

  const DivisionLandingScreen({
    super.key,
    required this.heroLabel,
    required this.heroTitle,
    required this.heroImage,
    required this.category,
    required this.categoryId,
  });

  @override
  ConsumerState<DivisionLandingScreen> createState() => _DivisionLandingScreenState();
}

class _DivisionLandingScreenState extends ConsumerState<DivisionLandingScreen> {
  final List<Product> _products = [];
  bool _loading = true;
  bool _listView = false;
  // The backend returns at most 100 products a request and a division can
  // have more (Matrix has 250+), so further pages load as you near the end.
  int _page = 1;
  bool _hasMore = false;
  bool _loadingMore = false;
  final _scrollCtrl = ScrollController();

  @override
  void initState() {
    super.initState();
    loadListView().then((list) {
      if (mounted && list) setState(() => _listView = true);
    });
    _load();
    _scrollCtrl.addListener(() {
      if (_scrollCtrl.position.pixels >= _scrollCtrl.position.maxScrollExtent - 400) _loadMore();
    });
  }

  @override
  void dispose() {
    _scrollCtrl.dispose();
    super.dispose();
  }

  void _setListView(bool list) {
    setState(() => _listView = list);
    saveListView(list);
  }

  Future<void> _load() async {
    try {
      final res = await _productService.getProducts(categoryId: widget.categoryId, page: _page, limit: 100);
      if (mounted) {
        setState(() {
          _products.addAll(res.products);
          _hasMore = _page < res.totalPages;
          _loading = false;
          _loadingMore = false;
        });
      }
    } catch (_) {
      // a failed further page can be retried by scrolling again
      if (mounted) {
        setState(() {
          if (_loadingMore) _page--;
          _loading = false;
          _loadingMore = false;
        });
      }
    }
  }

  void _loadMore() {
    if (!_hasMore || _loading || _loadingMore) return;
    _loadingMore = true;
    _page++;
    _load();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        actions: const [ChatButton(), NotificationBellButton(), ProfileButton(), SizedBox(width: 4)],
      ),
      body: CustomScrollView(
        controller: _scrollCtrl,
        slivers: [
          SliverToBoxAdapter(
            child: Stack(
              children: [
                // Full width, height follows the image's own aspect ratio —
                // nothing gets cropped, unlike a fixed-height cover crop.
                Image.asset(widget.heroImage, width: double.infinity, fit: BoxFit.fitWidth),
                Positioned.fill(
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment.bottomCenter,
                        end: Alignment.topCenter,
                        colors: [
                          Colors.black.withValues(alpha: 0.75),
                          Colors.black.withValues(alpha: 0.3),
                          Colors.black.withValues(alpha: 0.05),
                        ],
                      ),
                    ),
                  ),
                ),
                Positioned(
                  left: 20,
                  right: 20,
                  bottom: 20,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        widget.heroLabel,
                        style: const TextStyle(color: Colors.white, fontSize: 28, height: 1.1),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        widget.heroTitle.toUpperCase(),
                        style: TextStyle(
                          color: Colors.white.withValues(alpha: 0.7),
                          fontSize: 11,
                          letterSpacing: 2,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          // Grid / list toggle
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
              child: Align(
                alignment: Alignment.centerRight,
                child: ProductViewToggle(listView: _listView, onChanged: _setListView),
              ),
            ),
          ),
          if (_listView && !_loading && _products.isNotEmpty) ...[
            if (isWide(context))
              const SliverToBoxAdapter(
                child: Padding(padding: EdgeInsets.only(top: 12), child: ProductListHeader()),
              ),
            SliverPadding(
              padding: EdgeInsets.only(top: isWide(context) ? 0 : 8, bottom: 16),
              sliver: SliverList(
                delegate: SliverChildBuilderDelegate(
                  (context, i) => ProductListRow(
                    product: _products[i],
                    wide: isWide(context),
                    onTap: () => context.push('/products/${_products[i].id}'),
                  ),
                  childCount: _products.length,
                ),
              ),
            ),
          ] else
          SliverPadding(
            padding: const EdgeInsets.all(16),
            sliver: _loading
                ? const SliverToBoxAdapter(
                    child: Padding(
                      padding: EdgeInsets.symmetric(vertical: 60),
                      child: Center(child: CircularProgressIndicator(color: Color(0xFF00A6A4))),
                    ),
                  )
                : _products.isEmpty
                    ? const SliverToBoxAdapter(
                        child: Padding(
                          padding: EdgeInsets.symmetric(vertical: 60),
                          child: Center(
                            child: Text('No products found in this category yet', style: TextStyle(color: Colors.grey)),
                          ),
                        ),
                      )
                    : SliverGrid(
                        gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                          crossAxisCount: responsiveGridColumns(context),
                          childAspectRatio: 0.72,
                          crossAxisSpacing: 12,
                          mainAxisSpacing: 12,
                        ),
                        delegate: SliverChildBuilderDelegate(
                          (context, i) => ProductCard(
                            product: _products[i],
                            onTap: () => context.push('/products/${_products[i].id}'),
                            onAddToCart: () => ref.read(cartProvider.notifier).add(_products[i]),
                          ),
                          childCount: _products.length,
                        ),
                      ),
          ),
          if (_hasMore)
            const SliverToBoxAdapter(
              child: Padding(
                padding: EdgeInsets.only(bottom: 24),
                child: Center(child: CircularProgressIndicator(color: Color(0xFF00A6A4))),
              ),
            ),
        ],
      ),
    );
  }
}
