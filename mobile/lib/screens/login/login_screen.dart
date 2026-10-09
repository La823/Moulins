import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../config/api.dart';
import '../../providers/auth_provider.dart';
import '../../utils/responsive.dart';
import '../../widgets/play_once_video.dart';

const _teal = Color(0xFF00A6A4);

void _showForgotPasswordSheet(BuildContext context) {
  showModalBottomSheet(
    context: context,
    isScrollControlled: true,
    shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
    builder: (_) => const _ForgotPasswordSheet(),
  );
}

class _ForgotPasswordSheet extends StatefulWidget {
  const _ForgotPasswordSheet();

  @override
  State<_ForgotPasswordSheet> createState() => _ForgotPasswordSheetState();
}

class _ForgotPasswordSheetState extends State<_ForgotPasswordSheet> {
  final _phoneCtrl = TextEditingController();
  bool _submitting = false;
  bool _done = false;
  String? _message;
  bool _hasEmail = false;

  @override
  void dispose() {
    _phoneCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_phoneCtrl.text.trim().isEmpty) return;
    setState(() => _submitting = true);
    try {
      final res = await createDio().post('/auth/forgot-password', data: {
        'phone_number': _phoneCtrl.text.trim(),
      });
      setState(() {
        _message = res.data['message'] ?? 'If this account has an email on file, a reset link has been sent.';
        _hasEmail = res.data['has_email'] == true;
        _done = true;
      });
    } catch (e) {
      setState(() {
        _message = 'Something went wrong. Please try again.';
        _hasEmail = false;
        _done = true;
      });
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.fromLTRB(24, 24, 24, MediaQuery.of(context).viewInsets.bottom + 24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Forgot Password', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
          const SizedBox(height: 16),
          if (_done) ...[
            Text(
              _message ?? '',
              style: TextStyle(fontSize: 13.5, color: _hasEmail ? Colors.grey.shade700 : Colors.amber.shade800),
            ),
            const SizedBox(height: 20),
            SizedBox(
              width: double.infinity,
              height: 48,
              child: ElevatedButton(
                onPressed: () => Navigator.pop(context),
                style: ElevatedButton.styleFrom(
                  backgroundColor: _teal,
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  elevation: 0,
                ),
                child: const Text('Close'),
              ),
            ),
          ] else ...[
            Text(
              'Enter your registered phone number. If an email is linked to your account, we\'ll send you a link to reset your password.',
              style: TextStyle(fontSize: 13, color: Colors.grey.shade600),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _phoneCtrl,
              keyboardType: TextInputType.phone,
              decoration: InputDecoration(
                labelText: 'Phone Number',
                filled: true,
                fillColor: Colors.grey.shade50,
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide(color: Colors.grey.shade200)),
              ),
            ),
            const SizedBox(height: 20),
            SizedBox(
              width: double.infinity,
              height: 48,
              child: ElevatedButton(
                onPressed: _submitting ? null : _submit,
                style: ElevatedButton.styleFrom(
                  backgroundColor: _teal,
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  elevation: 0,
                ),
                child: _submitting
                    ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                    : const Text('Send Reset Link'),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _phoneCtrl = TextEditingController();
  final _passCtrl = TextEditingController();
  bool _obscure = true;

  @override
  void initState() {
    super.initState();
    Future.microtask(() => ref.read(authProvider.notifier).loadUser());
  }

  @override
  void dispose() {
    _phoneCtrl.dispose();
    _passCtrl.dispose();
    super.dispose();
  }

  Future<void> _login() async {
    final ok = await ref
        .read(authProvider.notifier)
        .login(_phoneCtrl.text.trim(), _passCtrl.text.trim());
    if (ok && mounted) context.go('/home');
  }

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authProvider);

    if (!auth.checked) {
      return const Scaffold(
        backgroundColor: Colors.white,
        body: Center(child: CircularProgressIndicator(color: Color(0xFF00A6A4))),
      );
    }

    if (auth.user != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) => context.go('/home'));
      return const Scaffold(
        backgroundColor: Colors.white,
        body: Center(child: CircularProgressIndicator(color: Color(0xFF00A6A4))),
      );
    }

    final form = _buildForm(auth);

    // Logo animation — plays once and rests on the logo. White behind it
    // matches the clip's own background so its edges don't show.
    const logoVideo = PlayOnceVideo(asset: 'assets/videos/login_logo.mp4', fit: BoxFit.contain);

    // Tablet: one card, sign-in form on the left, logo video on the right
    // (same as the website). Phone: the video sits above the form.
    if (isWide(context)) {
      return Scaffold(
        backgroundColor: Colors.grey.shade50,
        body: SafeArea(
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(32),
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 920),
                child: Material(
                  color: Colors.white,
                  elevation: 2,
                  shadowColor: Colors.black12,
                  borderRadius: BorderRadius.circular(20),
                  clipBehavior: Clip.antiAlias,
                  child: IntrinsicHeight(
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Expanded(
                          child: Padding(
                            padding: const EdgeInsets.fromLTRB(44, 44, 44, 40),
                            child: form,
                          ),
                        ),
                        Expanded(
                          child: DecoratedBox(
                            decoration: BoxDecoration(
                              border: Border(left: BorderSide(color: Colors.grey.shade100)),
                            ),
                            child: const Padding(
                              padding: EdgeInsets.all(24),
                              child: Center(child: AspectRatio(aspectRatio: 1, child: logoVideo)),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      );
    }

    return Scaffold(
      backgroundColor: Colors.white,
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(28, 16, 28, 32),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Center(child: SizedBox(width: 210, height: 210, child: logoVideo)),
              const SizedBox(height: 8),
              form,
            ],
          ),
        ),
      ),
    );
  }

  /// Heading, fields, error, and the Sign In button — shared by both layouts.
  Widget _buildForm(AuthState auth) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        const Text('Sign In', style: TextStyle(fontSize: 24, fontWeight: FontWeight.w700, color: Color(0xFF1A1A1A))),
        const SizedBox(height: 6),
        const Text('Sign in to your account with your phone number and password',
            style: TextStyle(color: Colors.grey, fontSize: 13.5, height: 1.4)),
        const SizedBox(height: 26),

        // Phone
        TextField(
          controller: _phoneCtrl,
          keyboardType: TextInputType.phone,
          decoration: _inputDecoration('Phone Number', Icons.phone_outlined),
        ),
        const SizedBox(height: 16),

        // Password
        TextField(
          controller: _passCtrl,
          obscureText: _obscure,
          decoration: _inputDecoration('Password', Icons.lock_outline).copyWith(
            suffixIcon: IconButton(
              icon: Icon(_obscure ? Icons.visibility_off_outlined : Icons.visibility_outlined, color: Colors.grey),
              onPressed: () => setState(() => _obscure = !_obscure),
            ),
          ),
          onSubmitted: (_) => _login(),
        ),
        const SizedBox(height: 8),
        Align(
          alignment: Alignment.centerRight,
          child: TextButton(
            onPressed: () => _showForgotPasswordSheet(context),
            style: TextButton.styleFrom(padding: EdgeInsets.zero, minimumSize: const Size(0, 0)),
            child: const Text('Forgot password?', style: TextStyle(fontSize: 12.5, color: Colors.grey)),
          ),
        ),
        const SizedBox(height: 4),

        if (auth.error != null)
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: Colors.red.shade50,
              borderRadius: BorderRadius.circular(8),
            ),
            child: Text(auth.error!, style: const TextStyle(color: Colors.red, fontSize: 13)),
          ),

        const SizedBox(height: 24),

        SizedBox(
          width: double.infinity,
          height: 52,
          child: ElevatedButton(
            onPressed: auth.loading ? null : _login,
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF00A6A4),
              foregroundColor: Colors.white,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              elevation: 0,
            ),
            child: auth.loading
                ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                : const Text('Sign In', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
          ),
        ),
        const SizedBox(height: 18),
        Center(
          child: Text(
            "Don't have an account? Contact us to get invited.",
            style: TextStyle(fontSize: 12, color: Colors.grey.shade500),
          ),
        ),
      ],
    );
  }

  InputDecoration _inputDecoration(String label, IconData icon) => InputDecoration(
        labelText: label,
        prefixIcon: Icon(icon, color: Colors.grey),
        filled: true,
        fillColor: Colors.grey.shade50,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: Colors.grey.shade200),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: Colors.grey.shade200),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: Color(0xFF00A6A4), width: 1.5),
        ),
      );
}
