import 'dart:convert';
import 'dart:typed_data';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import '../config/api.dart';
import 'scraped_details.dart';

// GST and drug-licence checks against the government portals (through the
// backend's gst-lookup / dl-lookup), shared by the partner's own profile
// and their retailers' documents. Each returns the portal's details via
// Navigator.pop when confirmed, or null if dismissed.

// Verifying a GSTIN means solving a live captcha against the government
// portal each time — there's no way to skip straight to the result. Returns
// the scraped details map via Navigator.pop when confirmed, or null if
// dismissed.
class GstVerifyDialog extends StatefulWidget {
  final String gstin;
  const GstVerifyDialog({required this.gstin});

  @override
  State<GstVerifyDialog> createState() => _GstVerifyDialogState();
}

class _GstVerifyDialogState extends State<GstVerifyDialog> {
  static const teal = Color(0xFF00A6A4);
  String _step = 'loading'; // loading | captcha | result | error
  String? _sessionId;
  String? _captchaImage;
  final _captchaCtrl = TextEditingController();
  bool _submitting = false;
  String _error = '';
  Map<String, dynamic>? _details;

  @override
  void initState() {
    super.initState();
    _fetchCaptcha();
  }

  @override
  void dispose() {
    _captchaCtrl.dispose();
    super.dispose();
  }

  Future<void> _fetchCaptcha() async {
    setState(() { _step = 'loading'; _error = ''; _captchaCtrl.clear(); });
    try {
      final resp = await createDio().get('$baseUrl/gst-lookup/captcha');
      setState(() {
        _sessionId = resp.data['sessionId'];
        _captchaImage = resp.data['image'];
        _step = 'captcha';
      });
    } catch (e) {
      setState(() { _error = _describeGstError(e, 'Could not load captcha.'); _step = 'error'; });
    }
  }

  Future<void> _submitCaptcha() async {
    if (_captchaCtrl.text.trim().isEmpty) return;
    setState(() { _submitting = true; _error = ''; });
    try {
      final resp = await createDio().post('$baseUrl/gst-lookup/details', data: {
        'session_id': _sessionId,
        'gstin': widget.gstin,
        'captcha': _captchaCtrl.text.trim(),
      });
      final data = Map<String, dynamic>.from(resp.data as Map);
      if (data['error'] != null) throw Exception(data['error']);
      setState(() { _details = data; _step = 'result'; });
    } catch (e) {
      setState(() { _error = _describeGstError(e, 'Could not verify this GSTIN. Please check the captcha and try again.'); _step = 'error'; });
    } finally {
      setState(() => _submitting = false);
    }
  }

  // Surfaces the real reason a GST lookup call failed instead of always
  // showing the same generic message — a live scrape against the
  // government portal can time out, get rate-limited, or come back with a
  // specific error from the portal itself, and "captcha was wrong" was
  // previously indistinguishable from all of those.
  String _describeGstError(Object e, String fallback) {
    if (e is DioException) {
      if (e.type == DioExceptionType.connectionTimeout || e.type == DioExceptionType.receiveTimeout || e.type == DioExceptionType.sendTimeout) {
        return 'The GST portal is taking too long to respond. Please try again.';
      }
      final serverError = e.response?.data is Map ? (e.response?.data as Map)['error'] : null;
      if (serverError is String && serverError.isNotEmpty) return serverError;
      if (e.response?.statusCode == 502) return 'The GST lookup service is temporarily unavailable. Please try again shortly.';
    }
    return fallback;
  }

  Uint8List? get _captchaBytes {
    final img = _captchaImage;
    if (img == null) return null;
    final comma = img.indexOf(',');
    final b64 = comma >= 0 ? img.substring(comma + 1) : img;
    try {
      return base64Decode(b64);
    } catch (_) {
      return null;
    }
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Verify GSTIN'),
      content: SizedBox(
        width: 320,
        child: switch (_step) {
          'loading' => const Padding(padding: EdgeInsets.symmetric(vertical: 24), child: Center(child: CircularProgressIndicator())),
          'captcha' => Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Enter the code shown below to fetch details for ${widget.gstin}.', style: const TextStyle(fontSize: 13)),
                const SizedBox(height: 12),
                if (_captchaBytes != null)
                  Center(child: Image.memory(_captchaBytes!, height: 60)),
                const SizedBox(height: 8),
                Center(
                  child: TextButton(onPressed: _fetchCaptcha, child: const Text("Can't read it? Get a new one", style: TextStyle(fontSize: 12, color: teal))),
                ),
                TextField(
                  controller: _captchaCtrl,
                  autofocus: true,
                  decoration: InputDecoration(
                    hintText: 'Enter captcha',
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                    contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                  ),
                ),
              ],
            ),
          'error' => Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [Text(_error, style: const TextStyle(color: Colors.red, fontSize: 13))],
            ),
          'result' => Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(color: Colors.green.shade50, borderRadius: BorderRadius.circular(8)),
                  child: const Text('GSTIN found — please check the details below', style: TextStyle(fontSize: 12, color: Colors.green, fontWeight: FontWeight.w600)),
                ),
                const SizedBox(height: 8),
                if (_details?['lgnm'] != null) Text('Legal Name: ${_details!['lgnm']}', style: const TextStyle(fontSize: 13)),
                if (_details?['tradeNam'] != null) Text('Trade Name: ${_details!['tradeNam']}', style: const TextStyle(fontSize: 13)),
                if (_details?['sts'] != null) Text('Status: ${_details!['sts']}', style: const TextStyle(fontSize: 13)),
                if (_details?['ctb'] != null) Text('Business Type: ${_details!['ctb']}', style: const TextStyle(fontSize: 13)),
                if (_details?['rgdt'] != null) Text('Registered: ${_details!['rgdt']}', style: const TextStyle(fontSize: 13)),
                if ((_details?['pradr'] as Map?)?['adr'] != null) Text('Address: ${(_details!['pradr'] as Map)['adr']}', style: const TextStyle(fontSize: 13)),
              ],
            ),
          _ => const SizedBox.shrink(),
        },
      ),
      actions: switch (_step) {
        'captcha' => [
            TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Cancel')),
            ElevatedButton(
              onPressed: _submitting ? null : _submitCaptcha,
              style: ElevatedButton.styleFrom(backgroundColor: teal, foregroundColor: Colors.white),
              child: _submitting
                  ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                  : const Text('Fetch Details'),
            ),
          ],
        'error' => [
            TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Cancel')),
            ElevatedButton(onPressed: _fetchCaptcha, style: ElevatedButton.styleFrom(backgroundColor: teal, foregroundColor: Colors.white), child: const Text('Try Again')),
          ],
        'result' => [
            TextButton(onPressed: _fetchCaptcha, child: const Text('Re-check')),
            ElevatedButton(
              onPressed: () => Navigator.of(context).pop(_details),
              style: ElevatedButton.styleFrom(backgroundColor: teal, foregroundColor: Colors.white),
              child: const Text('Looks good, continue'),
            ),
          ],
        _ => [],
      },
    );
  }
}

