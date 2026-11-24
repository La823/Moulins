import 'dart:ui';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'config/app_flavor.dart';
import 'providers/auth_provider.dart';
import 'providers/cart_provider.dart';
import 'providers/notification_provider.dart';
import 'services/local_notifications_service.dart';
import 'services/presentation_downloads.dart';
import 'services/notification_links.dart';
import 'screens/bills/my_bills_screen.dart';
import 'services/offline_background.dart';
import 'services/offline_cache.dart';
import 'services/offline_sync.dart';
import 'screens/home/offline_data_screen.dart';
import 'widgets/offline_choice_sheet.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter_cache_manager/flutter_cache_manager.dart';
import 'screens/login/login_screen.dart';
import 'screens/products/products_screen.dart';
import 'screens/products/product_detail_screen.dart';
import 'screens/products/special_products_screen.dart';
import 'screens/products/special_product_detail_screen.dart';
import 'screens/orders/orders_screen.dart';
import 'screens/orders/order_detail_screen.dart';
import 'screens/doctors/doctors_screen.dart';
import 'screens/doctors/doctor_detail_resolver.dart';
import 'screens/presentations/presentations_screen.dart';
import 'screens/presentations/presentation_builder_screen.dart';
import 'screens/presentations/notebook_presentation_screen.dart';
import 'screens/cart/cart_screen.dart';
import 'screens/home/home_screen.dart';
import 'screens/home/profile_screen.dart';
import 'screens/onboarding/onboarding_screen.dart';
import 'screens/notifications/notifications_screen.dart';
import 'screens/meetings/meetings_screen.dart';
import 'screens/requests/requests_screen.dart';
import 'screens/chat/chat_list_screen.dart';
import 'screens/chat/chat_thread_resolver.dart';
import 'screens/products/favorites_screen.dart';
import 'screens/learning/learning_screen.dart';
import 'screens/admin/admin_dashboard_screen.dart';
import 'screens/admin/admin_orders_screen.dart';
import 'screens/packing/packing_list_screen.dart';
import 'screens/packing/packing_order_screen.dart';
import 'screens/staff/freight_bills_screen.dart';
import 'screens/staff/leave_approvals_screen.dart';
import 'screens/staff/marg_stock_screen.dart';
import 'screens/staff/marg_bills_screen.dart';
import 'screens/staff/my_leave_screen.dart';
import 'screens/staff/missed_punch_screen.dart';
import 'screens/admin/admin_order_detail_screen.dart';
import 'screens/divisions/division_landing_screen.dart';
import 'screens/team/team_screen.dart';
import 'screens/team/team_member_detail_screen.dart';
import 'screens/team/team_attendance_screen.dart';
import 'screens/team/team_logs_screen.dart';
import 'screens/team/my_attendance_screen.dart';
import 'screens/team/my_daily_log_screen.dart';
import 'screens/payments/payments_screen.dart';
import 'screens/retailers/retailers_screen.dart';
import 'screens/orders/order_placed_screen.dart';
import 'screens/retailers/retailer_orders_screen.dart';
import 'screens/retailers/retailer_order_detail_screen.dart';
import 'screens/dashboard/dashboard_screen.dart';
import 'models/team_member.dart';
import 'data/divisions.dart';
import 'models/presentation.dart';
import 'widgets/fullscreen_image_gallery.dart';
import 'widgets/update_gate.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // Room for a whole presentation's slides decoded at once (default 100 MB),
  // so turning back and forth doesn't decode them again.
  PaintingBinding.instance.imageCache.maximumSizeBytes = 250 << 20;
  await OfflineSync.load();
  await OfflineBackground.init(); // "Save everything" with the app closed

  try {
    await Firebase.initializeApp();
    await LocalNotificationsService.init();
    // iOS shows nothing for a push while the app is open unless asked to;
    // this lets it show with its sound (the order sound for new orders).
    await FirebaseMessaging.instance.setForegroundNotificationPresentationOptions(alert: true, badge: true, sound: true);
    FirebaseMessaging.onMessage.listen((message) {
      final notification = message.notification;
      if (notification != null) {
        LocalNotificationsService.show(
          title: notification.title ?? appName,
          body: notification.body ?? '',
          imageUrl: notification.android?.imageUrl ?? notification.apple?.imageUrl,
          notificationId: message.data['notification_id'],
          channelId: message.data['channel'] ?? notification.android?.channelId,
          deepLink: message.data['deep_link'],
        );
      }
    });
    // Tapping a push opens its page: while the app was in the background,
    // or when the tap launched it.
    FirebaseMessaging.onMessageOpenedApp.listen((m) => NotificationLinks.open(m.data['deep_link']));
    FirebaseMessaging.instance.getInitialMessage().then((m) {
      if (m != null) NotificationLinks.open(m.data['deep_link']);
    }).catchError((_) {});
  } catch (e) {
    debugPrint('Firebase init failed: $e');
  }

  FlutterError.onError = (details) {
    debugPrint('=== FLUTTER ERROR ===');
    debugPrint(details.exceptionAsString());
    debugPrint(details.stack.toString());
  };

  PlatformDispatcher.instance.onError = (error, stack) {
    debugPrint('=== DART ERROR ===');
    debugPrint(error.toString());
    debugPrint(stack.toString());
    return true;
  };

  runApp(const ProviderScope(child: MoulinsApp()));
}

