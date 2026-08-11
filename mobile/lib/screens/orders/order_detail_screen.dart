import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:http/http.dart' as http;
import '../../models/order.dart';
import '../../services/order_service.dart';
import '../../providers/auth_provider.dart';
import 'package:intl/intl.dart';
import '../../utils/responsive.dart';

class OrderDetailScreen extends ConsumerStatefulWidget {
  final String orderId;
  const OrderDetailScreen({super.key, required this.orderId});

  @override
  ConsumerState<OrderDetailScreen> createState() => _OrderDetailScreenState();
}

class _OrderDetailScreenState extends ConsumerState<OrderDetailScreen> {
  static const teal = Color(0xFF00A6A4);
  Order? _order;
  bool _loading = true;
  bool _uploadingPhoto = false;
  bool _uploadingTracking = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  bool _updatingStatus = false;
  String? _busyItemId;

  Future<void> _load() async {
    try {
      final o = await OrderService().getOrder(widget.orderId);
      setState(() { _order = o; _loading = false; });
    } catch (e) {
      debugPrint('Order load error: $e');
      setState(() => _loading = false);
    }
  }

  Future<bool> _confirm(String title, String message, {String confirmLabel = 'Confirm', bool danger = false}) async {
    final result = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(title),
        content: Text(message),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: Text(confirmLabel, style: TextStyle(color: danger ? Colors.red : teal)),
          ),
        ],
      ),
    );
    return result == true;
  }

  Future<void> _changeStatus(String newStatus) async {
    if (_order == null || newStatus == _order!.status) return;
    final ok = await _confirm(
      'Change order status?',
      'Status will change from "${_order!.statusLabel}" to "${_statusLabel(newStatus)}". The partner will see this update immediately.',
      confirmLabel: 'Change Status',
    );
    if (!ok) return;

    setState(() => _updatingStatus = true);
    try {
      await OrderService().updateStatus(widget.orderId, newStatus);
      await _load();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Status updated'), backgroundColor: Colors.green),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Could not update status: $e'), backgroundColor: Colors.red),
        );
      }
    } finally {
      if (mounted) setState(() => _updatingStatus = false);
    }
  }

  Future<void> _changeQuantity(OrderItem item, int newQty) async {
    if (newQty < 1) return;
    final ok = await _confirm(
      'Change quantity?',
      'Quantity of "${item.productName}" will change from ${item.quantity} to $newQty.',
      confirmLabel: 'Update Quantity',
    );
    if (!ok) return;

    setState(() => _busyItemId = item.id);
    try {
      await OrderService().updateItemQuantity(widget.orderId, item.id, newQty);
      await _load();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Could not update quantity: $e'), backgroundColor: Colors.red),
        );
      }
    } finally {
      if (mounted) setState(() => _busyItemId = null);
    }
  }

  Future<void> _removeItem(OrderItem item) async {
    final ok = await _confirm(
      'Remove item?',
      '"${item.productName}" will be permanently removed from this order.',
      confirmLabel: 'Remove',
      danger: true,
    );
    if (!ok) return;

    setState(() => _busyItemId = item.id);
    try {
      await OrderService().deleteItem(widget.orderId, item.id);
      await _load();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Could not remove item: $e'), backgroundColor: Colors.red),
        );
      }
    } finally {
      if (mounted) setState(() => _busyItemId = null);
    }
  }

  static const _statusOptions = ['pending', 'confirmed', 'transferred', 'shipped', 'delivered', 'cancelled', 'refunded'];

  String _statusLabel(String s) => s.isEmpty ? s : '${s[0].toUpperCase()}${s.substring(1)}';

  Future<void> _pickStatus(String current) async {
    final chosen = await showModalBottomSheet<String>(
      context: context,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Padding(
              padding: EdgeInsets.fromLTRB(20, 20, 20, 8),
              child: Align(
                alignment: Alignment.centerLeft,
                child: Text('Change Order Status', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
              ),
            ),
            ..._statusOptions.map((s) => RadioListTile<String>(
                  value: s,
                  groupValue: current,
                  activeColor: teal,
                  title: Text(_statusLabel(s)),
                  onChanged: (v) => Navigator.pop(ctx, v),
                )),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
    if (chosen != null) _changeStatus(chosen);
  }

  Future<ImageSource?> _pickSource() {
    return showModalBottomSheet<ImageSource>(
      context: context,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(16))),
      builder: (_) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.camera_alt_outlined, color: teal),
              title: const Text('Take Photo'),
              onTap: () => Navigator.pop(context, ImageSource.camera),
            ),
            ListTile(
              leading: const Icon(Icons.photo_library_outlined, color: teal),
              title: const Text('Choose from Gallery'),
              onTap: () => Navigator.pop(context, ImageSource.gallery),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _uploadPhoto() async {
    final source = await _pickSource();
    if (source == null) return;
    final file = await ImagePicker().pickImage(source: source, imageQuality: 80);
    if (file == null) return;

    setState(() => _uploadingPhoto = true);
    try {
      final urls = await OrderService().getPhotoUploadUrl(file.name);
      final bytes = await File(file.path).readAsBytes();
      await http.put(Uri.parse(urls['upload_url']!), body: bytes, headers: {'Content-Type': 'image/jpeg'});
      await OrderService().addOrderPhoto(widget.orderId, urls['key']!);
      await _load();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Bill photo attached'), backgroundColor: Colors.green),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to upload photo: $e'), backgroundColor: Colors.red),
        );
      }
    } finally {
      if (mounted) setState(() => _uploadingPhoto = false);
    }
  }

  Future<void> _uploadTrackingImage() async {
    final source = await _pickSource();
    if (source == null) return;
    final file = await ImagePicker().pickImage(source: source, imageQuality: 80);
    if (file == null) return;

    setState(() => _uploadingTracking = true);
    try {
      final urls = await OrderService().getTrackingUploadUrl(widget.orderId, file.name);
      final bytes = await File(file.path).readAsBytes();
      await http.put(Uri.parse(urls['upload_url']!), body: bytes, headers: {'Content-Type': 'image/jpeg'});
      await OrderService().addOrderPhoto(widget.orderId, urls['key']!, photoType: 'tracking');
      await _load();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Tracking image attached'), backgroundColor: Colors.green),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to upload tracking image: $e'), backgroundColor: Colors.red),
        );
      }
    } finally {
      if (mounted) setState(() => _uploadingTracking = false);
    }
  }

  Future<void> _deletePhoto(String photoId, {String label = 'bill photo'}) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Remove photo?'),
        content: Text('This $label will be permanently removed.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          TextButton(onPressed: () => Navigator.pop(context, true), child: const Text('Remove', style: TextStyle(color: Colors.red))),
        ],
      ),
    );
    if (confirm != true) return;

    try {
      await OrderService().deleteOrderPhoto(photoId);
      await _load();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to remove photo: $e'), backgroundColor: Colors.red),
        );
      }
    }
  }

  Color get _statusColor {
    switch (_order?.status) {
      case 'delivered': return Colors.green;
      case 'shipped': return Colors.blue;
      case 'cancelled': return Colors.red;
      default: return teal;
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Scaffold(body: Center(child: CircularProgressIndicator(color: teal)));
    if (_order == null) return Scaffold(appBar: AppBar(), body: const Center(child: Text('Order not found')));

    final o = _order!;
    final user = ref.watch(authProvider).user;
    final role = user?.role;
    final canAttachPhotos = role == 'employee' || role == 'admin';
    final canEditOrder = role == 'admin' || (user?.permissions.contains('orders_edit') ?? false);
    final billPhotos = o.photos.where((p) => p.photoType == 'bill').toList();
    final trackingPhotos = o.photos.where((p) => p.photoType == 'tracking').toList();

    String dateStr = '';
    try {
      dateStr = DateFormat('d MMM yyyy, h:mm a').format(DateTime.parse(o.createdAt));
    } catch (_) {}

    return Scaffold(
      backgroundColor: Colors.grey.shade50,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        foregroundColor: Colors.black,
        title: Text('Order #${o.id.substring(0, 8).toUpperCase()}',
            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
      ),
      body: ResponsiveCenter(child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Status card
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12)),
            child: Row(
              children: [
                Container(
                  width: 48, height: 48,
                  decoration: BoxDecoration(
                      color: _statusColor.withValues(alpha: 0.1),
                      shape: BoxShape.circle),
                  child: _updatingStatus
                      ? const Padding(padding: EdgeInsets.all(14), child: CircularProgressIndicator(strokeWidth: 2, color: teal))
                      : Icon(Icons.local_shipping_outlined, color: _statusColor),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(o.statusLabel,
                          style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16, color: _statusColor)),
                      Text(dateStr,
                          style: TextStyle(fontSize: 13, color: Colors.grey.shade500)),
                    ],
                  ),
                ),
                if (canEditOrder)
                  TextButton(
                    onPressed: _updatingStatus ? null : () => _pickStatus(o.status),
                    child: const Text('Change', style: TextStyle(color: teal, fontWeight: FontWeight.w600)),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 12),

          if (o.trackingNumber != null) _infoCard('Tracking Number', o.trackingNumber!),
          if (o.expectedDelivery != null) _infoCard('Expected Delivery', o.expectedDelivery!),
          if (o.notes != null && o.notes!.isNotEmpty) _infoCard('Notes', o.notes!),

          const SizedBox(height: 12),

          if (o.items.isNotEmpty) ...[
            const Text('Items', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 15)),
            const SizedBox(height: 10),
            Container(
              decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12)),
              child: Column(
                children: o.items.asMap().entries.map((entry) {
                  final item = entry.value;
                  return Container(
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      border: entry.key < o.items.length - 1
                          ? Border(bottom: BorderSide(color: Colors.grey.shade100))
                          : null,
                    ),
                    child: Row(
                      children: [
                        Container(
                          width: 44, height: 44,
                          decoration: BoxDecoration(
                              color: Colors.grey.shade100,
                              borderRadius: BorderRadius.circular(8)),
                          child: const Icon(Icons.medication_outlined, color: Colors.grey, size: 20),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(item.productName,
                                  style: const TextStyle(fontWeight: FontWeight.w500, fontSize: 14)),
                              if (!canEditOrder)
                                Text('Qty: ${item.quantity}',
                                    style: TextStyle(fontSize: 12, color: Colors.grey.shade500)),
                            ],
                          ),
                        ),
                        if (canEditOrder)
                          _busyItemId == item.id
                              ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: teal))
                              : Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    _qtyBtn(Icons.remove, item.quantity > 1 ? () => _changeQuantity(item, item.quantity - 1) : null),
                                    Padding(
                                      padding: const EdgeInsets.symmetric(horizontal: 8),
                                      child: Text('${item.quantity}', style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
                                    ),
                                    _qtyBtn(Icons.add, () => _changeQuantity(item, item.quantity + 1)),
                                    IconButton(
                                      icon: const Icon(Icons.delete_outline, color: Colors.red, size: 20),
                                      onPressed: () => _removeItem(item),
                                      tooltip: 'Remove item',
                                    ),
                                  ],
                                ),
                      ],
                    ),
                  );
                }).toList(),
              ),
            ),
          ] else ...[
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12)),
              child: Text(
                '${o.itemCount} item${o.itemCount != 1 ? 's' : ''} in this order',
                style: TextStyle(color: Colors.grey.shade600),
              ),
            ),
          ],

          const SizedBox(height: 20),

          // Bill photos
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text('Bill Photos (${billPhotos.length})',
                  style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15)),
              if (canEditOrder)
                TextButton.icon(
                  onPressed: _uploadingPhoto ? null : _uploadPhoto,
                  icon: _uploadingPhoto
                      ? const SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2, color: teal))
                      : const Icon(Icons.add_a_photo_outlined, size: 18, color: teal),
                  label: Text(_uploadingPhoto ? 'Uploading...' : 'Add Photo', style: const TextStyle(color: teal)),
                ),
            ],
          ),
          const SizedBox(height: 10),

          if (billPhotos.isEmpty)
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12)),
              child: Text('No bill photos attached yet', style: TextStyle(color: Colors.grey.shade400, fontSize: 13)),
            )
          else
            GridView.builder(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 3,
                crossAxisSpacing: 8,
                mainAxisSpacing: 8,
              ),
              itemCount: billPhotos.length,
              itemBuilder: (context, i) {
                final photo = billPhotos[i];
                return GestureDetector(
                  onTap: () => showDialog(
                    context: context,
                    builder: (_) => Dialog(
                      child: InteractiveViewer(child: Image.network(photo.imageUrl)),
                    ),
                  ),
                  onLongPress: canEditOrder ? () => _deletePhoto(photo.id) : null,
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(8),
                    child: Image.network(photo.imageUrl, fit: BoxFit.cover),
                  ),
                );
              },
            ),

          const SizedBox(height: 20),

          // Tracking image
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text('Tracking Image (${trackingPhotos.length})',
                  style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15)),
              if (canEditOrder)
                TextButton.icon(
                  onPressed: _uploadingTracking ? null : _uploadTrackingImage,
                  icon: _uploadingTracking
                      ? const SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2, color: teal))
                      : const Icon(Icons.add_a_photo_outlined, size: 18, color: teal),
                  label: Text(_uploadingTracking ? 'Uploading...' : 'Add Image', style: const TextStyle(color: teal)),
                ),
            ],
          ),
          const SizedBox(height: 10),

          if (trackingPhotos.isEmpty)
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12)),
              child: Text('No tracking image attached yet', style: TextStyle(color: Colors.grey.shade400, fontSize: 13)),
            )
          else
            GridView.builder(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 3,
                crossAxisSpacing: 8,
                mainAxisSpacing: 8,
              ),
              itemCount: trackingPhotos.length,
              itemBuilder: (context, i) {
                final photo = trackingPhotos[i];
                return GestureDetector(
                  onTap: () => showDialog(
                    context: context,
                    builder: (_) => Dialog(
                      child: InteractiveViewer(child: Image.network(photo.imageUrl)),
                    ),
                  ),
                  onLongPress: canEditOrder ? () => _deletePhoto(photo.id, label: 'tracking image') : null,
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(8),
                    child: Image.network(photo.imageUrl, fit: BoxFit.cover),
                  ),
                );
              },
            ),

          if (canAttachPhotos && o.events.isNotEmpty) ...[
            const SizedBox(height: 20),
            Theme(
              data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
              child: Container(
                decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12)),
                clipBehavior: Clip.antiAlias,
                child: ExpansionTile(
                  initiallyExpanded: false,
                  tilePadding: const EdgeInsets.symmetric(horizontal: 14),
                  childrenPadding: const EdgeInsets.only(left: 14, right: 14, bottom: 8),
                  expandedAlignment: Alignment.centerLeft,
                  expandedCrossAxisAlignment: CrossAxisAlignment.start,
                  title: const Text('Activity Log', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 15)),
                  children: List.generate(o.events.length, (i) {
                    final events = o.events.reversed.toList();
                    final event = events[i];
                    String when = event.createdAt;
                    try {
                      when = DateFormat('d MMM, h:mm a').format(DateTime.parse(event.createdAt));
                    } catch (_) {}
                    return Container(
                      width: double.infinity,
                      padding: const EdgeInsets.symmetric(vertical: 10),
                      decoration: BoxDecoration(
                        border: i < events.length - 1
                            ? Border(bottom: BorderSide(color: Colors.grey.shade100))
                            : null,
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(event.description, textAlign: TextAlign.left, style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w500)),
                          const SizedBox(height: 3),
                          Text(
                            [
                              when,
                              if (event.actorName != null && event.actorName!.isNotEmpty)
                                'by ${event.actorName}${event.actorRole != null && event.actorRole!.isNotEmpty ? ' (${event.actorRole})' : ''}',
                            ].join(' · '),
                            textAlign: TextAlign.left,
                            style: TextStyle(fontSize: 11.5, color: Colors.grey.shade500),
                          ),
                        ],
                      ),
                    );
                  }),
                ),
              ),
            ),
          ],
        ],
      )),
    );
  }

  Widget _qtyBtn(IconData icon, VoidCallback? onTap) => GestureDetector(
        onTap: onTap,
        child: Container(
          width: 26, height: 26,
          decoration: BoxDecoration(
            color: onTap == null ? Colors.grey.shade100 : const Color(0xFFE8F8F8),
            borderRadius: BorderRadius.circular(7),
          ),
          child: Icon(icon, size: 15, color: onTap == null ? Colors.grey.shade400 : teal),
        ),
      );

  Widget _infoCard(String label, String value) => Container(
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12)),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(label, style: TextStyle(fontSize: 13, color: Colors.grey.shade600)),
            Flexible(
              child: Text(value,
                  style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500),
                  textAlign: TextAlign.end),
            ),
          ],
        ),
      );
}
