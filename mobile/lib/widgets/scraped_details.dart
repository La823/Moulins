import 'package:flutter/material.dart';

// Human-readable labels for the government portals' raw field names —
// covers both the GST response (lgnm, tradeNam, ctj, ...) and the
// drug-license response (str_ondls_licence_no, dt_curr_validity_date, ...).
// Anything not listed here still renders, just title-cased from its key.
const Map<String, String> _scrapedFieldLabels = {
  'gstin': 'GSTIN',
  'lgnm': 'Legal Name',
  'tradeNam': 'Trade Name',
  'sts': 'Status',
  'ctb': 'Constitution of Business',
  'rgdt': 'Registered Date',
  'ctj': 'Center Jurisdiction',
  'ctjCd': 'Center Jurisdiction Code',
  'stj': 'State Jurisdiction',
  'stjCd': 'State Jurisdiction Code',
  'dty': 'Taxpayer Type',
  'cxdt': 'Cancellation Date',
  'lstupdt': 'Last Updated (Portal)',
  'adadr': 'Additional Places of Business',
  'nba': 'Nature of Business Activities',
  'num_licence_id': 'License ID',
  'str_ondls_licence_no': 'License No',
  'licence_form_no': 'License Form',
  'institute_name': 'Firm Name',
  'licence_status': 'Status',
  'dt_curr_validity_date': 'Valid Until',
  'dt_first_issue_date': 'First Issued',
  'dt_first_reg_date': 'First Registered',
  'full_address': 'Address',
  'tech_persons': 'Technical Person(s)',
  'str_work_role_desc': 'Role',
};

const Set<String> _scrapedFieldSkip = {'products', 'num_is_tech_person_applicable'};

String _labelForKey(String key) {
  final known = _scrapedFieldLabels[key];
  if (known != null) return known;
  final spaced = key.replaceAll('_', ' ').replaceAllMapped(
        RegExp(r'([a-z])([A-Z])'),
        (m) => '${m[1]} ${m[2]}',
      );
  if (spaced.isEmpty) return spaced;
  return spaced[0].toUpperCase() + spaced.substring(1);
}

String? _formatValue(dynamic value) {
  if (value == null || value == '') return null;
  if (value is List) {
    if (value.isEmpty) return null;
    if (value.first is Map) {
      return value
          .map((item) {
            final m = item as Map;
            return m['techname'] ?? m['bzsdtl'] ?? m.values.where((v) => v != null && v != '').join(' ');
          })
          .where((v) => v != null && v != '')
          .join(', ');
    }
    return value.join(', ');
  }
  if (value is Map) {
    // e.g. GST's pradr: { adr, addr: {...} } — surface just the address line.
    return value['adr'] as String?;
  }
  return value.toString();
}

// Renders every field present in a doc's saved scraped_data (the full raw
// government-portal response), not just the handful pulled into discrete
// columns — so nothing captured at verification time is hidden from view.
class ScrapedDetails extends StatelessWidget {
  final Map<String, dynamic>? data;
  final TextStyle? style;
  const ScrapedDetails({super.key, required this.data, this.style});

  @override
  Widget build(BuildContext context) {
    final d = data;
    if (d == null) return const SizedBox.shrink();
    final rows = <Widget>[];
    for (final entry in d.entries) {
      if (_scrapedFieldSkip.contains(entry.key)) continue;
      final formatted = _formatValue(entry.value);
      if (formatted == null) continue;
      final label = _labelForKey(entry.key);
      rows.add(RichText(
        text: TextSpan(
          style: style ?? const TextStyle(fontSize: 12, color: Colors.grey),
          children: [
            TextSpan(text: '$label: ', style: const TextStyle(fontWeight: FontWeight.w600)),
            TextSpan(text: formatted),
          ],
        ),
      ));
    }
    if (rows.isEmpty) return const SizedBox.shrink();
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: rows);
  }
}
