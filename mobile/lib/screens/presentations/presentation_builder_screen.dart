import 'dart:async';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../../models/doctor.dart';
import '../../models/presentation.dart';
import '../../models/product.dart';
import '../../services/doctor_service.dart';
import '../../services/presentation_service.dart';
import '../../services/product_service.dart';
import 'present.dart';
import '../../services/presentation_downloads.dart';
import '../../widgets/presentation_download_button.dart';
import '../../widgets/shell_leading.dart';

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
  bool _offlineCopy = false; // showing the downloaded copy (no connection)
  bool _saving = false;
  bool _dirty = false;
  bool _isDefault = false;
  bool _regenerating = false;

  List<Product> _searchResults = [];
  Product? _activeProduct;
  bool _visualAidOnly = false;
  // share of the space below the settings that the add-images panel takes;
  // the handle above it drags it up or down
  double _pickerShare = 0.42;
  static const _handleHeight = 26.0;

  // Which viewer "Present" opens — the swipe-through slideshow or the
  // page-turning notebook. Remembered on this device.
  static const _viewerKey = presentationViewerKey;
  bool _notebook = false;

  @override
  void initState() {
    super.initState();
    _load();
    SharedPreferences.getInstance().then((prefs) {
      if (mounted) setState(() => _notebook = prefs.getString(_viewerKey) == 'notebook');
    }).catchError((_) {});
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
        _isDefault = detail.presentation.isDefaultForDoctor;
        _slides = detail.slides;
        _loading = false;
      });
    } catch (_) {
      // No connection: the downloaded copy, if there is one, so it still plays.
      final saved = await PresentationDownloads.get(widget.presentationId);
      if (!mounted) return;
      setState(() {
        if (saved != null) {
          _nameCtrl.text = saved.name;
          _slides = saved.slides;
          _offlineCopy = true;
        }
        _loading = false;
      });
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
      if (mounted) {
        setState(() {
          _activeProduct = full;
          if (_pickerShare < 0.62) _pickerShare = 0.62; // room for its images
        });
      }
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

  // Default decks are auto-populated from every visual-aid image of the
  // doctor's currently assigned products, but only at creation time —
  // assigning more products afterward doesn't touch the deck already
  // saved here, so this re-runs the same generation and reloads it.
  Future<void> _regenerate() async {
    if (_doctorId == null) return;
    setState(() => _regenerating = true);
    try {
      await _service.generateDefaultForDoctor(_doctorId!);
      await _load();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Could not regenerate: $e'), backgroundColor: Colors.red),
        );
      }
    } finally {
      if (mounted) setState(() => _regenerating = false);
    }
  }

  void _setViewer(bool notebook) {
    setState(() => _notebook = notebook);
    SharedPreferences.getInstance()
        .then((prefs) => prefs.setString(_viewerKey, notebook ? 'notebook' : 'slideshow'))
        .catchError((_) => false);
  }

  void _present() => presentSlides(context, _slides, notebook: _notebook);


  // the drag handle on top of the add-images panel: drag up for a bigger
  // panel, down for more slides; a tap switches between the two
  Widget _panelHandle(double room) => GestureDetector(
        behavior: HitTestBehavior.opaque,
        onVerticalDragUpdate: (d) {
          if (room <= 0) return;
          setState(() => _pickerShare = (_pickerShare - d.delta.dy / room).clamp(0.2, 0.92));
        },
        onTap: () => setState(() => _pickerShare = _pickerShare < 0.6 ? 0.8 : 0.42),
        child: Container(
          height: _handleHeight,
          decoration: BoxDecoration(
            color: Colors.white,
            border: Border(top: BorderSide(color: Colors.grey.shade200)),
            boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.04), blurRadius: 6, offset: const Offset(0, -2))],
          ),
          alignment: Alignment.center,
          child: Container(
            width: 44,
            height: 5,
            decoration: BoxDecoration(color: Colors.grey.shade300, borderRadius: BorderRadius.circular(3)),
          ),
        ),
      );

  Widget _slidesList() => _slides.isEmpty
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
                leading: GestureDetector(
                  onTap: () => _viewImage(s.imageUrl, s.productName),
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(6),
                    child: Image.network(s.imageUrl, width: 48, height: 48, fit: BoxFit.contain),
                  ),
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
        );

  // an image at full size, pinch to zoom
  void _viewImage(String url, String title) {
    showDialog(
      context: context,
      builder: (ctx) => Dialog(
        insetPadding: const EdgeInsets.all(12),
        clipBehavior: Clip.antiAlias,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 6, 4, 0),
            child: Row(children: [
              Expanded(
                child: Text(title,
                    maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
              ),
              IconButton(icon: const Icon(Icons.close), onPressed: () => Navigator.pop(ctx)),
            ]),
          ),
          Flexible(
            child: InteractiveViewer(
              maxScale: 5,
              child: Image.network(url, fit: BoxFit.contain),
            ),
          ),
          const SizedBox(height: 12),
        ]),
      ),
    );
  }

  Widget _picker(List<ProductImage> visibleImages) => Container(
        color: Colors.white,
        padding: const EdgeInsets.fromLTRB(12, 4, 12, 0),
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
            const SizedBox(height: 6),
            if (_activeProduct != null)
              Row(
                children: [
                  IconButton(
                    onPressed: () => setState(() => _activeProduct = null),
                    icon: const Icon(Icons.arrow_back, size: 20, color: Color(0xFF00A6A4)),
                    visualDensity: VisualDensity.compact,
                    tooltip: 'Back to products',
                  ),
                  // the name takes what is left, so the tick box always fits
                  Expanded(
                    child: Text(_activeProduct!.name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13.5, color: Color(0xFF00A6A4))),
                  ),
                  const SizedBox(width: 6),
                  InkWell(
                    borderRadius: BorderRadius.circular(8),
                    onTap: () => setState(() => _visualAidOnly = !_visualAidOnly),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
                      child: Row(mainAxisSize: MainAxisSize.min, children: [
                        SizedBox(
                          width: 28,
                          height: 28,
                          child: Checkbox(
                            value: _visualAidOnly,
                            activeColor: const Color(0xFF00A6A4),
                            materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                            visualDensity: VisualDensity.compact,
                            onChanged: (v) => setState(() => _visualAidOnly = v ?? false),
                          ),
                        ),
                        const SizedBox(width: 2),
                        const Text('Visual aid only', style: TextStyle(fontSize: 12)),
                      ]),
                    ),
                  ),
                ],
              ),
            if (_activeProduct != null && visibleImages.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(left: 4, bottom: 6),
                child: Text('Tap to add · hold to see it large', style: TextStyle(fontSize: 11, color: Colors.grey.shade500)),
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
                          trailing: const Icon(Icons.chevron_right, size: 18, color: Colors.grey),
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
                          padding: const EdgeInsets.only(bottom: 12),
                          gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                            crossAxisCount: 3,
                            crossAxisSpacing: 8,
                            mainAxisSpacing: 8,
                          ),
                          itemCount: visibleImages.length,
                          itemBuilder: (ctx, i) {
                            final img = visibleImages[i];
                            final added = _slides.any((s) => s.productImageId == img.id);
                            return GestureDetector(
                              onTap: added ? null : () => _addImage(img, _activeProduct!),
                              onLongPress: () => _viewImage(img.imageUrl, _activeProduct!.name),
                              child: Container(
                                decoration: BoxDecoration(
                                  color: Colors.grey.shade50,
                                  border: Border.all(
                                      color: added ? const Color(0xFF00A6A4) : Colors.grey.shade200, width: added ? 2 : 1),
                                  borderRadius: BorderRadius.circular(10),
                                ),
                                clipBehavior: Clip.antiAlias,
                                child: Stack(
                                  fit: StackFit.expand,
                                  children: [
                                    Padding(
                                      padding: const EdgeInsets.all(4),
                                      child: Opacity(
                                        opacity: added ? 0.45 : 1,
                                        child: Image.network(img.imageUrl, fit: BoxFit.contain),
                                      ),
                                    ),
                                    if (added)
                                      const Positioned(
                                        top: 4,
                                        right: 4,
                                        child: Icon(Icons.check_circle, color: Color(0xFF00A6A4), size: 22),
                                      ),
                                  ],
                                ),
                              ),
                            );
                          },
                        ),
            ),
          ],
        ),
      );

  @override
  Widget build(BuildContext context) {
    final visibleImages = (_activeProduct?.images ?? [])
        .where((img) => !_visualAidOnly || img.visualAid)
        .toList();

    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(leading: const ShellBack(), 
        backgroundColor: Colors.white,
        elevation: 0,
        title: TextField(
          controller: _nameCtrl,
          onChanged: (_) => setState(() => _dirty = true),
          decoration: const InputDecoration(border: InputBorder.none, isDense: true),
          style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: Color(0xFF1A1A1A)),
        ),
        actions: [
          if (_isDefault && _doctorId != null)
            IconButton(
              icon: _regenerating
                  ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                  : const Icon(Icons.refresh, color: Color(0xFF00A6A4)),
              tooltip: 'Regenerate from assigned products',
              onPressed: _regenerating ? null : _regenerate,
            ),
          TextButton(
            onPressed: _dirty && !_saving ? _save : null,
            child: _saving
                ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
                : const Text('Save'),
          ),
          // Downloads the saved version; save first after editing.
          if (!_loading && _slides.isNotEmpty)
            PresentationDownloadButton(presentationId: widget.presentationId, name: _nameCtrl.text),
          IconButton(
            icon: const Icon(Icons.play_circle_outline, color: Color(0xFF00A6A4)),
            onPressed: _slides.isEmpty ? null : _present,
            tooltip: 'Present',
          ),
        ],
        bottom: _offlineCopy
            ? PreferredSize(
                preferredSize: const Size.fromHeight(30),
                child: Container(
                  height: 30,
                  color: Colors.orange.shade50,
                  alignment: Alignment.center,
                  child: Text('Offline: showing the downloaded copy. Tap play to present.',
                      style: TextStyle(fontSize: 12, color: Colors.orange.shade800)),
                ),
              )
            : null,
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
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 4, 16, 0),
                  child: Row(
                    children: [
                      const Text('Present as:', style: TextStyle(fontSize: 12, color: Colors.grey)),
                      const SizedBox(width: 8),
                      SegmentedButton<bool>(
                        segments: const [
                          ButtonSegment(value: false, label: Text('Slideshow'), icon: Icon(Icons.slideshow_outlined, size: 16)),
                          ButtonSegment(value: true, label: Text('Notebook'), icon: Icon(Icons.menu_book_outlined, size: 16)),
                        ],
                        selected: {_notebook},
                        showSelectedIcon: false,
                        onSelectionChanged: (s) => _setViewer(s.first),
                        style: SegmentedButton.styleFrom(
                          visualDensity: VisualDensity.compact,
                          textStyle: const TextStyle(fontSize: 12),
                          selectedBackgroundColor: const Color(0xFF00A6A4),
                          selectedForegroundColor: Colors.white,
                        ),
                      ),
                    ],
                  ),
                ),
                if (_slides.isNotEmpty) _ProductsInDeckBar(slides: _slides),
                Expanded(
                  child: LayoutBuilder(builder: (ctx, box) {
                    // the add-images panel's height: dragged with the handle
                    // (pull up to see more), never hiding the slides completely
                    final room = (box.maxHeight - _handleHeight).clamp(0.0, double.infinity);
                    final most = (room - 60).clamp(0.0, room);
                    final pickerHeight = (room * _pickerShare).clamp(most < 150 ? most : 150.0, most);
                    return Column(children: [
                      Expanded(child: _slidesList()),
                      _panelHandle(room),
                      SizedBox(height: pickerHeight, child: _picker(visibleImages)),
                    ]);
                  }),
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
