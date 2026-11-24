import 'package:flutter/material.dart';
import '../config/app_flavor.dart';
import '../services/app_update.dart';

/// "Moulins v2.0.1 (30)": the installed app's version name and build number,
/// read from the app itself (pubspec version / the build's --build-name and
/// --build-number), so it is always the real one. Shown at the bottom of the
/// side menu and the profile page.
class AppVersionText extends StatelessWidget {
  const AppVersionText({super.key});

  @override
  Widget build(BuildContext context) {
    return FutureBuilder(
      future: AppBuildInfo.info(),
      builder: (context, snap) {
        final info = snap.data;
        if (info == null) return const SizedBox(height: 16);
        return Text(
          '$appName v${info.version} (${info.buildNumber})',
          textAlign: TextAlign.center,
          style: TextStyle(color: Colors.grey.shade500, fontSize: 11.5, letterSpacing: 0.2),
        );
      },
    );
  }
}
