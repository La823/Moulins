import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../models/product.dart';
import '../../providers/cart_provider.dart';
import '../../providers/favorites_provider.dart';
import '../../services/favorite_service.dart';
import '../../services/product_service.dart';
import '../../widgets/product_card.dart';
import '../../utils/responsive.dart';
import '../../widgets/app_drawer.dart';

class FavoritesScreen extends ConsumerStatefulWidget {
  const FavoritesScreen({super.key});

  @override
  ConsumerState<FavoritesScreen> createState() => _FavoritesScreenState();
}

class _FavoritesScreenState extends ConsumerState<FavoritesScreen> {
  static const teal = Color(0xFF00A6A4);
  final _searchCtrl = TextEditingController();

  List<Product> _favorites = [];
  bool _loading = true;
  bool _offline = false;

  List<Product> _searchResults = [];
  bool _searching = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final favs = await FavoriteService().getFavorites();
      setState(() { _favorites = favs; _offline = false; _loading = false; });
    } catch (_) {
      setState(() { _favorites = []; _offline = true; _loading = false; });
    }
  }

  Future<void> _onSearch(String query) async {
    if (query.trim().isEmpty) {
      setState(() => _searchResults = []);
      return;
    }
    setState(() => _searching = true);
    try {
      final res = await ProductService().getProducts(search: query);
      setState(() { _searchResults = res.products; _searching = false; });
    } catch (_) {
      setState(() { _searchResults = []; _searching = false; });
    }
  }

  Future<void> _toggle(Product product) async {
    await ref.read(favoritesProvider.notifier).toggle(product);
    _load();
  }

  @override
  Widget build(BuildContext context) {
    final favoriteIds = ref.watch(favoritesProvider);
    final isSearching = _searchCtrl.text.trim().isNotEmpty;

    return Scaffold(
      backgroundColor: Colors.white,
      drawer: const AppDrawer(),
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        title: const Text('My Favorites', style: TextStyle(color: Color(0xFF1A1A1A), fontWeight: FontWeight.w600)),
        actions: [
          Stack(
            children: [
              IconButton(
                icon: const Icon(Icons.shopping_bag_outlined, color: Color(0xFF1A1A1A)),
                onPressed: () => context.push('/cart'),
              ),
              if (ref.watch(cartProvider).isNotEmpty)
                Positioned(
                  right: 8, top: 8,
                  child: Container(
                    width: 16, height: 16,
                    decoration: const BoxDecoration(color: teal, shape: BoxShape.circle),
                    child: Center(
                      child: Text('${ref.watch(cartProvider).length}', style: const TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.bold)),
                    ),
                  ),
                ),
            ],
          ),
          const SizedBox(width: 4),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
            child: TextField(
              controller: _searchCtrl,
              onChanged: (v) { setState(() {}); _onSearch(v); },
              decoration: InputDecoration(
                hintText: 'Search products to add...',
                prefixIcon: const Icon(Icons.search, color: Colors.grey),
                filled: true,
                fillColor: Colors.grey.shade50,
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: Colors.grey.shade200)),
                enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: Colors.grey.shade200)),
                focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: teal)),
                contentPadding: const EdgeInsets.symmetric(vertical: 0),
              ),
            ),
          ),

          if (_offline && !isSearching)
            Container(
              margin: const EdgeInsets.fromLTRB(16, 10, 16, 0),
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(color: Colors.orange.shade50, borderRadius: BorderRadius.circular(8)),
              child: Row(
                children: [
                  Icon(Icons.cloud_off, size: 14, color: Colors.orange.shade700),
                  const SizedBox(width: 6),
                  Text('Offline — showing saved favorites', style: TextStyle(fontSize: 12, color: Colors.orange.shade700)),
                ],
              ),
            ),

          Expanded(
            child: isSearching
                ? _searching
                    ? const Center(child: CircularProgressIndicator(color: teal))
                    : _searchResults.isEmpty
                        ? const Center(child: Text('No products found', style: TextStyle(color: Colors.grey)))
                        : ListView.builder(
                            padding: const EdgeInsets.all(16),
                            itemCount: _searchResults.length,
                            itemBuilder: (ctx, i) {
                              final p = _searchResults[i];
                              final isFav = favoriteIds.contains(p.id);
                              return Container(
                                margin: const EdgeInsets.only(bottom: 8),
                                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                                decoration: BoxDecoration(border: Border.all(color: Colors.grey.shade200), borderRadius: BorderRadius.circular(10)),
                                child: Row(
                                  children: [
                                    Expanded(
                                      child: Text(p.name, style: const TextStyle(fontWeight: FontWeight.w500, fontSize: 14)),
                                    ),
                                    IconButton(
                                      icon: Icon(isFav ? Icons.star : Icons.star_border, color: isFav ? const Color(0xFFF5A623) : Colors.grey),
                                      onPressed: () => _toggle(p),
                                    ),
                                  ],
                                ),
                              );
                            },
                          )
                : _loading
                    ? const Center(child: CircularProgressIndicator(color: teal))
                    : _favorites.isEmpty
                        ? Center(
                            child: Column(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Icon(Icons.star_border, size: 48, color: Colors.grey.shade300),
                                const SizedBox(height: 12),
                                Text('No favorites yet', style: TextStyle(color: Colors.grey.shade500)),
                                const SizedBox(height: 4),
                                Text('Search above or star a product to add it', style: TextStyle(color: Colors.grey.shade400, fontSize: 12)),
                              ],
                            ),
                          )
                        : GridView.builder(
                            padding: const EdgeInsets.all(16),
                            gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                              crossAxisCount: responsiveGridColumns(context),
                              childAspectRatio: 0.72,
                              crossAxisSpacing: 12,
                              mainAxisSpacing: 12,
                            ),
                            itemCount: _favorites.length,
                            itemBuilder: (ctx, i) => ProductCard(
                              product: _favorites[i],
                              onTap: () => context.push('/products/${_favorites[i].id}'),
                              onAddToCart: () => ref.read(cartProvider.notifier).add(_favorites[i]),
                            ),
                          ),
          ),
        ],
      ),
    );
  }
}
