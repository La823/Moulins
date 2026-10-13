import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

// Grid of image cards, or a compact image-free list (composition first).
// Remembered on this device and shared by every product listing (all
// products and each division), so picking one sticks everywhere.
const _viewKey = 'products_view';

/// Whether the saved choice is the list view. Defaults to grid.
Future<bool> loadListView() async {
  try {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(_viewKey) == 'list';
  } catch (_) {
    return false;
  }
}

void saveListView(bool list) {
  SharedPreferences.getInstance()
      .then((prefs) => prefs.setString(_viewKey, list ? 'list' : 'grid'))
      .catchError((_) => false);
}

class ProductViewToggle extends StatelessWidget {
  final bool listView;
  final ValueChanged<bool> onChanged;

  const ProductViewToggle({super.key, required this.listView, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    return SegmentedButton<bool>(
      segments: const [
        ButtonSegment(value: false, label: Text('Grid'), icon: Icon(Icons.grid_view_rounded, size: 16)),
        ButtonSegment(value: true, label: Text('List'), icon: Icon(Icons.view_list_rounded, size: 16)),
      ],
      selected: {listView},
      showSelectedIcon: false,
      onSelectionChanged: (sel) => onChanged(sel.first),
      style: SegmentedButton.styleFrom(
        visualDensity: VisualDensity.compact,
        textStyle: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
        selectedBackgroundColor: const Color(0xFF111827),
        selectedForegroundColor: Colors.white,
      ),
    );
  }
}
