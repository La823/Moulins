import 'package:flutter_test/flutter_test.dart';
import 'package:moulins/services/notification_links.dart';

void main() {
  test('notification links open the matching app screen', () {
    final cases = {
      '/partner-panel/retailer-orders/abc': '/retailer-orders/abc', // new order from a retailer
      '/retailer-panel/orders/abc': '/retailer-orders/abc', // a retailer's order update
      '/panel/orders/abc': '/admin/orders/abc', // staff: new order
      '/meetings/abc': '/meetings/abc', // meeting reminder
      '/doctors/abc': '/doctors/abc', // birthday / anniversary
      '/chat/abc': '/chat/abc',
      '/dashboard': '/dashboard', // ledger updated
      '/panel/partnership-requests': '/admin',
    };
    cases.forEach((link, route) => expect(NotificationLinks.appRouteFor(link), route, reason: link));
    for (final none in [null, '', '/panel/official-updates', '/somewhere-else']) {
      expect(NotificationLinks.appRouteFor(none), isNull, reason: '$none');
    }
  });
}