class MoulinsApp extends ConsumerWidget {
  const MoulinsApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = GoRouter(
      initialLocation: '/login',
      routes: [
        GoRoute(path: '/login', builder: (_, __) => const LoginScreen()),
        GoRoute(path: '/cart', builder: (_, __) => const CartScreen()),
        GoRoute(path: '/onboarding', builder: (_, __) => const OnboardingScreen()),
        // Top-level (not nested in the ShellRoute) so it covers the full
        // screen including the persistent bottom nav bar, and so go_router
        // itself owns back/predictive-back handling for it — see the
        // comment in fullscreen_image_gallery.dart for why that matters.
        GoRoute(
          path: '/gallery',
          builder: (_, state) {
            final extra = state.extra as Map<String, dynamic>;
            return FullScreenImageGalleryScreen(
              imageUrls: List<String>.from(extra['imageUrls'] as List),
              initialIndex: extra['initialIndex'] as int? ?? 0,
              cacheManager: extra['cacheManager'] as BaseCacheManager?,
            );
          },
        ),
        // The green "Order placed!" moment after checkout, full screen (no
        // bottom bar); goes on to the order by itself.
        GoRoute(
          path: '/order-placed',
          builder: (_, state) {
            final extra = state.extra as Map<String, dynamic>? ?? const {};
            return OrderPlacedScreen(
              next: extra['next'] as String? ?? '/orders',
              message: extra['message'] as String? ?? 'Your order has been placed.',
            );
          },
        ),
        // Top-level for the same reasons as /gallery above.
        GoRoute(
          path: '/notebook',
          // Presentation images come through the presentations cache, so a
          // downloaded deck plays offline (services/presentation_downloads.dart).
          builder: (_, state) => NotebookPresentationScreen(
            slides: List<PresentationSlide>.from(state.extra as List),
            imageFor: (url) => FullScreenImageGalleryScreen.screenSized(url, cacheManager: PresentationDownloads.cache),
          ),
        ),
        ShellRoute(
          builder: (_, state, child) =>
              _AppShell(child: child, location: state.uri.path),
          routes: [
            GoRoute(path: '/home', builder: (_, __) => const HomeScreen()),
            GoRoute(path: '/dashboard', builder: (_, __) => const DashboardScreen()),
            GoRoute(
              path: '/products',
              builder: (_, state) => ProductsScreen(
                initialCategory: state.uri.queryParameters['category'],
                initialTag: state.uri.queryParameters['tag'],
              ),
              routes: [
                GoRoute(
                  path: ':id',
                  builder: (_, state) =>
                      ProductDetailScreen(productId: state.pathParameters['id']!),
                ),
              ],
            ),
            GoRoute(
              path: '/special',
              builder: (_, __) => const SpecialProductsScreen(),
              routes: [
                GoRoute(
                  path: ':id',
                  builder: (_, state) =>
                      SpecialProductDetailScreen(productId: state.pathParameters['id']!),
                ),
              ],
            ),
            // In MPPL Team, staff get the staff order screens here (rates,
            // Marg, batches…); in Moulins (clients only) everyone gets their
            // own orders. isTeamApp is a build-time constant, so the staff
            // screens aren't compiled into Moulins at all.
            GoRoute(
              path: '/orders',
              builder: (_, __) => isTeamApp ? const _ForStaff(staff: _StaffOrders(), other: OrdersScreen()) : const OrdersScreen(),
              routes: [
                GoRoute(
                  path: ':id',
                  builder: (_, state) => isTeamApp
                      ? _ForStaff(
                          staff: AdminOrderDetailScreen(orderId: state.pathParameters['id']!),
                          other: OrderDetailScreen(orderId: state.pathParameters['id']!),
                        )
                      : OrderDetailScreen(orderId: state.pathParameters['id']!),
                ),
              ],
            ),
            GoRoute(path: '/doctors', builder: (_, __) => const DoctorsScreen()),
            GoRoute(
              path: '/doctors/:id',
              builder: (_, state) => DoctorDetailResolver(doctorId: state.pathParameters['id']!),
            ),
            GoRoute(
              path: '/presentations',
              builder: (_, __) => const PresentationsScreen(),
              routes: [
                GoRoute(
                  path: ':id',
                  builder: (_, state) =>
                      PresentationBuilderScreen(presentationId: state.pathParameters['id']!),
                ),
              ],
            ),
            GoRoute(path: '/team', builder: (_, __) => const TeamScreen()),
            // Retailers: a partner's shops, and their orders to the partner.
            GoRoute(path: '/retailers', builder: (_, __) => const RetailersScreen()),
            GoRoute(path: '/my-bills', builder: (_, __) => const MyBillsScreen()),
            GoRoute(
              path: '/retailer-orders',
              builder: (_, __) => const RetailerOrdersScreen(),
              routes: [
                GoRoute(
                  path: ':id',
                  builder: (_, state) => RetailerOrderDetailScreen(orderId: state.pathParameters['id']!),
                ),
              ],
            ),
            GoRoute(
              path: '/team/:id',
              builder: (_, state) => TeamMemberDetailScreen(member: state.extra as TeamMember),
            ),
            GoRoute(path: '/team-attendance', builder: (_, __) => const TeamAttendanceScreen()),
            GoRoute(path: '/team-logs', builder: (_, __) => const TeamLogsScreen()),
            GoRoute(path: '/my-attendance', builder: (_, __) => const MyAttendanceScreen()),
            GoRoute(path: '/my-daily-log', builder: (_, __) => const MyDailyLogScreen()),
            GoRoute(
              path: '/meetings',
              builder: (_, state) => MeetingsScreen(
                preselectedDoctorId: state.uri.queryParameters['doctor_id'],
              ),
            ),
            // No per-meeting detail screen exists — meetings are only ever
            // viewed inline in the list — so a meeting-reminder deep link
            // (/meetings/:id) just lands on the list instead of 404ing.
            GoRoute(path: '/meetings/:id', redirect: (_, __) => '/meetings'),
            GoRoute(path: '/requests', builder: (_, __) => const RequestsScreen()),
            GoRoute(
              path: '/chat',
              builder: (_, state) => ChatListScreen(initialConversationId: state.uri.queryParameters['conversation']),
            ),
            GoRoute(
              path: '/chat/:id',
              builder: (_, state) => ChatThreadResolver(id: state.pathParameters['id']!),
            ),
            GoRoute(path: '/favorites', builder: (_, __) => const FavoritesScreen()),
            GoRoute(path: '/payments', builder: (_, __) => const PaymentsScreen()),
            GoRoute(path: '/learning', builder: (_, __) => const LearningScreen()),
            // Staff screens: MPPL Team only (admins, employees, the dispatch
            // team). Moulins is the clients' app and has none of these.
            if (isTeamApp) ...[
            GoRoute(path: '/admin', builder: (_, __) => const AdminDashboardScreen()),
            // staff orders, as on the website (orders_view / orders_edit)
            GoRoute(path: '/admin/orders', builder: (_, __) => const AdminOrdersScreen()),
            GoRoute(
              path: '/admin/orders/:id',
              builder: (_, state) => AdminOrderDetailScreen(orderId: state.pathParameters['id']!),
            ),
            // packing orders with a batch photo per product (packing_edit)
            GoRoute(path: '/packing', builder: (_, __) => const PackingListScreen()),
            // staff tools (side menu "Staff"): Marg stock, own attendance and
            // leave, leave approvals, freight bills
            GoRoute(path: '/staff/stock', builder: (_, __) => const MargStockScreen()),
            // Marg bills: admins, and employees with marg_bills_view
            GoRoute(path: '/staff/bills', builder: (_, __) => const MargBillsScreen()),
            GoRoute(
              path: '/staff/bills/:voucher',
              builder: (_, st) => MargBillDetailScreen(voucher: int.tryParse(st.pathParameters['voucher'] ?? '') ?? 0),
            ),
            GoRoute(path: '/staff/attendance', builder: (_, __) => const MyLeaveScreen()),
            GoRoute(path: '/staff/leaves', builder: (_, __) => const LeaveApprovalsScreen()),
            // missed punches: one's own log, and everyone's for leave approvers
            GoRoute(path: '/staff/missed-punch', builder: (_, __) => const MyMissedPunchesScreen()),
            GoRoute(
              path: '/staff/missed-punches',
              builder: (_, __) => Consumer(
                builder: (_, ref, __) => MissedPunchApprovalsScreen(canDecide: ref.watch(authProvider).user?.has('leaves_edit') ?? false),
              ),
            ),
            GoRoute(path: '/staff/freight', builder: (_, __) => const FreightBillsScreen()),
            GoRoute(
              path: '/packing/:id',
              builder: (_, state) => PackingOrderScreen(orderId: state.pathParameters['id']!),
            ),
            ],
            GoRoute(path: '/profile', builder: (_, __) => const ProfileScreen()),
            GoRoute(path: '/offline-data', builder: (_, __) => const OfflineDataScreen()),
            GoRoute(path: '/notifications', builder: (_, __) => const NotificationsScreen()),
            ..._divisionRoutes,
          ],
        ),
      ],
    );

