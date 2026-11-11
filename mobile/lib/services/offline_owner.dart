/// The account whose offline data the app reads and writes. Every key that
/// keeps data for use without internet goes through [key], so each account
/// on a phone has its own saved presentations, doctors, orders and product
/// pages, and never sees another's. Set on login (auth_provider.dart).
class OfflineOwner {
  static String? id;

  /// [k] for the current account: "k@<user id>".
  static String key(String k) => id == null ? k : '$k@$id';

  /// Whether a stored key belongs to the current account.
  static bool owns(String storedKey) => id != null && storedKey.endsWith('@$id');
}
