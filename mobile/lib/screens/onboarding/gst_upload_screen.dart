import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../providers/onboarding_provider.dart';
import '../../utils/responsive.dart';

class GSTUploadScreen extends ConsumerStatefulWidget {
  const GSTUploadScreen({super.key});

  @override
  ConsumerState<GSTUploadScreen> createState() => _GSTUploadScreenState();
}

class _GSTUploadScreenState extends ConsumerState<GSTUploadScreen> {
  final _gstNumberCtrl = TextEditingController();
  final _photoUrlCtrl = TextEditingController();
  bool _uploading = false;

  @override
  void dispose() {
    _gstNumberCtrl.dispose();
    _photoUrlCtrl.dispose();
    super.dispose();
  }

  Future<void> _uploadGST() async {
    if (_gstNumberCtrl.text.isEmpty || _photoUrlCtrl.text.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please fill in all fields')),
      );
      return;
    }

    setState(() => _uploading = true);
    try {
      await ref.read(onboardingProvider.notifier).uploadGST(
        gstNumber: _gstNumberCtrl.text,
        photoUrl: _photoUrlCtrl.text,
      );
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('GST certificate uploaded successfully')),
        );
        Navigator.pop(context);
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _uploading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Upload GST Certificate'),
        backgroundColor: Colors.white,
        foregroundColor: Colors.black,
        elevation: 0,
      ),
      body: ResponsiveCenter(child: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Info box
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.blue.shade50,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: Colors.blue.shade200),
              ),
              child: const Text(
                'Please upload a clear photo of your GST certificate and enter your GST number below.',
                style: TextStyle(fontSize: 13, color: Colors.blue),
              ),
            ),
            const SizedBox(height: 24),

            // Photo URL
            const Text('GST Photo URL', style: TextStyle(fontWeight: FontWeight.bold)),
            const SizedBox(height: 8),
            TextField(
              controller: _photoUrlCtrl,
              decoration: InputDecoration(
                hintText: 'https://example.com/gst.jpg',
                filled: true,
                fillColor: Colors.grey.shade50,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8),
                  borderSide: BorderSide(color: Colors.grey.shade300),
                ),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8),
                  borderSide: BorderSide(color: Colors.grey.shade300),
                ),
              ),
            ),
            const SizedBox(height: 20),

            // GST Number
            const Text('GST Number', style: TextStyle(fontWeight: FontWeight.bold)),
            const SizedBox(height: 8),
            TextField(
              controller: _gstNumberCtrl,
              decoration: InputDecoration(
                hintText: 'Enter your GST number (e.g., 27AAPCT1234H1Z0)',
                filled: true,
                fillColor: Colors.grey.shade50,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8),
                  borderSide: BorderSide(color: Colors.grey.shade300),
                ),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8),
                  borderSide: BorderSide(color: Colors.grey.shade300),
                ),
              ),
            ),
            const SizedBox(height: 32),

            // Upload Button
            SizedBox(
              width: double.infinity,
              height: 48,
              child: ElevatedButton(
                onPressed: _uploading ? null : _uploadGST,
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF00A6A4),
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                ),
                child: _uploading
                    ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                    : const Text('Upload GST Certificate', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
              ),
            ),
          ],
        ),
      )),
    );
  }
}