    return MaterialApp.router(
      debugShowCheckedModeBanner: false,
      // Flutter's default tells Android whether a route can be popped; on a
      // tab other than the first, back goes to the first tab, so the app
      // handles back there too (see _AppShellState.build)
      onNavigationNotification: (n) {
        SystemNavigator.setFrameworkHandlesBack(n.canHandlePop || _BackGoesHome.active);
        return true;
      },
      title: appName,
      theme: ThemeData(
        useMaterial3: true,
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF00A6A4)),
        scaffoldBackgroundColor: Colors.white,
        appBarTheme: const AppBarTheme(
          centerTitle: false,
          scrolledUnderElevation: 0,
          backgroundColor: Colors.white,
          foregroundColor: Colors.black,
        ),
      ),
      routerConfig: router,
      // update prompts (website: App Versions), over every screen
      builder: (context, child) => UpdateGate(child: child ?? const SizedBox.shrink()),
    );
  }
}

// Same 12 divisions as the website, each with its own hero banner + a
// products list filtered to its category — sharing one screen widget.
// Division data itself lives in data/divisions.dart, shared with AppDrawer.
final List<GoRoute> _divisionRoutes = kDivisions
    .map((d) => GoRoute(
          path: d.route,
          builder: (_, __) => DivisionLandingScreen(
            heroLabel: d.heroLabel,
            heroTitle: d.heroTitle,
            heroImage: d.heroImage,
            category: d.category,
            categoryId: d.categoryId,
          ),
        ))
    .toList();

