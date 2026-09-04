import 'dart:async';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../models/doctor.dart';
import '../../models/presentation.dart';
import '../../models/product.dart';
import '../../services/doctor_service.dart';
import '../../services/presentation_service.dart';
import '../../services/product_service.dart';

class PresentationBuilderScreen extends StatefulWidget {
  final String presentationId;

  const PresentationBuilderScreen({super.key, required this.presentationId});

  @override
  State<PresentationBuilderScreen> createState() => _PresentationBuilderScreenState();
}

class _PresentationBuilderScreenState extends State<PresentationBuilderScreen> {
  final _service = PresentationService();
  final _productService = ProductService();
  final _doctorService = DoctorService();
  final _nameCtrl = TextEditingController();
  final _searchCtrl = TextEditingController();
  Timer? _debounce;

  List<PresentationSlide> _slides = [];
  String? _doctorId;
  List<Doctor> _doctors = [];
  bool _loading = true;
  bool _saving = false;
  bool _dirty = false;

  List<Product> _searchResults = [];
  Product? _activeProduct;
  bool _visualAidOnly = false;

  @override
  void initState() {
    super.initState();
    _load();
    _doctorService.getDoctors().then((d) {
      if (mounted) setState(() => _doctors = d);
    }).catchError((_) {});
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _nameCtrl.dispose();
    _searchCtrl.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final detail = await _service.getPresentation(widget.presentationId);
      setState(() {
        _nameCtrl.text = detail.presentation.name;
        _doctorId = detail.presentation.doctorId;
        _slides = detail.slides;
        _loading = false;
      });
    } catch (_) {
      setState(() => _loading = false);
    }
  }

  void _onSearchChanged(String q) {
    _debounce?.cancel();
    if (q.trim().isEmpty) {
      setState(() => _searchResults = []);
      return;
    }
    _debounce = Timer(const Duration(milliseconds: 350), () async {
      try {
        final res = await _productService.getProducts(search: q.trim(), limit: 10);
        if (mounted) setState(() => _searchResults = res.products);
      } catch (_) {}
    });
  }

  Future<void> _openProduct(Product p) async {
    try {
      final full = await _productService.getProduct(p.id);
      if (mounted) setState(() => _activeProduct = full);
    } catch (_) {}
  }

  void _addImage(ProductImage img, Product product) {
    if (_slides.any((s) => s.productImageId == img.id)) return;
    setState(() {
      _slides = [
        ..._slides,
        PresentationSlide(
          productImageId: img.id,
          imageUrl: img.imageUrl,
          productId: product.id,
          productName: product.name,
        ),
      ];
      _dirty = true;
    });
  }

  void _removeSlide(String productImageId) {
    setState(() {
      _slides = _slides.where((s) => s.productImageId != productImageId).toList();
      _dirty = true;
    });
  }

  void _onReorder(int oldIndex, int newIndex) {
    setState(() {
      if (newIndex > oldIndex) newIndex -= 1;
      final item = _slides.removeAt(oldIndex);
      _slides.insert(newIndex, item);
      _dirty = true;
    });
  }

  Future<void> _save() async {
    setState(() => _saving = true);
    try {
      await _service.updatePresentation(widget.presentationId, _nameCtrl.text.trim(), doctorId: _doctorId);
      await _service.replaceSlides(widget.presentationId, _slides.map((s) => s.productImageId).toList());
      if (mounted) setState(() => _dirty = false);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Could not save: $e'), backgroundColor: Colors.red),
        );
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  void _present() {
    if (_slides.isEmpty) return;
    context.push('/gallery', extra: {
      'imageUrls': _slides.map((s) => s.imageUrl).toList(),
      'initialIndex': 0,
    });
  }

  @override
  Widget build(BuildContext context) {
    final visibleImages = (_activeProduct?.images ?? [])
        .where((img) => !_visualAidOnly || img.visualAid)
        .toList();

    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        title: TextField(
          controller: _nameCtrl,
          onChanged: (_) => setState(() => _dirty = true),
          decoration: const InputDecoration(border: InputBorder.none, isDense: true),
          style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: Color(0xFF1A1A1A)),
        ),
        actions: [
          TextButton(
            onPressed: _dirty && !_saving ? _save : null,
            child: _saving
                ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
                : const Text('Save'),
          ),
          IconButton(
            icon: const Icon(Icons.play_circle_outline, color: Color(0xFF00A6A4)),
            onPressed: _slides.isEmpty ? null : _present,
            tooltip: 'Present',
          ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: Color(0xFF00A6A4)))
          : Column(
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
                  child: Row(
                    children: [
                      const Text('Doctor:', style: TextStyle(fontSize: 12, color: Colors.grey)),
                      const SizedBox(width: 8),
                      Expanded(
                        child: DropdownButtonHideUnderline(
                          child: DropdownButton<String?>(
                            isExpanded: true,
                            value: _doctorId,
                            hint: const Text('Not linked to a doctor', style: TextStyle(fontSize: 13)),
                            items: [
                              const DropdownMenuItem<String?>(value: null, child: Text('Not linked to a doctor', style: TextStyle(fontSize: 13))),
                              ..._doctors.map((d) => DropdownMenuItem<String?>(value: d.id, child: Text(d.name, style: const TextStyle(fontSize: 13)))),
                            ],
                            onChanged: (v) => setState(() {
                              _doctorId = v;
                              _dirty = true;
                            }),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                if (_slides.isNotEmpty) _ProductsInDeckBar(slides: _slides),
                Expanded(
                  flex: 3,
                  child: _slides.isEmpty
                      ? Center(
                          child: Text('Add images below to build your slideshow', style: TextStyle(color: Colors.grey.shade400)),
                        )
                      : ReorderableListView.builder(
                          padding: const EdgeInsets.all(16),
                          itemCount: _slides.length,
                          onReorder: _onReorder,
                          itemBuilder: (ctx, i) {
                            final s = _slides[i];
                            return Card(
                              key: ValueKey(s.productImageId),
                              margin: const EdgeInsets.only(bottom: 10),
                              elevation: 0,
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10), side: BorderSide(color: Colors.grey.shade200)),
                              child: ListTile(
                                leading: ClipRRect(
                                  borderRadius: BorderRadius.circular(6),
                                  child: Image.network(s.imageUrl, width: 48, height: 48, fit: BoxFit.contain),
                                ),
                                title: Text(s.productName, maxLines: 1, overflow: TextOverflow.ellipsis),
                                trailing: Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    IconButton(
                                      icon: const Icon(Icons.close, size: 18, color: Colors.grey),
                                      onPressed: () => _removeSlide(s.productImageId),
                                    ),
                                    const Icon(Icons.drag_handle, color: Colors.grey),
                                  ],
                                ),
                              ),
                            );
                          },
                        ),
                ),
                const Divider(height: 1),
                Expanded(
                  flex: 2,
                  child: Padding(
                    padding: const EdgeInsets.all(12),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        TextField(
                          controller: _searchCtrl,
                          onChanged: _onSearchChanged,
                          decoration: InputDecoration(
                            hintText: 'Search products to add images...',
                            prefixIcon: const Icon(Icons.search, size: 20),
                            filled: true,
                            fillColor: Colors.grey.shade50,
                            border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide(color: Colors.grey.shade200)),
                            isDense: true,
                          ),
                        ),
                        const SizedBox(height: 8),
                        if (_activeProduct != null)
                          Row(
                            children: [
                              TextButton.icon(
                                onPressed: () => setState(() => _activeProduct = null),
                                icon: const Icon(Icons.arrow_back, size: 16),
                                label: Text(_activeProduct!.name, overflow: TextOverflow.ellipsis),
                              ),
                              const Spacer(),
                              Row(
                                children: [
                                  Checkbox(
                                    value: _visualAidOnly,
                                    onChanged: (v) => setState(() => _visualAidOnly = v ?? false),
                                  ),
                                  const Text('Visual aid only', style: TextStyle(fontSize: 12)),
                                ],
                              ),
                            ],
                          ),
                        Expanded(
                          child: _activeProduct == null
                              ? ListView.builder(
                                  itemCount: _searchResults.length,
                                  itemBuilder: (ctx, i) {
                                    final p = _searchResults[i];
                                    return ListTile(
                                      dense: true,
                                      title: Text(p.name, maxLines: 1, overflow: TextOverflow.ellipsis),
                                      onTap: () => _openProduct(p),
                                    );
                                  },
                                )
                              : visibleImages.isEmpty
                                  ? Center(
                                      child: Text(
                                        _visualAidOnly ? 'No images flagged for visual aid' : 'No images',
                                        style: TextStyle(color: Colors.grey.shade400, fontSize: 12),
                                      ),
                                    )
                                  : GridView.builder(
                                      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                                        crossAxisCount: 4,
                                        crossAxisSpacing: 6,
                                        mainAxisSpacing: 6,
                                      ),
                                      itemCount: visibleImages.length,
                                      itemBuilder: (ctx, i) {
                                        final img = visibleImages[i];
                                        final added = _slides.any((s) => s.productImageId == img.id);
                                        return GestureDetector(
                                          onTap: added ? null : () => _addImage(img, _activeProduct!),
                                          child: Opacity(
                                            opacity: added ? 0.4 : 1,
                                            child: Container(
                                              decoration: BoxDecoration(
                                                border: Border.all(color: Colors.grey.shade200),
                                                borderRadius: BorderRadius.circular(6),
                                              ),
                                              clipBehavior: Clip.antiAlias,
                                              child: Stack(
                                                fit: StackFit.expand,
                                                children: [
                                                  Image.network(img.imageUrl, fit: BoxFit.contain),
                                                  if (added)
                                                    const Center(
                                                      child: Icon(Icons.check_circle, color: Colors.white, size: 20),
                                                    ),
                                                ],
                                              ),
                                            ),
                                          ),
                                        );
                                      },
                                    ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
    );
  }
}

// Distinct products represented among the current slides, in the order
// they first appear, with how many slides each contributes — a quick
// at-a-glance summary of what this deck actually covers.
class _ProductsInDeckBar extends StatelessWidget {
  final List<PresentationSlide> slides;

  const _ProductsInDeckBar({required this.slides});

  @override
  Widget build(BuildContext context) {
    final byId = <String, _DeckProduct>{};
    for (final s in slides) {
      final existing = byId[s.productId];
      if (existing != null) {
        existing.count++;
      } else {
        byId[s.productId] = _DeckProduct(name: s.productName, count: 1);
      }
    }
    final products = byId.values.toList();

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      decoration: BoxDecoration(border: Border(bottom: BorderSide(color: Colors.grey.shade100))),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Products (${products.length})', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: Colors.grey.shade500)),
          const SizedBox(height: 6),
          SizedBox(
            height: 28,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: products.length,
              separatorBuilder: (_, __) => const SizedBox(width: 6),
              itemBuilder: (ctx, i) {
                final p = products[i];
                return Chip(
                  label: Text('${p.name} · ${p.count}', style: const TextStyle(fontSize: 11)),
                  materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  visualDensity: VisualDensity.compact,
                  backgroundColor: Colors.grey.shade100,
                  side: BorderSide.none,
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

class _DeckProduct {
  final String name;
  int count;
  _DeckProduct({required this.name, required this.count});
}
