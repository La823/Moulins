/// Strong-password / phone-number validation shared across every screen
/// that creates or edits credentials.
class Validators {
  static final _upper = RegExp(r'[A-Z]');
  static final _lower = RegExp(r'[a-z]');
  static final _digit = RegExp(r'\d');
  static final _special = RegExp(r'[^A-Za-z0-9]');
  static final _tenDigits = RegExp(r'^\d{10}$');

  /// Null when [value] satisfies all strong-password rules, otherwise a
  /// message describing the first unmet rule.
  static String? passwordError(String value) {
    if (value.length < 8) return 'Password must be at least 8 characters';
    if (!_upper.hasMatch(value)) return 'Password must include an uppercase letter';
    if (!_lower.hasMatch(value)) return 'Password must include a lowercase letter';
    if (!_digit.hasMatch(value)) return 'Password must include a number';
    if (!_special.hasMatch(value)) return 'Password must include a special character';
    return null;
  }

  static bool isStrongPassword(String value) => passwordError(value) == null;

  /// Strips a leading `+91`/`91` country code and any spaces or dashes,
  /// returning the bare 10-digit number, or null if what's left isn't one.
  static String? normalizePhone(String value) {
    var v = value.trim().replaceAll(RegExp(r'[\s-]'), '');
    if (v.startsWith('+91')) {
      v = v.substring(3);
    } else if (v.startsWith('91') && v.length == 12) {
      v = v.substring(2);
    }
    return _tenDigits.hasMatch(v) ? v : null;
  }

  /// Null when [value] is a valid 10-digit Indian phone number (with or
  /// without a +91/91 prefix), otherwise a message.
  static String? phoneError(String value) {
    if (normalizePhone(value) == null) return 'Enter a valid 10-digit phone number';
    return null;
  }
}
