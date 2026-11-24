import 'package:flutter/services.dart';

/// Which of the two apps this build is. Set by `--flavor` on Android
/// (android/app/build.gradle): "client" builds Moulins, the client app;
/// "team" builds MPPL Team, the staff app. iOS has no flavors and, like any
/// build without one, is the client app.
const bool isTeamApp = appFlavor == 'team';

/// The app's name as people see it.
const String appName = isTeamApp ? 'MPPL Team' : 'Moulins';

/// Logins MPPL Team is for: admins and employees (the dispatch team are
/// employees with staff_group = dispatch).
bool isStaffRole(String? role) => role == 'admin' || role == 'employee';
