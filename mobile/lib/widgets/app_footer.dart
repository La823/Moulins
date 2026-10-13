import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import '../utils/responsive.dart';

// Footer at the bottom of the home screen — the same dark look and details as
// the website's footer: contact, hours, quick links, logo and copyright.
// Email/phone open the mail and dialer apps; web links open in the browser.

const _bg = Color(0xFF111111);
const _bgDeep = Color(0xFF0A0A0A);
const _heading = Color(0xFFE5DDD3);
const _text = Color(0xFFB8B0A4);
const _faint = Color(0xFF6B6560);
const _rule = Color(0xFF2A2A2A);

class AppFooter extends StatelessWidget {
  const AppFooter({super.key});

  static Future<void> _open(String url) =>
      launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication).catchError((_) => false);

  @override
  Widget build(BuildContext context) {
    final wide = isWide(context);

    final contact = Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text('Contact Us', style: TextStyle(color: _heading, fontSize: 17, fontWeight: FontWeight.w600)),
        const SizedBox(height: 14),
        const Text(
          'Moulins Pharmaceuticals Pvt. Ltd.\n1st Floor, 363, Industrial Area Phase 2,\nPanchkula, Haryana 134113',
          style: TextStyle(color: _text, fontSize: 13, height: 1.55),
        ),
        const SizedBox(height: 10),
        const Text('10 am – 7 pm, Monday to Saturday', style: TextStyle(color: _text, fontSize: 13)),
        const SizedBox(height: 12),
        _Link(icon: Icons.mail_outline, label: 'info@moulinspharma.com', onTap: () => _open('mailto:info@moulinspharma.com')),
        _Link(icon: Icons.phone_outlined, label: '+91 98155 35304', onTap: () => _open('tel:+919815535304')),
      ],
    );

    final departments = Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text('Write to us', style: TextStyle(color: _heading, fontSize: 17, fontWeight: FontWeight.w600)),
        const SizedBox(height: 14),
        const Text('General & domestic queries', style: TextStyle(color: _faint, fontSize: 11.5)),
        _Link(label: 'info@moulinspharma.com', onTap: () => _open('mailto:info@moulinspharma.com')),
        const SizedBox(height: 8),
        const Text('Sales & B2B', style: TextStyle(color: _faint, fontSize: 11.5)),
        _Link(label: 'Sales@moulinspharma.com', onTap: () => _open('mailto:Sales@moulinspharma.com')),
        const SizedBox(height: 8),
        _Link(icon: Icons.language, label: 'moulinspharma.com', onTap: () => _open('https://moulinspharma.com')),
      ],
    );

    return Container(
      color: _bg,
      margin: const EdgeInsets.only(top: 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: EdgeInsets.fromLTRB(wide ? 40 : 24, 36, wide ? 40 : 24, 28),
            child: wide
                ? Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [Expanded(child: contact), const SizedBox(width: 32), Expanded(child: departments)],
                  )
                : Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [contact, const SizedBox(height: 28), departments],
                  ),
          ),
          const Divider(height: 1, thickness: 1, color: _rule, indent: 24, endIndent: 24),
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 28),
            // the colour logo, turned white like the website footer's
            child: ColorFiltered(
              colorFilter: const ColorFilter.mode(Color(0xCCFFFFFF), BlendMode.srcIn),
              child: Image.asset('assets/images/moulins_logo.png', height: 44),
            ),
          ),
          const Padding(
            padding: EdgeInsets.fromLTRB(24, 0, 24, 24),
            child: Text(
              'Committed to advancing health through quality pharmaceuticals. Manufactured with precision, '
              'delivered with care — serving healthcare professionals and patients across India.',
              textAlign: TextAlign.center,
              style: TextStyle(color: Color(0xFF9A9286), fontSize: 12.5, fontStyle: FontStyle.italic, height: 1.5),
            ),
          ),
          Container(
            width: double.infinity,
            color: _bgDeep,
            padding: const EdgeInsets.fromLTRB(24, 16, 24, 20),
            child: Wrap(
              alignment: WrapAlignment.spaceBetween,
              crossAxisAlignment: WrapCrossAlignment.center,
              runSpacing: 8,
              spacing: 16,
              children: [
                GestureDetector(
                  onTap: () => _open('https://moulinspharma.com/privacy'),
                  child: const Text('Privacy Policy', style: TextStyle(color: _faint, fontSize: 12)),
                ),
                Text('© ${DateTime.now().year} Moulins Pharmaceuticals Pvt. Ltd.',
                    style: const TextStyle(color: _faint, fontSize: 12)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _Link extends StatelessWidget {
  final IconData? icon;
  final String label;
  final VoidCallback onTap;
  const _Link({this.icon, required this.label, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 5),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (icon != null) ...[Icon(icon, size: 15, color: _text), const SizedBox(width: 8)],
            Text(label, style: const TextStyle(color: _text, fontSize: 13)),
          ],
        ),
      ),
    );
  }
}