class _AppShell extends ConsumerStatefulWidget {
  final Widget child;
  final String location;

  const _AppShell({required this.child, required this.location});

  @override
  ConsumerState<_AppShell> createState() => _AppShellState();
}

/// Staff orders for staff with an orders permission; a packer without one
/// (the dispatch team) gets the Packing list instead of a refused list.
class _StaffOrders extends ConsumerWidget {
  const _StaffOrders();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final u = ref.watch(authProvider).user;
    final seesOrders = u?.role == 'admin' ||
        (u?.permissions.contains('orders_view') ?? false) ||
        (u?.permissions.contains('orders_edit') ?? false);
    if (!seesOrders && (u?.canPack ?? false)) return const PackingListScreen();
    return const AdminOrdersScreen();
  }
}

/// Shows [staff] to admin and employee logins, [other] to everyone else.
class _ForStaff extends ConsumerWidget {
  final Widget staff;
  final Widget other;
  const _ForStaff({required this.staff, required this.other});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final role = ref.watch(authProvider).user?.role;
    return role == 'admin' || role == 'employee' ? staff : other;
  }
}

class _NavItem {
  final String route;
  final IconData icon;
  final IconData selectedIcon;
  final String label;
  const _NavItem({required this.route, required this.icon, required this.selectedIcon, required this.label});
}

const _teal = Color(0xFF00A6A4);

/// True while the app shell shows a page other than the first tab: back
/// there goes to the first tab, so Android must send back to the app.
class _BackGoesHome {
  static bool active = false;
}

