import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../providers/cart_provider.dart';
import '../../providers/auth_provider.dart';
import '../../models/transport.dart';
import '../../models/transport_mode.dart';
import '../../services/order_service.dart';
import '../../services/transport_service.dart';
import '../../utils/responsive.dart';

String _modeLabel(String name) => 'By ${name[0].toUpperCase()}${name.substring(1)}';

// Rounds a typed quantity up to the nearest multiple of the product's MOQ
// (e.g. typing 7 with an MOQ of 5 commits as 10), and never below one MOQ.
int _roundUpToMoq(int quantity, int moq) {
  final step = moq > 0 ? moq : 1;
  final rounded = ((quantity + step - 1) ~/ step) * step;
  return rounded < step ? step : rounded;
}

// Free-text quantity field — lets the shopper type any number, then on
// blur/submit rounds it up to the nearest MOQ multiple and commits.
class _CartQtyField extends StatefulWidget {
  final int quantity;
  final int moq;
  final ValueChanged<int> onCommit;

  const _CartQtyField({super.key, required this.quantity, required this.moq, required this.onCommit});

  @override
  State<_CartQtyField> createState() => _CartQtyFieldState();
}

class _CartQtyFieldState extends State<_CartQtyField> {
  late final TextEditingController _ctrl;
  late final FocusNode _focusNode;

  @override
  void initState() {
    super.initState();
    _ctrl = TextEditingController(text: '${widget.quantity}');
    _focusNode = FocusNode();
    _focusNode.addListener(() {
      if (!_focusNode.hasFocus) _commit();
    });
  }

  @override
  void didUpdateWidget(covariant _CartQtyField oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.quantity != widget.quantity && !_focusNode.hasFocus) {
      _ctrl.text = '${widget.quantity}';
    }
  }

  void _commit() {
    final parsed = int.tryParse(_ctrl.text);
    if (parsed == null || parsed < 1) {
      _ctrl.text = '${widget.quantity}';
      return;
    }
    final rounded = _roundUpToMoq(parsed, widget.moq);
    _ctrl.text = '$rounded';
    if (rounded != widget.quantity) widget.onCommit(rounded);
  }

  @override
  void dispose() {
    _ctrl.dispose();
    _focusNode.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 44,
      child: TextField(
        controller: _ctrl,
        focusNode: _focusNode,
        keyboardType: TextInputType.number,
        textAlign: TextAlign.center,
        style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 16),
        decoration: const InputDecoration(
          isDense: true,
          contentPadding: EdgeInsets.symmetric(vertical: 6),
          border: InputBorder.none,
        ),
        onSubmitted: (_) => _focusNode.unfocus(),
      ),
    );
  }
}

class CartScreen extends ConsumerStatefulWidget {
  const CartScreen({super.key});

  @override
  ConsumerState<CartScreen> createState() => _CartScreenState();
}