// Unlike GST, the drug-license portal has no captcha step — a single lookup
// call. Returns the scraped details map via Navigator.pop when confirmed.
class DlVerifyDialog extends StatefulWidget {
  final String licenseNo;
  const DlVerifyDialog({required this.licenseNo});

  @override
  State<DlVerifyDialog> createState() => _DlVerifyDialogState();
}

class _DlVerifyDialogState extends State<DlVerifyDialog> {
  static const teal = Color(0xFF00A6A4);
  String _status = 'loading'; // loading | result | error
  String _error = '';
  Map<String, dynamic>? _details;

  @override
  void initState() {
    super.initState();
    _fetch();
  }

  Future<void> _fetch() async {
    setState(() { _status = 'loading'; _error = ''; });
    try {
      final resp = await createDio().get('$baseUrl/dl-lookup/details', queryParameters: {'license_no': widget.licenseNo});
      final data = Map<String, dynamic>.from(resp.data as Map);
      if (data['error'] != null) throw Exception(data['error']);
      setState(() { _details = data; _status = 'result'; });
    } catch (e) {
      setState(() { _error = 'Could not verify this license number. Please try again.'; _status = 'error'; });
    }
  }

  @override
  Widget build(BuildContext context) {
    final techPersons = (_details?['tech_persons'] as List?) ?? [];
    return AlertDialog(
      title: const Text('Verify Drug License'),
      content: SizedBox(
        width: 320,
        child: switch (_status) {
          'loading' => Padding(
              padding: const EdgeInsets.symmetric(vertical: 24),
              child: Center(child: Text('Looking up ${widget.licenseNo}...', style: const TextStyle(fontSize: 13))),
            ),
          'error' => Text(_error, style: const TextStyle(color: Colors.red, fontSize: 13)),
          'result' => Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(color: Colors.green.shade50, borderRadius: BorderRadius.circular(8)),
                  child: const Text('License found — please check the details below', style: TextStyle(fontSize: 12, color: Colors.green, fontWeight: FontWeight.w600)),
                ),
                const SizedBox(height: 8),
                if (_details?['str_ondls_licence_no'] != null) Text('License No: ${_details!['str_ondls_licence_no']}', style: const TextStyle(fontSize: 13)),
                if (_details?['licence_form_no'] != null) Text('Form: ${_details!['licence_form_no']}', style: const TextStyle(fontSize: 13)),
                if (_details?['institute_name'] != null) Text('Firm Name: ${_details!['institute_name']}', style: const TextStyle(fontSize: 13)),
                if (_details?['licence_status'] != null) Text('Status: ${_details!['licence_status']}', style: const TextStyle(fontSize: 13)),
                if (_details?['dt_curr_validity_date'] != null) Text('Valid Until: ${_details!['dt_curr_validity_date']}', style: const TextStyle(fontSize: 13)),
                if (_details?['full_address'] != null) Text('Address: ${_details!['full_address']}', style: const TextStyle(fontSize: 13)),
                if (techPersons.isNotEmpty)
                  Text('Technical Person: ${techPersons.map((t) => t['techname']).join(', ')}', style: const TextStyle(fontSize: 13)),
              ],
            ),
          _ => const SizedBox.shrink(),
        },
      ),
      actions: switch (_status) {
        'error' => [
            TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Cancel')),
            ElevatedButton(onPressed: _fetch, style: ElevatedButton.styleFrom(backgroundColor: teal, foregroundColor: Colors.white), child: const Text('Try Again')),
          ],
        'result' => [
            TextButton(onPressed: _fetch, child: const Text('Re-check')),
            ElevatedButton(
              onPressed: () => Navigator.of(context).pop(_details),
              style: ElevatedButton.styleFrom(backgroundColor: teal, foregroundColor: Colors.white),
              child: const Text('Looks good, continue'),
            ),
          ],
        _ => [],
      },
    );
  }
}

