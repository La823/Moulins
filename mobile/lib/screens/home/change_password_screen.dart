import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import '../../config/api.dart';
import '../../widgets/shell_leading.dart';

const _teal = Color(0xFF00A6A4);

/// Change one's own password (server PUT /profile/password): the current
/// password, then the new one twice. Same rules as the website's password
/// box and the server (utils.ValidatePasswordStrength): at least 8
/// characters with a capital letter, a small letter and a number. (Staff
/// passwords stay visible to admins, as when an admin sets them.)
class ChangePasswordScreen extends StatefulWidget {
  const ChangePasswordScreen({super.key});

  @override
  State<ChangePasswordScreen> createState() => _ChangePasswordScreenState();
}

class _ChangePasswordScreenState extends State<ChangePasswordScreen> {
  final _current = TextEditingController();
  final _new = TextEditingController();
  final _again = TextEditingController();
  bool _show = false;
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _current.dispose();
    _new.dispose();
    _again.dispose();
    super.dispose();
  }

  static final _rules = <(String, bool Function(String))>[
    ('At least 8 characters', (p) => p.length >= 8),
    ('A capital letter', (p) => RegExp('[A-Z]').hasMatch(p)),
    ('A small letter', (p) => RegExp('[a-z]').hasMatch(p)),
    ('A number', (p) => RegExp('[0-9]').hasMatch(p)),
  ];

  Future<void> _save() async {
    final p = _new.text;
    if (_current.text.isEmpty) return setState(() => _error = 'Enter your current password.');
    if (!_rules.every((r) => r.$2(p))) return setState(() => _error = 'The new password doesn\'t meet the rules below.');
    if (p != _again.text) return setState(() => _error = 'The two new passwords don\'t match.');
    setState(() => (_busy = true, _error = null));
    try {
      await createDio().put('/profile/password', data: {'current_password': _current.text, 'new_password': p});
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Password changed.')));
      Navigator.of(context).pop();
    } on DioException catch (e) {
      final status = e.response?.statusCode;
      final body = e.response?.data;
      setState(() {
        _busy = false;
        _error = status == 401
            ? 'Your current password is not right.'
            : (body is String && body.trim().isNotEmpty && body.length < 200 ? body.trim() : 'Could not change the password. Try again.');
      });
    } catch (_) {
      setState(() => (_busy = false, _error = 'Could not change the password. Try again.'));
    }
  }

  @override
  Widget build(BuildContext context) {
    InputDecoration deco(String label) => InputDecoration(
          labelText: label,
          border: const OutlineInputBorder(),
          suffixIcon: IconButton(
            icon: Icon(_show ? Icons.visibility_off : Icons.visibility),
            onPressed: () => setState(() => _show = !_show),
          ),
        );
    final p = _new.text;
    return Scaffold(
      appBar: AppBar(leading: const ShellBack(), title: const Text('Change password')),
      body: ListView(padding: const EdgeInsets.all(20), children: [
        TextField(controller: _current, obscureText: !_show, decoration: deco('Current password')),
        const SizedBox(height: 14),
        TextField(controller: _new, obscureText: !_show, onChanged: (_) => setState(() {}), decoration: deco('New password')),
        const SizedBox(height: 8),
        for (final r in _rules)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 2),
            child: Row(children: [
              Icon(r.$2(p) ? Icons.check_circle : Icons.radio_button_unchecked, size: 16, color: r.$2(p) ? Colors.green.shade700 : Colors.grey),
              const SizedBox(width: 6),
              Text(r.$1, style: TextStyle(fontSize: 12.5, color: r.$2(p) ? Colors.green.shade800 : Colors.grey.shade600)),
            ]),
          ),
        const SizedBox(height: 14),
        TextField(controller: _again, obscureText: !_show, decoration: deco('New password again')),
        if (_error != null) Padding(padding: const EdgeInsets.only(top: 12), child: Text(_error!, style: TextStyle(color: Colors.red.shade700))),
        const SizedBox(height: 20),
        FilledButton(
          onPressed: _busy ? null : _save,
          style: FilledButton.styleFrom(backgroundColor: _teal, minimumSize: const Size.fromHeight(48)),
          child: Text(_busy ? 'Saving…' : 'Change password'),
        ),
      ]),
    );
  }
}