class _AppShellState extends ConsumerState<_AppShell> with WidgetsBindingObserver {
  // the daily "Save everything", when due, each time the app comes back
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state != AppLifecycleState.resumed) return;
    // what the background job saved while the app was away
    SharedPreferences.getInstance().then((p) => p.reload()).then((_) {
      PresentationDownloads.changes.value++;
      OfflineCache.forgetLoaded();
      OfflineSync.runDailyIfDue();
    });
  }

  // Opens the page of a tapped notification (notification_links.dart) once
  // the app is up and logged in.
  void _openPendingLink() {
    final route = NotificationLinks.pending.value;
    if (route == null || !mounted || ref.read(authProvider).user == null) return;
    NotificationLinks.pending.value = null;
    context.push(route);
  }

  @override
  void dispose() {
    _BackGoesHome.active = false;
    NotificationLinks.pending.removeListener(_openPendingLink);
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void initState() {
    super.initState();
    NotificationLinks.pending.addListener(_openPendingLink);
    WidgetsBinding.instance.addObserver(this);
    // a tap that launched the app was recorded before this frame existed
    WidgetsBinding.instance.addPostFrameCallback((_) => _openPendingLink());
    // once, after login: how to keep data for offline use
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted && ref.read(authProvider).user != null) {
        OfflineChoice.askOnce(context).then((_) => OfflineSync.runDailyIfDue());
      }
    });
    Future.microtask(() =>
        ref.read(authProvider.notifier).loadUser().catchError((_) {}));
    Future.microtask(() => ref.read(notificationsProvider.notifier).load());
    Future.microtask(() => ref.read(cartProvider.notifier).loadFromServer());
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(authProvider).user;
    if (user == null) {
      WidgetsBinding.instance
          .addPostFrameCallback((_) => context.go('/login'));
      return const Scaffold(
        body: Center(
            child: CircularProgressIndicator(color: Color(0xFF00A6A4))),
      );
    }

    // "My Doctors" is a personal doctor-tracking list, which only makes
    // sense for partners and their team members (medical reps track
    // meetings differently) — team members see their owning partner's
    // doctors, resolved server-side. Not shown to admin/employee logins.
    final isPartner = user.role == 'partner' || user.role == 'team_member';
    // Doctor logins browse their partner's catalogue and order from the
    // partner like retailers; no meetings or doctor-CRM tracking.
    final isDoctor = user.role == 'doctor';
    // Retailers order from their partner, not Moulins: their Orders tab is
    // their orders to the partner, and there are no meetings.
    final isRetailer = user.role == 'retailer';
    final isStaff = user.role == 'admin' || user.role == 'employee';
    final canSeeOrders =
        user.role == 'admin' || user.permissions.contains('orders_view') || user.permissions.contains('orders_edit');
    // The dispatch team gets only their tools: packing, Marg stock, their
    // attendance and leave, freight bills, and their profile (change
    // password, log out).
    // They land on Packing rather than the shop's home page.
    if (isTeamApp && user.isDispatch && (widget.location == '/home' || widget.location == '/')) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) context.go('/packing');
      });
    }
    final destinations = isTeamApp && user.isDispatch
        ? <_NavItem>[
            const _NavItem(route: '/packing', icon: Icons.inventory_2_outlined, selectedIcon: Icons.inventory_2, label: 'Packing'),
            if (user.has('marg_stock_view'))
              const _NavItem(route: '/staff/stock', icon: Icons.warehouse_outlined, selectedIcon: Icons.warehouse, label: 'Stock'),
            const _NavItem(route: '/staff/attendance', icon: Icons.event_available_outlined, selectedIcon: Icons.event_available, label: 'Attendance'),
            if (user.has('freight_bills_edit'))
              const _NavItem(route: '/staff/freight', icon: Icons.local_shipping_outlined, selectedIcon: Icons.local_shipping, label: 'Freight'),
            const _NavItem(route: '/profile', icon: Icons.person_outline, selectedIcon: Icons.person, label: 'Profile'),
          ]
        : <_NavItem>[
      const _NavItem(route: '/home', icon: Icons.home_outlined, selectedIcon: Icons.home, label: 'Home'),
      const _NavItem(route: '/products', icon: Icons.medication_outlined, selectedIcon: Icons.medication, label: 'Products'),
      // Doctors for partners and team members: it is their daily work.
      // A partner's Dashboard (balance, bills, orders) sits last, in the
      // Orders spot; their orders open from the dashboard.
      if (isPartner)
        const _NavItem(route: '/doctors', icon: Icons.people_outlined, selectedIcon: Icons.people, label: 'Doctors'),
      // the dispatch team has no meetings
      if (!isDoctor && !isRetailer && !user.isDispatch)
        const _NavItem(route: '/meetings', icon: Icons.calendar_today_outlined, selectedIcon: Icons.calendar_today, label: 'Meetings'),
      // staff see orders only with an orders permission
      // a team member: Moulins orders only when their partner allows it
      if (user.role == 'partner')
        const _NavItem(route: '/dashboard', icon: Icons.dashboard_outlined, selectedIcon: Icons.dashboard, label: 'Dashboard')
      else if (!isDoctor && !isRetailer && (!isStaff || canSeeOrders) && (!user.isTeamMember || user.ordersToMoulins))
        const _NavItem(route: '/orders', icon: Icons.receipt_long_outlined, selectedIcon: Icons.receipt_long, label: 'Orders'),
      // a team member has one Orders tab: orders to Moulins with a switch to
      // their orders to the partner (TeamOrdersSwitch), or only the latter
      if (user.isTeamMember && user.ordersToPartner && !user.ordersToMoulins)
        const _NavItem(route: '/retailer-orders', icon: Icons.receipt_long_outlined, selectedIcon: Icons.receipt_long, label: 'Orders'),
      if (isRetailer || isDoctor)
        const _NavItem(route: '/retailer-orders', icon: Icons.receipt_long_outlined, selectedIcon: Icons.receipt_long, label: 'My Orders'),
      // packers (not admins, who have it under Admin) get their own tab
      if (isTeamApp && user.canPack && user.role != 'admin')
        const _NavItem(route: '/packing', icon: Icons.inventory_2_outlined, selectedIcon: Icons.inventory_2, label: 'Packing'),
      if (isTeamApp && (user.role == 'admin' || user.role == 'employee'))
        const _NavItem(route: '/admin', icon: Icons.admin_panel_settings_outlined, selectedIcon: Icons.admin_panel_settings, label: 'Admin'),
    ];

    var selectedIndex = destinations.indexWhere((d) => widget.location.startsWith(d.route));
    // a team member's To Partner page sits under their Orders tab
    if (selectedIndex < 0 && widget.location.startsWith('/retailer-orders')) {
      selectedIndex = destinations.indexWhere((d) => d.route == '/orders');
    }
    // a partner's orders open from their Dashboard tab
    if (selectedIndex < 0 && widget.location.startsWith('/orders')) {
      selectedIndex = destinations.indexWhere((d) => d.route == '/dashboard');
    }
    if (selectedIndex < 0) selectedIndex = 0;

    // Back (button or swipe) on a page with nothing under it, such as a tab
    // opened from the bottom bar (context.go replaces the page), goes to
    // the first tab instead of closing the app; back there closes it.
    // go_router 13 closes the app itself when nothing can pop, so the
    // listener catches it first. With predictive back (target SDK 36)
    // Android only sends back to the app when told the app handles it,
    // otherwise it closes the app without asking: _BackGoesHome makes the
    // app say so on every page but the first tab (see onNavigationNotification).
    final home = destinations.first.route;
    final atHome = widget.location == home;
    _BackGoesHome.active = !atHome;
    if (!atHome) {
      // tell Android now as well, for a page change that moves no route
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (_BackGoesHome.active) SystemNavigator.setFrameworkHandlesBack(true);
      });
    }
    return BackButtonListener(
      onBackButtonPressed: () async {
        if (!mounted || atHome) return false;
        final router = GoRouter.of(context);
        if (router.canPop()) return false; // a pushed page: normal back
        router.go(home);
        return true;
      },
      child: _scaffold(destinations, selectedIndex),
    );
  }

  Widget _scaffold(List<_NavItem> destinations, int selectedIndex) {
    return Scaffold(
      body: widget.child,
      // six tabs (a partner's) get slightly smaller labels so each fits
      bottomNavigationBar: NavigationBarTheme(
        data: NavigationBarThemeData(
          labelTextStyle: WidgetStatePropertyAll(TextStyle(
            fontSize: destinations.length > 5 ? 10.5 : 12,
            fontWeight: FontWeight.w500,
            overflow: TextOverflow.ellipsis,
          )),
        ),
        child: NavigationBar(
        selectedIndex: selectedIndex,
        onDestinationSelected: (i) => context.go(destinations[i].route),
        backgroundColor: Colors.white,
        indicatorColor: _teal.withValues(alpha: 0.15),
        destinations: [
          for (final d in destinations)
            NavigationDestination(
              icon: Icon(d.icon),
              selectedIcon: Icon(d.selectedIcon, color: _teal),
              label: d.label,
            ),
        ],
        ),
      ),
    );
  }
}