class _CartScreenState extends ConsumerState<CartScreen> {
  bool _placing = false;
  String? _transportMode;
  List<TransportMode> _modes = [];
  List<Transport> _transportOptions = [];
  String? _transportId;
  bool _loadingTransports = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_transportMode == null) {
      _transportMode = ref.read(authProvider).user?.defaultTransportMode ?? 'courier';
      _loadModes();
      _loadTransportOptions(_transportMode!);
    }
  }

  Future<void> _loadModes() async {
    try {
      final list = await TransportService().getModes();
      if (mounted) setState(() => _modes = list);
    } catch (_) {
      // keep whatever we had (or the empty list) — non-fatal
    }
  }

  Future<void> _loadTransportOptions(String mode) async {
    setState(() { _loadingTransports = true; _transportId = null; });
    try {
      final list = await TransportService().getTransports(mode: mode);
      if (mounted) setState(() { _transportOptions = list; _loadingTransports = false; });
    } catch (_) {
      if (mounted) setState(() { _transportOptions = []; _loadingTransports = false; });
    }
  }

  Future<void> _placeOrder() async {
    final items = ref.read(cartProvider);
    if (items.isEmpty) return;

    setState(() => _placing = true);
    try {
      final orderId = await OrderService().placeOrder(items, transportMode: _transportMode, transportId: _transportId);
      // The backend already cleared cart_items transactionally as part of
      // placing the order — clearLocal() just syncs local UI state with
      // that, without firing a redundant DELETE /cart.
      ref.read(cartProvider.notifier).clearLocal();
      if (mounted) {
        context.go('/orders/$orderId');
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Order placed successfully!'), backgroundColor: Color(0xFF00A6A4), behavior: SnackBarBehavior.floating),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to place order: $e'), backgroundColor: Colors.red, behavior: SnackBarBehavior.floating),
        );
      }
    } finally {
      if (mounted) setState(() => _placing = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final items = ref.watch(cartProvider);
    final cart = ref.read(cartProvider.notifier);

    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        title: Text('Cart (${items.length})', style: const TextStyle(color: Color(0xFF1A1A1A), fontWeight: FontWeight.w600)),
        foregroundColor: Colors.black,
      ),
      body: ResponsiveCenter(child: items.isEmpty
          ? Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.shopping_bag_outlined, size: 64, color: Colors.grey.shade300),
                  const SizedBox(height: 16),
                  const Text('Your cart is empty', style: TextStyle(color: Colors.grey, fontSize: 16)),
                  const SizedBox(height: 16),
                  TextButton(onPressed: () => context.pop(), child: const Text('Browse Products', style: TextStyle(color: Color(0xFF00A6A4)))),
                ],
              ),
            )
          : Column(
              children: [
                Expanded(
                  child: ListView.separated(
                    padding: const EdgeInsets.all(16),
                    itemCount: items.length,
                    separatorBuilder: (_, __) => const Divider(height: 1),
                    itemBuilder: (ctx, i) {
                      final item = items[i];
                      return Padding(
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        child: Row(
                          children: [
                            // Image placeholder
                            Container(
                              width: 60, height: 60,
                              decoration: BoxDecoration(color: Colors.grey.shade100, borderRadius: BorderRadius.circular(10)),
                              child: const Icon(Icons.medication_outlined, color: Colors.grey),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(item.product.name, style: const TextStyle(fontWeight: FontWeight.w500, fontSize: 14), maxLines: 2, overflow: TextOverflow.ellipsis),
                                  const SizedBox(height: 4),
                                  Text(
                                    'MRP Rs. ${(item.product.mrp ?? item.product.price).toStringAsFixed(2)}',
                                    style: const TextStyle(color: Color(0xFF00A6A4), fontWeight: FontWeight.w600),
                                  ),
                                ],
                              ),
                            ),
                            // Qty controls
                            Row(
                              children: [
                                _qtyBtn(Icons.remove, () {
                                  final step = item.product.moq > 0 ? item.product.moq : 1;
                                  cart.updateQty(item.product.id, item.quantity - step);
                                }),
                                _CartQtyField(
                                  key: ValueKey(item.product.id),
                                  quantity: item.quantity,
                                  moq: item.product.moq,
                                  onCommit: (next) => cart.updateQty(item.product.id, next),
                                ),
                                _qtyBtn(Icons.add, () {
                                  final step = item.product.moq > 0 ? item.product.moq : 1;
                                  cart.updateQty(item.product.id, item.quantity + step);
                                }),
                              ],
                            ),
                          ],
                        ),
                      );
                    },
                  ),
                ),

                // Summary + order button
                Container(
                  padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.06), blurRadius: 16, offset: const Offset(0, -4))],
                  ),
                  child: Column(
                    children: [
                      Align(
                        alignment: Alignment.centerLeft,
                        child: Text('Mode of Transportation', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: Colors.grey.shade600)),
                      ),
                      const SizedBox(height: 8),
                      Wrap(
                        spacing: 10,
                        runSpacing: 8,
                        children: _modes.map((mode) {
                          final selected = _transportMode == mode.name;
                          return GestureDetector(
                            onTap: () {
                              setState(() => _transportMode = mode.name);
                              _loadTransportOptions(mode.name);
                            },
                            child: Container(
                              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                              decoration: BoxDecoration(
                                color: selected ? const Color(0xFF00A6A4) : Colors.grey.shade100,
                                borderRadius: BorderRadius.circular(20),
                              ),
                              child: Text(
                                _modeLabel(mode.name),
                                style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: selected ? Colors.white : Colors.grey.shade700),
                              ),
                            ),
                          );
                        }).toList(),
                      ),
                      if (_loadingTransports) ...[
                        const SizedBox(height: 12),
                        const Align(alignment: Alignment.centerLeft, child: SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))),
                      ] else if (_transportOptions.isNotEmpty) ...[
                        const SizedBox(height: 12),
                        Align(
                          alignment: Alignment.centerLeft,
                          child: Text('${_transportMode![0].toUpperCase()}${_transportMode!.substring(1)} (optional)', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: Colors.grey.shade600)),
                        ),
                        const SizedBox(height: 8),
                        Container(
                          width: double.infinity,
                          padding: const EdgeInsets.symmetric(horizontal: 12),
                          decoration: BoxDecoration(
                            color: Colors.grey.shade50,
                            borderRadius: BorderRadius.circular(10),
                            border: Border.all(color: Colors.grey.shade200),
                          ),
                          child: DropdownButtonHideUnderline(
                            child: DropdownButton<String?>(
                              isExpanded: true,
                              value: _transportId,
                              hint: Text('Select an option...', style: TextStyle(fontSize: 13, color: Colors.grey.shade400)),
                              items: [
                                DropdownMenuItem<String?>(value: null, child: Text('None', style: TextStyle(fontSize: 13, color: Colors.grey.shade600))),
                                ..._transportOptions.map((t) => DropdownMenuItem<String?>(value: t.id, child: Text(t.name, style: const TextStyle(fontSize: 13)))),
                              ],
                              onChanged: (v) => setState(() => _transportId = v),
                            ),
                          ),
                        ),
                      ],
                      const SizedBox(height: 16),
                      _addressSummary(context),
                      const SizedBox(height: 16),
                      SizedBox(
                        width: double.infinity,
                        height: 52,
                        child: ElevatedButton(
                          onPressed: _placing ? null : _placeOrder,
                          style: ElevatedButton.styleFrom(
                            backgroundColor: const Color(0xFF00A6A4),
                            foregroundColor: Colors.white,
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                            elevation: 0,
                          ),
                          child: _placing
                              ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                              : const Text('Place Order', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
      ),
    );
  }

  Widget _addressSummary(BuildContext context) {
    final user = ref.watch(authProvider).user;
    final billing = user?.billingAddress;
    final shipping = user?.shippingAddress;
    final hasAddress = (billing?.isNotEmpty ?? false) || (shipping?.isNotEmpty ?? false);

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.grey.shade50,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: Colors.grey.shade200),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text('Billing & Shipping Address', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: Colors.grey.shade600)),
              GestureDetector(
                onTap: () => context.push('/profile'),
                child: const Text('Edit', style: TextStyle(fontSize: 12, color: Color(0xFF00A6A4), fontWeight: FontWeight.w600)),
              ),
            ],
          ),
          const SizedBox(height: 8),
          if (hasAddress) ...[
            Text('Billing: ${billing?.isNotEmpty == true ? billing : "Not set"}', style: const TextStyle(fontSize: 13)),
            const SizedBox(height: 4),
            Text('Shipping: ${shipping?.isNotEmpty == true ? shipping : "Not set"}', style: const TextStyle(fontSize: 13)),
          ] else
            Text('No address on file — add one in your profile', style: TextStyle(fontSize: 13, color: Colors.grey.shade500)),
        ],
      ),
    );
  }

  Widget _qtyBtn(IconData icon, VoidCallback onTap) => GestureDetector(
        onTap: onTap,
        child: Container(
          width: 28, height: 28,
          decoration: BoxDecoration(color: Colors.grey.shade100, borderRadius: BorderRadius.circular(8)),
          child: Icon(icon, size: 16, color: Colors.grey.shade700),
        ),
      );
}
