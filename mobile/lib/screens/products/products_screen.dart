import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../models/product.dart';
import '../../providers/cart_provider.dart';
import '../../services/product_service.dart';
import '../../widgets/notification_bell_button.dart';
import '../../widgets/product_card.dart';
import '../../widgets/profile_button.dart';

final _productService = ProductService();

final categoriesProvider = FutureProvider<List<String>>((ref) async {
  return _productService.getCategories();
});

class ProductsScreen extends ConsumerStatefulWidget {
  const ProductsScreen({super.key});

  @override
  ConsumerState<ProductsScreen> createState() => _ProductsScreenState();
}

class _ProductsScreenState extends ConsumerState<ProductsScreen> {
  final _searchCtrl = TextEditingController();
  String _search = '';
  String _category = '';
  int _page = 1;
  bool _loading = false;
  bool _hasMore = true;
  final List<Product> _products = [];
  final _scrollCtrl = ScrollController();

  @override
  void initState() {
    super.initState();
    _load();
    _scrollCtrl.addListener(() {
      if (_scrollCtrl.position.pixels >= _scrollCtrl.position.maxScrollExtent - 200) {
        _loadMore();
      }
    });
  }

  @override
  void dispose() {
    _searchCtrl.dispose();
    _scrollCtrl.dispose();
    super.dispose();
  }

  Future<void> _load({bool reset = false}) async {
    if (_loading) return;
    if (reset) {
      _page = 1;
      _hasMore = true;
      _products.clear();
    }
    setState(() => _loading = true);
    try {
      final res = await _productService.getProducts(
        page: _page,
        search: _search,
        category: _category,
      );
      setState(() {
        _products.addAll(res.products);
        _hasMore = _page < res.totalPages;
        _loading = false;
      });
    } catch (_) {
      setState(() => _loading = false);
    }
  }

  void _loadMore() {
    if (!_hasMore || _loading) return;
    _page++;
    _load();
  }

  void _onSearch(String val) {
    setState(() => _search = val);
    _load(reset: true);
  }

  void _onCategory(String cat) {
    setState(() => _category = _category == cat ? '' : cat);
    _load(reset: true);
  }

  @override
  Widget build(BuildContext context) {
    final categories = ref.watch(categoriesProvider);
    final cart = ref.watch(cartProvider);

    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        title: const Text('Products', style: TextStyle(color: Color(0xFF1A1A1A), fontWeight: FontWeight.w600)),
        actions: [
          Stack(
            children: [
              IconButton(
                icon: const Icon(Icons.shopping_bag_outlined, color: Color(0xFF1A1A1A)),
                onPressed: () => context.push('/cart'),
              ),
              if (cart.isNotEmpty)
                Positioned(
                  right: 8, top: 8,
                  child: Container(
                    width: 16, height: 16,
                    decoration: const BoxDecoration(color: Color(0xFF00A6A4), shape: BoxShape.circle),
                    child: Center(
                      child: Text('${cart.length}', style: const TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.bold)),
                    ),
                  ),
                ),
            ],
          ),
          const NotificationBellButton(),
          const ProfileButton(),
          const SizedBox(width: 4),
        ],
      ),
      body: Column(
        children: [
          // Search bar
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
            child: TextField(
              controller: _searchCtrl,
              onChanged: _onSearch,
              decoration: InputDecoration(
                hintText: 'Search products...',
                prefixIcon: const Icon(Icons.search, color: Colors.grey),
                filled: true,
                fillColor: Colors.grey.shade50,
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: Colors.grey.shade200)),
                enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: Colors.grey.shade200)),
                focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: Color(0xFF00A6A4))),
                contentPadding: const EdgeInsets.symmetric(vertical: 0),
              ),
            ),
          ),

          // Categories
          categories.when(
            data: (cats) => SizedBox(
              height: 44,
              child: ListView(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
                children: cats.map((cat) {
                  final selected = _category == cat;
                  return Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: GestureDetector(
                      onTap: () => _onCategory(cat),
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                        decoration: BoxDecoration(
                          color: selected ? const Color(0xFF00A6A4) : Colors.grey.shade100,
                          borderRadius: BorderRadius.circular(20),
                        ),
                        child: Text(cat, style: TextStyle(fontSize: 13, color: selected ? Colors.white : Colors.grey.shade700, fontWeight: selected ? FontWeight.w600 : FontWeight.normal)),
                      ),
                    ),
                  );
                }).toList(),
              ),
            ),
            loading: () => const SizedBox(height: 44),
            error: (_, __) => const SizedBox(height: 44),
          ),

          // Product grid
          Expanded(
            child: _products.isEmpty && _loading
                ? const Center(child: CircularProgressIndicator(color: Color(0xFF00A6A4)))
                : _products.isEmpty
                    ? const Center(child: Text('No products found', style: TextStyle(color: Colors.grey)))
                    : GridView.builder(
                        controller: _scrollCtrl,
                        padding: const EdgeInsets.all(16),
                        gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                          crossAxisCount: 2,
                          childAspectRatio: 0.72,
                          crossAxisSpacing: 12,
                          mainAxisSpacing: 12,
                        ),
                        itemCount: _products.length + (_hasMore ? 1 : 0),
                        itemBuilder: (ctx, i) {
                          if (i >= _products.length) {
                            return const Center(child: CircularProgressIndicator(color: Color(0xFF00A6A4)));
                          }
                          return ProductCard(
                            product: _products[i],
                            onTap: () => context.push('/products/${_products[i].id}'),
                            onAddToCart: () => ref.read(cartProvider.notifier).add(_products[i]),
                          );
                        },
                      ),
          ),
        ],
      ),
    );
  }
}
