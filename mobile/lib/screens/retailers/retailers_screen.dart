import 'package:flutter/material.dart';
import '../../models/retailer.dart';
import '../../services/retailer_service.dart';
import '../../utils/validators.dart';

/// Partner: their retailers. A retailer logs in with their phone number,
/// which is also their first password; they see the partner's products
/// (MRP only) and order from the partner.
class RetailersScreen extends StatefulWidget {
  const RetailersScreen({super.key});

  @override
  State<RetailersScreen> createState() => _RetailersScreenState();
}

class _RetailersScreenState extends State<RetailersScreen> {
  static const _teal = Color(0xFF00A6A4);
  final _service = RetailerService();
  List<Retailer>? _retailers;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final list = await _service.getRetailers();
      if (mounted)
        setState(() {
          _retailers = list;
          _error = null;
        });
    } catch (e) {
      if (mounted)
        setState(() {
          _retailers ??= [];
          _error = RetailerService.messageOf(e);
        });
    }
  }

  void _snack(String text, {bool error = false}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(text),
      backgroundColor: error ? Colors.red : _teal,
      behavior: SnackBarBehavior.floating,
    ));
  }

  // Add (existing null) or edit a retailer. The phone can't be changed: it is their login.
  Future<void> _showForm({Retailer? existing}) async {
    final nameCtrl = TextEditingController(text: existing?.name ?? '');
    final phoneCtrl = TextEditingController(text: existing?.phone ?? '');
    final shopCtrl = TextEditingController(text: existing?.shopName ?? '');
    final cityCtrl = TextEditingController(text: existing?.city ?? '');
    final addressCtrl = TextEditingController(text: existing?.address ?? '');
    String? error;
    bool saving = false;

    InputDecoration deco(String label, {String? hint}) => InputDecoration(
          labelText: label,
          hintText: hint,
          filled: true,
          fillColor: Colors.grey.shade50,
          border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(10), borderSide: BorderSide(color: Colors.grey.shade200)),
        );

    final saved = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (sheetCtx) => StatefulBuilder(
        builder: (sheetCtx, setSheet) => Padding(
          padding: EdgeInsets.fromLTRB(20, 20, 20, MediaQuery.of(sheetCtx).viewInsets.bottom + 20),
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(existing == null ? 'Add Retailer' : 'Edit Retailer',
                    style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                if (existing == null) ...[
                  const SizedBox(height: 6),
                  Text('The retailer will log in with this phone number, which is also their first password.',
                      style: TextStyle(fontSize: 12.5, color: Colors.grey.shade600)),
                ],
                const SizedBox(height: 16),
                TextField(
                    controller: nameCtrl,
                    decoration: deco('Contact name'),
                    textCapitalization: TextCapitalization.words),
                const SizedBox(height: 12),
                TextField(
                  controller: phoneCtrl,
                  enabled: existing == null,
                  keyboardType: TextInputType.phone,
                  decoration: deco('Mobile number', hint: '10-digit mobile number'),
                ),
                const SizedBox(height: 12),
                TextField(
                    controller: shopCtrl,
                    decoration: deco('Shop name (optional)'),
                    textCapitalization: TextCapitalization.words),
                const SizedBox(height: 12),
                TextField(
                    controller: cityCtrl,
                    decoration: deco('City (optional)'),
                    textCapitalization: TextCapitalization.words),
                const SizedBox(height: 12),
                TextField(controller: addressCtrl, decoration: deco('Address (optional)'), maxLines: 2),
                if (error != null) ...[
                  const SizedBox(height: 10),
                  Text(error!, style: const TextStyle(color: Colors.red, fontSize: 12.5)),
                ],
                const SizedBox(height: 18),
                SizedBox(
                  width: double.infinity,
                  height: 48,
                  child: ElevatedButton(
                    onPressed: saving
                        ? null
                        : () async {
                            final name = nameCtrl.text.trim();
                            if (name.isEmpty) {
                              setSheet(() => error = "Please enter the retailer's name.");
                              return;
                            }
                            String? phone;
                            if (existing == null) {
                              phone = Validators.normalizePhone(phoneCtrl.text);
                              if (phone == null) {
                                setSheet(() => error = Validators.phoneError(phoneCtrl.text));
                                return;
                              }
                            }
                            setSheet(() {
                              saving = true;
                              error = null;
                            });
                            try {
                              final shop = shopCtrl.text.trim(),
                                  city = cityCtrl.text.trim(),
                                  addr = addressCtrl.text.trim();
                              if (existing == null) {
                                await _service.addRetailer(
                                    name: name, phone: phone!, shopName: shop, city: city, address: addr);
                              } else {
                                await _service.updateRetailer(existing.id,
                                    name: name, shopName: shop, city: city, address: addr);
                              }
                              if (sheetCtx.mounted) Navigator.pop(sheetCtx, true);
                            } catch (e) {
                              setSheet(() {
                                saving = false;
                                error = RetailerService.messageOf(e);
                              });
                            }
                          },
                    style: ElevatedButton.styleFrom(
                      backgroundColor: _teal,
                      foregroundColor: Colors.white,
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                      elevation: 0,
                    ),
                    child: saving
                        ? const SizedBox(
                            width: 20,
                            height: 20,
                            child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                        : Text(existing == null ? 'Add Retailer' : 'Save'),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
    if (saved == true) {
      _snack(existing == null ? 'The retailer has been added.' : "The retailer's details have been updated.");
      _load();
    }
  }

  Future<bool> _confirm(String title, String body, String action, {bool danger = false}) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(title),
        content: Text(body),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: Text(action, style: TextStyle(color: danger ? Colors.red : _teal)),
          ),
        ],
      ),
    );
    return ok == true;
  }

  Future<void> _menu(Retailer r) async {
    final choice = await showModalBottomSheet<String>(
      context: context,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (ctx) => SafeArea(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          ListTile(
              title: Text(r.displayName, style: const TextStyle(fontWeight: FontWeight.w600)), subtitle: Text(r.phone)),
          ListTile(
              leading: const Icon(Icons.edit_outlined),
              title: const Text('Edit details'),
              onTap: () => Navigator.pop(ctx, 'edit')),
          ListTile(
            leading: const Icon(Icons.lock_reset),
            title: const Text('Reset password'),
            subtitle: const Text('Back to their phone number'),
            onTap: () => Navigator.pop(ctx, 'reset'),
          ),
          ListTile(
            leading: const Icon(Icons.person_remove_outlined, color: Colors.red),
            title: const Text('Remove retailer', style: TextStyle(color: Colors.red)),
            onTap: () => Navigator.pop(ctx, 'remove'),
          ),
        ]),
      ),
    );
    if (!mounted) return;
    try {
      if (choice == 'edit') await _showForm(existing: r);
      if (choice == 'reset' &&
          await _confirm('Reset password?',
              "${r.displayName}'s password will be reset to their phone number, ${r.phone}.", 'Reset')) {
        await _service.resetPassword(r.id);
        _snack("The password has been reset to the retailer's phone number.");
      }
      if (choice == 'remove' &&
          await _confirm(
              'Remove retailer?',
              '${r.displayName} will no longer be able to log in or place orders. Their past orders will be kept.',
              'Remove',
              danger: true)) {
        await _service.removeRetailer(r.id);
        _snack('The retailer has been removed.');
        _load();
      }
    } catch (e) {
      _snack(RetailerService.messageOf(e), error: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final list = _retailers;
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        foregroundColor: Colors.black,
        title: const Text('My Retailers', style: TextStyle(fontWeight: FontWeight.w600)),
        actions: [
          IconButton(
              icon: const Icon(Icons.person_add_alt_outlined, color: _teal),
              tooltip: 'Add retailer',
              onPressed: () => _showForm())
        ],
      ),
      body: list == null
          ? const Center(child: CircularProgressIndicator(color: _teal))
          : RefreshIndicator(
              onRefresh: _load,
              color: _teal,
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  if (_error != null)
                    Padding(
                        padding: const EdgeInsets.only(bottom: 12),
                        child: Text(_error!, style: const TextStyle(color: Colors.red))),
                  if (list.isEmpty && _error == null)
                    Padding(
                      padding: const EdgeInsets.only(top: 80),
                      child: Column(children: [
                        Icon(Icons.storefront_outlined, size: 64, color: Colors.grey.shade300),
                        const SizedBox(height: 14),
                        const Text('No retailers yet', style: TextStyle(color: Colors.grey, fontSize: 16)),
                        const SizedBox(height: 6),
                        Text('Add the shops you supply. They can then order from you in the app.',
                            textAlign: TextAlign.center, style: TextStyle(color: Colors.grey.shade500, fontSize: 13)),
                        const SizedBox(height: 12),
                        TextButton.icon(
                          icon: const Icon(Icons.add, color: _teal),
                          label: const Text('Add a retailer', style: TextStyle(color: _teal)),
                          onPressed: () => _showForm(),
                        ),
                      ]),
                    ),
                  ...list.map((r) => Container(
                        margin: const EdgeInsets.only(bottom: 10),
                        decoration: BoxDecoration(
                            border: Border.all(color: Colors.grey.shade200), borderRadius: BorderRadius.circular(12)),
                        child: ListTile(
                          onTap: () => _menu(r),
                          leading: CircleAvatar(
                            backgroundColor: _teal.withAlpha(25),
                            child: const Icon(Icons.storefront_outlined, color: _teal),
                          ),
                          title: Text(r.displayName, style: const TextStyle(fontWeight: FontWeight.w600)),
                          subtitle: Text(
                            [
                              if (r.shopName != null && r.shopName!.isNotEmpty) r.name,
                              r.phone,
                              if (r.city != null) r.city!
                            ].join(' · '),
                            style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
                          ),
                          trailing: Text('${r.orderCount} order${r.orderCount == 1 ? '' : 's'}',
                              style: TextStyle(fontSize: 12, color: Colors.grey.shade500)),
                        ),
                      )),
                ],
              ),
            ),
    );
  }
}
