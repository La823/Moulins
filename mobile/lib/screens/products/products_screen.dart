import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../models/product.dart';
import '../../providers/cart_provider.dart';
import '../../services/product_service.dart';
import '../../widgets/notification_bell_button.dart';
import '../../widgets/chat_button.dart';
import '../../widgets/product_card.dart';
import '../../widgets/profile_button.dart';
import '../../utils/responsive.dart';
import '../../widgets/app_drawer.dart';
import '../../data/divisions.dart';
import '../../providers/auth_provider.dart';

const _filterRed = Color(0xFFAC2528);

final _productService = ProductService();

final categoriesProvider = FutureProvider<List<String>>((ref) async {
  return _productService.getCategories();
});

final formsProvider = FutureProvider<List<String>>((ref) async {
  return _productService.getForms();
});

class ProductsScreen extends ConsumerStatefulWidget {
  final String? initialCategory;
  final String? initialTag;
  const ProductsScreen({super.key, this.initialCategory, this.initialTag});

  @override
  ConsumerState<ProductsScreen> createState() => _ProductsScreenState();
}

class _ProductsScreenState extends ConsumerState<ProductsScreen> {
  final _searchCtrl = TextEditingController();
  String _search = '';
  String _category = '';
  String _form = '';
  String _tag = '';
  int _page = 1;
  bool _loading = false;
  bool _hasMore = true;
  bool _offline = false;
  List<String> _spellingSuggestions = [];
  final List<Product> _products = [];
  final _scrollCtrl = ScrollController();
  final _searchFocus = FocusNode();

  // Lightweight top-5 suggestions as you type — doesn't touch the full grid
  // until a search is actually submitted (matches the website's behavior).
  Timer? _suggestDebounce;
  List<Product> _liveSuggestions = [];
  List<String> _liveSpellingSuggestions = [];
  bool _showDropdown = false;
  bool _saltOnly = false;

  @override
  void initState() {
    super.initState();
    _category = widget.initialCategory ?? '';
    _tag = widget.initialTag ?? '';
    _load();
    _scrollCtrl.addListener(() {
      if (_scrollCtrl.position.pixels >=
          _scrollCtrl.position.maxScrollExtent - 200) {
        _loadMore();
      }
    });
  }

