import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// The phone field on the login screens: digits only, at most 10. The field
/// shows a fixed "+91 " in front, so a pasted "+91 98765 43210",
/// "919876543210" or "09876543210" keeps just the 10-digit number, which is
/// how accounts are saved.
class IndianPhoneFormatter extends TextInputFormatter {
  static String clean(String text) {
    var d = text.replaceAll(RegExp(r'\D'), '');
    if (d.length > 10 && d.startsWith('91')) d = d.substring(2);
    if (d.length > 10 && d.startsWith('0')) d = d.substring(1);
    return d.length > 10 ? d.substring(0, 10) : d;
  }

  @override
  TextEditingValue formatEditUpdate(TextEditingValue oldValue, TextEditingValue newValue) {
    final d = clean(newValue.text);
    if (d == newValue.text) return newValue;
    return TextEditingValue(text: d, selection: TextSelection.collapsed(offset: d.length));
  }
}

/// True for a 10-digit number (what the login check asks for).
bool isTenDigitPhone(String text) => RegExp(r'^\d{10}$').hasMatch(text.trim());

/// The "+91" in front of the login phone fields: a small teal box, always
/// shown (a prefixText only appears once the field is tapped). Use as the
/// field's prefixIcon with [IndiaCodeBox.constraints]; [icon] puts the phone
/// icon before it.
class IndiaCodeBox extends StatelessWidget {
  final IconData? icon;
  const IndiaCodeBox({super.key, this.icon});

  static const constraints = BoxConstraints(minWidth: 0, minHeight: 0);

  @override
  Widget build(BuildContext context) {
    const teal = Color(0xFF00A6A4);
    return Padding(
      padding: EdgeInsets.only(left: icon == null ? 10 : 12, right: 10),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        if (icon != null) ...[
          Icon(icon, color: Colors.grey, size: 22),
          const SizedBox(width: 10),
        ],
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 6),
          decoration: BoxDecoration(
            color: teal.withValues(alpha: 0.08),
            borderRadius: BorderRadius.circular(8),
            border: Border.all(color: teal.withValues(alpha: 0.35)),
          ),
          child: const Text('+91',
              style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14.5, color: teal, letterSpacing: 0.3)),
        ),
      ]),
    );
  }
}
