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

  Future<void> _load() async {
    try {
      final o = await OrderService().getOrder(widget.orderId);
      setState(() { _order = o; _loading = false; });
    } catch (e) {
      debugPrint('Order load error: $e');
      setState(() => _loading = false);
    }
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
    final role = ref.watch(authProvider).user?.role;
    final canAttachPhotos = role == 'employee' || role == 'admin';
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
                  child: Icon(Icons.local_shipping_outlined, color: _statusColor),
                ),
                const SizedBox(width: 14),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(o.statusLabel,
                        style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16, color: _statusColor)),
                    Text(dateStr,
                        style: TextStyle(fontSize: 13, color: Colors.grey.shade500)),
                  ],
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
                              Text('Qty: ${item.quantity}',
                                  style: TextStyle(fontSize: 12, color: Colors.grey.shade500)),
                            ],
                          ),
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
              if (canAttachPhotos)
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
                  onLongPress: canAttachPhotos ? () => _deletePhoto(photo.id) : null,
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
              if (canAttachPhotos)
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
                  onLongPress: canAttachPhotos ? () => _deletePhoto(photo.id, label: 'tracking image') : null,
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(8),
                    child: Image.network(photo.imageUrl, fit: BoxFit.cover),
                  ),
                );
              },
            ),
        ],
      )),
    );
  }

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
