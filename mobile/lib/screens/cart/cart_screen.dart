import 'dart:async';
import 'package:flutter/material.dart';
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../providers/cart_provider.dart';
import '../../widgets/product_thumbnail.dart';
import '../../providers/auth_provider.dart';
import '../../models/transport.dart';
import '../../models/transport_mode.dart';
import '../../services/order_service.dart';
import '../../services/admin_order_service.dart';
import '../../services/transport_service.dart';
import '../../services/retailer_service.dart';
import '../../utils/responsive.dart';
import '../../widgets/shell_leading.dart';
import '../../widgets/cart_qty_field.dart';

String _modeLabel(String name) => 'By ${name[0].toUpperCase()}${name.substring(1)}';

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

  // Staff who can place orders (admins, employees with orders_edit) order
  // for a partner from their cart: pick the customer, a rate per line
  // (optional), and it goes in as POST /admin/orders like the website's
  // New order page.
  bool get _forCustomer {
    final u = ref.read(authProvider).user;
    return u != null && (u.role == 'admin' || (u.role == 'employee' && u.permissions.contains('orders_edit')));
  }

  Map<String, dynamic>? _customer; // {id, username, phone_number}
  final Map<String, TextEditingController> _rates = {}; // product id -> rate box

  TextEditingController _rateBox(String productId) => _rates.putIfAbsent(productId, TextEditingController.new);

  // blank = no rate; otherwise a number of zero or more (NaN = invalid)
  double? _rateOf(String productId) {
    final t = _rates[productId]?.text.trim() ?? '';
    if (t.isEmpty) return null;
    final n = double.tryParse(t);
    return n != null && n >= 0 ? n : double.nan;
  }

  @override
  void dispose() {
    for (final c in _rates.values) {
      c.dispose();
    }
    super.dispose();
  }

  String _customerLabel(Map<String, dynamic> c) {
    final name = '${c['username'] ?? ''}'.trim();
    return name.isNotEmpty ? name : '${c['phone_number'] ?? 'Unnamed partner'}';
  }

  Future<void> _pickCustomer() async {
    final picked = await showModalBottomSheet<Map<String, dynamic>>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(16))),
      builder: (_) => const _CustomerPicker(),
    );
    if (picked != null && mounted) setState(() => _customer = picked);
  }

  Future<void> _placeForCustomer() async {
    final items = ref.read(cartProvider);
    if (items.isEmpty) return;
    String? problem;
    if (_customer == null) {
      problem = 'Choose the customer this order is for.';
    } else if (items.any((i) => _rateOf(i.product.id)?.isNaN ?? false)) {
      problem = 'A rate must be a number of zero or more, or left blank.';
    }
    if (problem != null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(problem), backgroundColor: Colors.red, behavior: SnackBarBehavior.floating),
      );
      return;
    }
    setState(() => _placing = true);
    try {
      final id = await AdminOrderService().createForCustomer(
        '${_customer!['id']}',
        [
          for (final i in items)
            {
              'product_id': i.product.id,
              'product_name': i.product.name,
              'quantity': i.quantity,
              if (_rateOf(i.product.id) != null) 'rate': _rateOf(i.product.id),
            },
        ],
        transportMode: _transportMode,
        transportId: _transportId,
      );
      // the items came from the staff member's own cart: empty it (the
      // customer's own cart is left as it is)
      ref.read(cartProvider.notifier).clear();
      if (mounted) {
        context.go('/order-placed', extra: {
          'next': '/admin/orders/$id',
          'message': 'Order placed for ${_customerLabel(_customer!)}.',
        });
      }
    } catch (e) {
      var message = 'The order could not be placed. Please try again.';
      if (e is DioException && e.response?.data is String && '${e.response?.data}'.trim().isNotEmpty) {
        message = '${e.response?.data}'.trim();
      }
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(message), backgroundColor: Colors.red, behavior: SnackBarBehavior.floating),
        );
      }
    } finally {
      if (mounted) setState(() => _placing = false);
    }
  }

  // Where this cart goes. Retailers and doctors always order from their
  // partner; a team member as their partner allows — and when both are
  // allowed they pick (to the partner by default).
  String _destination = 'partner'; // 'partner' | 'moulins', when choosing
  bool get _canChoose {
    final u = ref.read(authProvider).user;
    return u != null && u.ordersToPartner && u.ordersToMoulins;
  }

  bool get _isRetailer {
    final u = ref.read(authProvider).user;
    if (u == null) return false;
    if (_canChoose) return _destination == 'partner';
    return u.ordersToPartner;
  }

  // A retailer's cart goes to their partner (retailer_service.dart), not Moulins.
  Future<void> _placeRetailerOrder() async {
    final items = ref.read(cartProvider);
    if (items.isEmpty) return;
    setState(() => _placing = true);
    try {
      final id = await RetailerService().placeOrder(items);
      ref.read(cartProvider.notifier).clearLocal();
      if (mounted) {
        context.go('/order-placed', extra: {
          'next': '/retailer-orders/$id',
          'message': 'Your order has been sent to your partner.',
        });
      }
    } catch (e) {
      await ref.read(cartProvider.notifier).loadFromServer();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(RetailerService.messageOf(e, fallback: 'The order could not be placed. Please try again.')),
          backgroundColor: Colors.red,
          behavior: SnackBarBehavior.floating,
        ));
      }
    } finally {
      if (mounted) setState(() => _placing = false);
    }
  }

  Future<void> _placeOrder() async {
    if (_forCustomer) return _placeForCustomer();
    if (_isRetailer) return _placeRetailerOrder();
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
        context.go('/order-placed', extra: {
          'next': '/orders/$orderId',
          'message': 'Your order has been sent to Moulins.',
        });
      }
    } catch (e) {
      var message = 'Failed to place order. Please try again.';
      // 409: a product in the cart has since been hidden from this partner.
      // The server names it; reloading the cart drops it, since the cart
      // only returns products the partner can still see.
      if (e is DioException && e.response?.statusCode == 409) {
        final body = e.response?.data;
        message = body is String && body.trim().isNotEmpty
            ? '${body.trim()[0].toUpperCase()}${body.trim().substring(1)}. It has been removed from your cart.'
            : 'Some products are no longer available and have been removed from your cart.';
        await ref.read(cartProvider.notifier).loadFromServer();
      }
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(message), backgroundColor: Colors.red, behavior: SnackBarBehavior.floating),
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
      appBar: AppBar(leading: const ShellBack(), 
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
                            ProductThumbnail(product: item.product),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  // No price shown: an order is priced when
                                  // staff enter a rate on receipt, and MRP is
                                  // not what the partner pays.
                                  Text(item.product.name, style: const TextStyle(fontWeight: FontWeight.w500, fontSize: 14), maxLines: 2, overflow: TextOverflow.ellipsis),
                                  // staff ordering for a customer: the line's rate
                                  if (_forCustomer) ...[
                                    const SizedBox(height: 6),
                                    SizedBox(
                                      width: 110,
                                      height: 34,
                                      child: TextField(
                                        controller: _rateBox(item.product.id),
                                        keyboardType: const TextInputType.numberWithOptions(decimal: true),
                                        onChanged: (_) => setState(() {}),
                                        style: const TextStyle(fontSize: 13),
                                        decoration: InputDecoration(
                                          isDense: true,
                                          prefixText: '₹ ',
                                          hintText: 'Rate',
                                          contentPadding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
                                          enabledBorder: OutlineInputBorder(
                                            borderRadius: BorderRadius.circular(8),
                                            borderSide: BorderSide(
                                                color: (_rateOf(item.product.id)?.isNaN ?? false) ? Colors.red : Colors.grey.shade300),
                                          ),
                                          border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                                        ),
                                      ),
                                    ),
                                  ],
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
                                CartQtyField(
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

                // Summary + order button.
                //
                // Flexible, not a fixed-height Container. The Scaffold shrinks
                // the body by the keyboard's height, and while this panel
                // could not shrink, the Expanded list above absorbed the whole
                // loss — so the panel rode up over the quantity row being
                // edited. Letting it shrink and scroll instead keeps it on
                // screen and in place, without eating the list's space.
                Flexible(
                  child: SingleChildScrollView(
                    child: Container(
                      padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.06), blurRadius: 16, offset: const Offset(0, -4))],
                      ),
                      child: Column(
                        children: [
                          if (_forCustomer) ...[
                            Align(
                              alignment: Alignment.centerLeft,
                              child: Text('Order for', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: Colors.grey.shade600)),
                            ),
                            const SizedBox(height: 8),
                            InkWell(
                              onTap: _pickCustomer,
                              borderRadius: BorderRadius.circular(10),
                              child: Container(
                                width: double.infinity,
                                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 11),
                                decoration: BoxDecoration(
                                  color: _customer == null ? Colors.grey.shade50 : const Color(0xFFE6F7F7),
                                  borderRadius: BorderRadius.circular(10),
                                  border: Border.all(color: _customer == null ? Colors.grey.shade300 : const Color(0xFF00A6A4)),
                                ),
                                child: Row(children: [
                                  Icon(Icons.person_search, size: 20, color: _customer == null ? Colors.grey.shade600 : const Color(0xFF00807E)),
                                  const SizedBox(width: 10),
                                  Expanded(
                                    child: _customer == null
                                        ? Text('Choose the customer', style: TextStyle(fontSize: 14, color: Colors.grey.shade600))
                                        : Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                                            Text(_customerLabel(_customer!),
                                                style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: Color(0xFF1A1A1A))),
                                            if ('${_customer!['phone_number'] ?? ''}'.isNotEmpty)
                                              Text('${_customer!['phone_number']}', style: TextStyle(fontSize: 12, color: Colors.grey.shade700)),
                                          ]),
                                  ),
                                  Text(_customer == null ? 'Choose' : 'Change',
                                      style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: Color(0xFF00A6A4))),
                                ]),
                              ),
                            ),
                            const SizedBox(height: 8),
                            Builder(builder: (_) {
                              final total = items.fold<double>(0, (s, i) {
                                final r = _rateOf(i.product.id);
                                return s + (r == null || r.isNaN ? 0 : r * i.quantity);
                              });
                              return Align(
                                alignment: Alignment.centerRight,
                                child: Text('Total at these rates: ₹${total.toStringAsFixed(2)}',
                                    style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: Color(0xFF1A1A1A))),
                              );
                            }),
                            const SizedBox(height: 12),
                          ],
                          if (_canChoose && !_forCustomer) ...[
                            Align(
                              alignment: Alignment.centerLeft,
                              child: Text('Send this order to', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: Colors.grey.shade600)),
                            ),
                            const SizedBox(height: 8),
                            Row(
                              children: [
                                for (final d in const [('partner', 'My partner'), ('moulins', 'Moulins')]) ...[
                                  ChoiceChip(
                                    label: Text(d.$2),
                                    selected: _destination == d.$1,
                                    showCheckmark: false,
                                    selectedColor: const Color(0xFF00A6A4),
                                    labelStyle: TextStyle(color: _destination == d.$1 ? Colors.white : const Color(0xFF1A1A1A)),
                                    onSelected: (_) => setState(() => _destination = d.$1),
                                  ),
                                  const SizedBox(width: 8),
                                ],
                              ],
                            ),
                            const SizedBox(height: 12),
                          ],
                          // Transport and address are for orders to Moulins; a
                          // retailer's order goes to their partner.
                          if (_isRetailer)
                            Align(
                              alignment: Alignment.centerLeft,
                              child: Text('This order will be sent to your partner, who will confirm the rates.',
                                  style: TextStyle(fontSize: 13, color: Colors.grey.shade700)),
                            ),
                          if (!_isRetailer) ...[
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
                          ],
                      const SizedBox(height: 16),
                      // a staff order uses the customer's own address
                      if (!_isRetailer && !_forCustomer) ...[
                        _addressSummary(context),
                        const SizedBox(height: 16),
                      ],
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
                              : Text(_forCustomer ? 'Place order for customer' : 'Place Order',
                                  style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
                        ),
                      ),
                      ],
                    ),
                  ),
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