  @override
  void dispose() {
    _searchCtrl.dispose();
    _scrollCtrl.dispose();
    _searchFocus.dispose();
    _suggestDebounce?.cancel();
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
        form: _form,
        tag: _tag,
        saltOnly: _saltOnly,
      );
      setState(() {
        _products.addAll(res.products);
        _hasMore = _page < res.totalPages;
        _offline = res.isFromCache;
        _spellingSuggestions = res.suggestions;
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

  // Fires on every keystroke — debounced fetch of the top-5 dropdown
  // suggestions (products + "did you mean" salts) without touching the
  // full product grid, mirroring the website's search bar.
  void _onSearch(String val) {
    setState(() => _search = val);
    _suggestDebounce?.cancel();
    final q = val.trim();
    if (q.isEmpty) {
      setState(() {
        _showDropdown = false;
        _liveSuggestions = [];
        _liveSpellingSuggestions = [];
      });
      return;
    }
    _suggestDebounce = Timer(const Duration(milliseconds: 250), () async {
      try {
        final res = await _productService.getProducts(search: q, limit: 5);
        if (!mounted || _searchCtrl.text.trim() != q) return;
        setState(() {
          _liveSuggestions = res.products;
          _liveSpellingSuggestions = res.suggestions;
          _showDropdown = true;
        });
      } catch (_) {}
    });
  }

  void _runSearch(String val) {
    _suggestDebounce?.cancel();
    setState(() {
      _search = val;
      _saltOnly = false;
      _showDropdown = false;
    });
    _searchFocus.unfocus();
    _load(reset: true);
  }

  // Clicking a "did you mean" salt suggestion filters to products that
  // actually contain that salt (key_ingredients), not a loose name match.
  void _applySaltSuggestion(String suggestion) {
    _searchCtrl.text = suggestion;
    _suggestDebounce?.cancel();
    setState(() {
      _search = suggestion;
      _saltOnly = true;
      _showDropdown = false;
    });
    _searchFocus.unfocus();
    _load(reset: true);
  }

  void _onCategory(String cat) {
    setState(() => _category = _category == cat ? '' : cat);
    _load(reset: true);
  }

  void _onForm(String form) {
    setState(() => _form = form);
    _load(reset: true);
  }

  @override
  Widget build(BuildContext context) {
    final categories = ref.watch(categoriesProvider);
    final cart = ref.watch(cartProvider);
    final isSpecial = ref.watch(authProvider).user?.isSpecial ?? false;
    final canOrder = ref.watch(authProvider).user?.role != 'doctor';
    final isLandscape =
        MediaQuery.of(context).orientation == Orientation.landscape;

    return Scaffold(
      backgroundColor: Colors.white,
      drawer: const AppDrawer(),
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        title: const Text('Products',
            style: TextStyle(
                color: Color(0xFF1A1A1A), fontWeight: FontWeight.w600)),
        actions: [
          IconButton(
            icon: const Icon(Icons.star_border, color: Color(0xFF1A1A1A)),
            onPressed: () => context.push('/favorites'),
            tooltip: 'Favorites',
          ),
          if (canOrder)
            Stack(
              children: [
                IconButton(
                  icon: const Icon(Icons.shopping_bag_outlined,
                      color: Color(0xFF1A1A1A)),
                  onPressed: () => context.push('/cart'),
                ),
                if (cart.isNotEmpty)
                  Positioned(
                    right: 8,
                    top: 8,
                    child: Container(
                      width: 16,
                      height: 16,
                      decoration: const BoxDecoration(
                          color: Color(0xFF00A6A4), shape: BoxShape.circle),
                      child: Center(
                        child: Text('${cart.length}',
                            style: const TextStyle(
                                color: Colors.white,
                                fontSize: 10,
                                fontWeight: FontWeight.bold)),
                      ),
                    ),
                  ),
              ],
            ),
          const ChatButton(),
          const NotificationBellButton(),
          const ProfileButton(),
          const SizedBox(width: 4),
        ],
      ),
      // Search bar stays fixed above the scroll; everything else (filter grid,
      // product grid) lives in one CustomScrollView below it so the division
      // filter isn't a separate fixed-height scroll box — it just takes its
      // natural content height and scrolls away with the rest of the page.
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
            child: Stack(
              clipBehavior: Clip.none,
              children: [
                TextField(
                  controller: _searchCtrl,
                  focusNode: _searchFocus,
                  onChanged: _onSearch,
                  onSubmitted: _runSearch,
                  textInputAction: TextInputAction.search,
                  decoration: InputDecoration(
                    hintText: 'Search products...',
                    prefixIcon: const Icon(Icons.search, color: Colors.grey),
                    filled: true,
                    fillColor: Colors.grey.shade50,
                    border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                        borderSide: BorderSide(color: Colors.grey.shade200)),
                    enabledBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                        borderSide: BorderSide(color: Colors.grey.shade200)),
                    focusedBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                        borderSide: const BorderSide(color: Color(0xFF00A6A4))),
                    contentPadding: const EdgeInsets.symmetric(vertical: 0),
                  ),
                ),
                if (_showDropdown)
                  Positioned(
                    left: 0,
                    right: 0,
                    top: 52,
                    child: Material(
                      elevation: 6,
                      borderRadius: BorderRadius.circular(12),
                      child: ConstrainedBox(
                        constraints: const BoxConstraints(maxHeight: 360),
                        child: SingleChildScrollView(
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              if (_liveSuggestions.isEmpty) ...[
                                const Padding(
                                  padding: EdgeInsets.symmetric(
                                      horizontal: 16, vertical: 14),
                                  child: Text('No matches found',
                                      style: TextStyle(
                                          fontSize: 13, color: Colors.grey)),
                                ),
                              ] else ...[
                                if (_liveSpellingSuggestions.isNotEmpty)
                                  Padding(
                                    padding: const EdgeInsets.symmetric(
                                        horizontal: 16, vertical: 10),
                                    child: Wrap(
                                      crossAxisAlignment:
                                          WrapCrossAlignment.center,
                                      children: [
                                        const Text('Did you mean ',
                                            style: TextStyle(
                                                fontSize: 12,
                                                color: Colors.grey)),
                                        for (var i = 0;
                                            i < _liveSpellingSuggestions.length;
                                            i++)
                                          GestureDetector(
                                            onTap: () => _applySaltSuggestion(
                                                _liveSpellingSuggestions[i]),
                                            child: Text(
                                              '${_liveSpellingSuggestions[i]}${i < _liveSpellingSuggestions.length - 1 ? ", " : ""}',
                                              style: const TextStyle(
                                                fontSize: 12,
                                                color: Color(0xFF00A6A4),
                                                fontWeight: FontWeight.w600,
                                                decoration:
                                                    TextDecoration.underline,
                                              ),
                                            ),
                                          ),
                                        const Text('?',
                                            style: TextStyle(
                                                fontSize: 12,
                                                color: Colors.grey)),
                                      ],
                                    ),
                                  ),
                                for (final p in _liveSuggestions)
                                  InkWell(
                                    onTap: () {
                                      _searchFocus.unfocus();
                                      setState(() => _showDropdown = false);
                                      context.push('/products/${p.id}');
                                    },
                                    child: Padding(
                                      padding: const EdgeInsets.symmetric(
                                          horizontal: 16, vertical: 8),
                                      child: Row(
                                        children: [
                                          ClipRRect(
                                            borderRadius:
                                                BorderRadius.circular(4),
                                            child: p.primaryImageUrl != null
                                                ? Image.network(
                                                    p.primaryImageUrl!,
                                                    width: 32,
                                                    height: 32,
                                                    fit: BoxFit.contain)
                                                : Container(
                                                    width: 32,
                                                    height: 32,
                                                    color:
                                                        Colors.grey.shade100),
                                          ),
                                          const SizedBox(width: 10),
                                          Expanded(
                                            child: Text(p.name,
                                                style: const TextStyle(
                                                    fontSize: 13,
                                                    color: Colors.black87),
                                                maxLines: 1,
                                                overflow:
                                                    TextOverflow.ellipsis),
                                          ),
                                        ],
                                      ),
                                    ),
                                  ),
                                InkWell(
                                  onTap: () =>
                                      _runSearch(_searchCtrl.text.trim()),
                                  child: Padding(
                                    padding: const EdgeInsets.symmetric(
                                        horizontal: 16, vertical: 10),
                                    child: Text(
                                      'See all results for "${_searchCtrl.text.trim()}" →',
                                      style: const TextStyle(
                                          fontSize: 12,
                                          fontWeight: FontWeight.w600,
                                          color: Color(0xFFAC2528)),
                                    ),
                                  ),
                                ),
                              ],
                            ],
                          ),
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          ),
          Expanded(
            child: CustomScrollView(
              controller: _scrollCtrl,
              slivers: [
                // Category filter: "All" bar spanning full width, then a 3x4 grid
                // of division tiles below it (mirrors the website's product filter).
                SliverToBoxAdapter(
                  child: categories.when(
                    data: (cats) => Padding(
                      padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
                      child: Container(
                        padding: const EdgeInsets.all(10),
                        decoration: BoxDecoration(
                          color: Colors.grey.shade200,
                          borderRadius: BorderRadius.circular(14),
                        ),
                        child: Column(
                          children: [
                            GestureDetector(
                              onTap: () {
                                if (_category != '')
                                  setState(() => _category = '');
                                _load(reset: true);
                              },
                              child: Container(
                                width: double.infinity,
                                padding:
                                    const EdgeInsets.symmetric(vertical: 10),
                                alignment: Alignment.center,
                                decoration: BoxDecoration(
                                  color: _category == ''
                                      ? _filterRed
                                      : Colors.grey.shade100,
                                  borderRadius: BorderRadius.circular(10),
                                ),
                                child: Text(
                                  'All',
                                  style: TextStyle(
                                    fontSize: 13,
                                    fontWeight: FontWeight.w600,
                                    color: _category == ''
                                        ? Colors.white
                                        : Colors.grey.shade700,
                                  ),
                                ),
                              ),
                            ),
                            if (isSpecial) ...[
                              const SizedBox(height: 8),
                              GestureDetector(
                                onTap: () => context.push('/special'),
                                child: Container(
                                  width: double.infinity,
                                  padding:
                                      const EdgeInsets.symmetric(vertical: 10),
                                  alignment: Alignment.center,
                                  decoration: BoxDecoration(
                                    color: const Color(0xFF00A6A4),
                                    borderRadius: BorderRadius.circular(10),
                                  ),
                                  child: const Text(
                                    '13 Alpha Unit',
                                    style: TextStyle(
                                        fontSize: 13,
                                        fontWeight: FontWeight.w600,
                                        color: Colors.white),
                                  ),
                                ),
                              ),
                            ],
                            const SizedBox(height: 8),
                            GridView.builder(
                              shrinkWrap: true,
                              physics: const NeverScrollableScrollPhysics(),
                              itemCount: kDivisions.length,
                              gridDelegate:
                                  SliverGridDelegateWithFixedCrossAxisCount(
                                // More, smaller tiles in landscape so the
                                // filter row takes up less vertical space.
                                crossAxisCount: isLandscape ? 5 : 3,
                                mainAxisSpacing: 8,
                                crossAxisSpacing: 8,
                                // Division images are mostly landscape/rectangular, not square —
                                // match the tile shape to that instead of forcing a 1:1 box.
                                childAspectRatio: isLandscape ? 3.4 : 2.6,
                              ),
                              itemBuilder: (context, i) {
                                final d = kDivisions[i];
                                final isActive = _category == d.category;
                                return GestureDetector(
                                  onTap: () => _onCategory(d.category),
                                  child: Container(
                                    decoration: BoxDecoration(
                                      borderRadius: BorderRadius.circular(10),
                                      color: Colors.grey.shade50,
                                      border: Border.all(
                                          color: isActive
                                              ? _filterRed
                                              : Colors.transparent,
                                          width: 3),
                                    ),
                                    padding: const EdgeInsets.all(2),
                                    child: ClipRRect(
                                      borderRadius: BorderRadius.circular(7),
                                      child: Image.asset(
                                        d.gridImage,
                                        fit: BoxFit.contain,
                                        errorBuilder:
                                            (context, error, stackTrace) =>
                                                Container(
                                          color: Colors.grey.shade200,
                                          child: const Icon(
                                              Icons
                                                  .image_not_supported_outlined,
                                              color: Colors.grey),
                                        ),
                                      ),
                                    ),
                                  ),
                                );
                              },
                            ),
                          ],
                        ),
                      ),
                    ),
                    loading: () => const SizedBox(height: 44),
                    error: (_, __) => const SizedBox(height: 44),
                  ),
                ),

                // Type (product form) filter
                SliverToBoxAdapter(
                  child: Consumer(
                    builder: (context, ref, _) {
                      final forms = ref.watch(formsProvider);
                      return forms.when(
                        data: (list) => list.isEmpty
                            ? const SizedBox.shrink()
                            : Padding(
                                padding:
                                    const EdgeInsets.fromLTRB(16, 0, 16, 8),
                                child: Row(
                                  children: [
                                    Text('Type',
                                        style: TextStyle(
                                            fontSize: 12,
                                            color: Colors.grey.shade500,
                                            fontWeight: FontWeight.w500)),
                                    const SizedBox(width: 8),
                                    Container(
                                      padding: const EdgeInsets.symmetric(
                                          horizontal: 10),
                                      decoration: BoxDecoration(
                                        border: Border.all(
                                            color: Colors.grey.shade300),
                                        borderRadius: BorderRadius.circular(10),
                                      ),
                                      child: DropdownButtonHideUnderline(
                                        child: DropdownButton<String>(
                                          value: _form.isEmpty ? '' : _form,
                                          isDense: true,
                                          style: TextStyle(
                                              fontSize: 13,
                                              color: Colors.grey.shade800),
                                          items: [
                                            const DropdownMenuItem(
                                                value: '', child: Text('All')),
                                            for (final f in list)
                                              DropdownMenuItem(
                                                  value: f, child: Text(f)),
                                          ],
                                          onChanged: (v) => _onForm(v ?? ''),
                                        ),
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                        loading: () => const SizedBox.shrink(),
                        error: (_, __) => const SizedBox.shrink(),
                      );
                    },
                  ),
                ),

                if (_tag.isNotEmpty)
                  SliverToBoxAdapter(
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
                      child: GestureDetector(
                        onTap: () {
                          setState(() => _tag = '');
                          _load(reset: true);
                        },
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 12, vertical: 6),
                          decoration: BoxDecoration(
                            color:
                                const Color(0xFF00A6A4).withValues(alpha: 0.1),
                            borderRadius: BorderRadius.circular(20),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              const Text('Tag: ',
                                  style: TextStyle(
                                      fontSize: 12, color: Color(0xFF00A6A4))),
                              Text(_tag,
                                  style: const TextStyle(
                                      fontSize: 12,
                                      fontWeight: FontWeight.w600,
                                      color: Color(0xFF00A6A4))),
                              const SizedBox(width: 6),
                              const Icon(Icons.close,
                                  size: 14, color: Color(0xFF00A6A4)),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ),

                if (_offline)
                  SliverToBoxAdapter(
                    child: Container(
                      width: double.infinity,
                      color: Colors.orange.shade50,
                      padding: const EdgeInsets.symmetric(
                          horizontal: 16, vertical: 8),
                      child: Row(
                        children: [
                          Icon(Icons.cloud_off,
                              size: 14, color: Colors.orange.shade700),
                          const SizedBox(width: 6),
                          Text('Offline — showing saved products',
                              style: TextStyle(
                                  fontSize: 12, color: Colors.orange.shade700)),
                        ],
                      ),
                    ),
                  ),

                if (_spellingSuggestions.isNotEmpty)
                  SliverToBoxAdapter(
                    child: Padding(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 16, vertical: 8),
                      child: Wrap(
                        crossAxisAlignment: WrapCrossAlignment.center,
                        children: [
                          const Text('Did you mean ',
                              style:
                                  TextStyle(fontSize: 12, color: Colors.grey)),
                          for (var i = 0; i < _spellingSuggestions.length; i++)
                            GestureDetector(
                              onTap: () =>
                                  _applySaltSuggestion(_spellingSuggestions[i]),
                              child: Text(
                                '${_spellingSuggestions[i]}${i < _spellingSuggestions.length - 1 ? ", " : ""}',
                                style: const TextStyle(
                                  fontSize: 12,
                                  color: Color(0xFF00A6A4),
                                  fontWeight: FontWeight.w600,
                                  decoration: TextDecoration.underline,
                                ),
                              ),
                            ),
                          const Text('?',
                              style:
                                  TextStyle(fontSize: 12, color: Colors.grey)),
                        ],
                      ),
                    ),
                  ),

                // Product grid
                if (_products.isEmpty && _loading)
                  const SliverFillRemaining(
                    hasScrollBody: false,
                    child: Center(
                        child: CircularProgressIndicator(
                            color: Color(0xFF00A6A4))),
                  )
                else if (_products.isEmpty)
                  const SliverFillRemaining(
                    hasScrollBody: false,
                    child: Center(
                        child: Text('No products found',
                            style: TextStyle(color: Colors.grey))),
                  )
                else
                  SliverPadding(
                    padding: const EdgeInsets.all(16),
                    sliver: SliverGrid(
                      gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                        crossAxisCount: responsiveGridColumns(context),
                        // Taller cards in landscape so the image area (an
                        // Expanded above a fixed-height info block) gets
                        // more room instead of being squeezed thin.
                        childAspectRatio: isLandscape ? 0.58 : 0.72,
                        crossAxisSpacing: 12,
                        mainAxisSpacing: 12,
                      ),
                      delegate: SliverChildBuilderDelegate(
                        (ctx, i) {
                          if (i >= _products.length) {
                            return const Center(
                                child: CircularProgressIndicator(
                                    color: Color(0xFF00A6A4)));
                          }
                          return ProductCard(
                            product: _products[i],
                            onTap: () =>
                                context.push('/products/${_products[i].id}'),
                            onAddToCart: () => ref
                                .read(cartProvider.notifier)
                                .add(_products[i]),
                          );
                        },
                        childCount: _products.length + (_hasMore ? 1 : 0),
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