/// Search partners by name or phone; pops the chosen one
/// ({id, username, phone_number}).
class _CustomerPicker extends StatefulWidget {
  const _CustomerPicker();

  @override
  State<_CustomerPicker> createState() => _CustomerPickerState();
}

class _CustomerPickerState extends State<_CustomerPicker> {
  final _q = TextEditingController();
  Timer? _debounce;
  List<Map<String, dynamic>> _results = [];
  bool _loading = false;
  String? _error;
  int _req = 0;

  @override
  void dispose() {
    _debounce?.cancel();
    _q.dispose();
    super.dispose();
  }

  void _onChanged(String v) {
    _debounce?.cancel();
    if (v.trim().isEmpty) {
      setState(() => (_results = [], _loading = false, _error = null));
      return;
    }
    _debounce = Timer(const Duration(milliseconds: 300), () => _search(v.trim()));
  }

  Future<void> _search(String q) async {
    final req = ++_req;
    setState(() => (_loading = true, _error = null));
    try {
      final list = await AdminOrderService().searchCustomers(q);
      if (mounted && req == _req) setState(() => _results = list);
    } catch (_) {
      if (mounted && req == _req) setState(() => _error = 'Could not search. Check the connection and try again.');
    } finally {
      if (mounted && req == _req) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: SizedBox(
        height: MediaQuery.of(context).size.height * 0.7,
        child: Column(children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
            child: TextField(
              controller: _q,
              autofocus: true,
              onChanged: _onChanged,
              decoration: InputDecoration(
                hintText: 'Partner name or phone',
                prefixIcon: const Icon(Icons.search),
                isDense: true,
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
              ),
            ),
          ),
          if (_loading) const LinearProgressIndicator(minHeight: 2, color: Color(0xFF00A6A4)),
          Expanded(
            child: _error != null
                ? Center(child: Text(_error!, style: TextStyle(color: Colors.grey.shade700)))
                : _results.isEmpty
                    ? Center(
                        child: Text(_q.text.trim().isEmpty ? 'Type to search partners' : (_loading ? '' : 'No partner found'),
                            style: TextStyle(color: Colors.grey.shade600)))
                    : ListView.separated(
                        itemCount: _results.length,
                        separatorBuilder: (_, __) => const Divider(height: 1),
                        itemBuilder: (_, i) {
                          final c = _results[i];
                          final name = '${c['username'] ?? ''}'.trim();
                          final phone = '${c['phone_number'] ?? ''}';
                          return ListTile(
                            title: Text(name.isEmpty ? 'Unnamed partner' : name,
                                style: const TextStyle(fontWeight: FontWeight.w600)),
                            subtitle: phone.isEmpty ? null : Text(phone),
                            onTap: () => Navigator.of(context).pop(c),
                          );
                        },
                      ),
          ),
        ]),
      ),
    );
  }
}
