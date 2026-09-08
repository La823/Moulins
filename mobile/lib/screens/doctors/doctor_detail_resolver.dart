import 'package:flutter/material.dart';
import '../../services/doctor_service.dart';
import 'doctor_detail_screen.dart';

const _teal = Color(0xFF00A6A4);

// Lets a route like /doctors/:id (from a notification deep link) reach the
// detail screen, which otherwise only ever gets pushed with a full Doctor
// object already in hand (see doctors_screen.dart). There's no
// GET /doctors/{id} endpoint, so this loads the full list and picks the
// match — the same request the doctors list screen already makes.
class DoctorDetailResolver extends StatefulWidget {
  final String doctorId;
  const DoctorDetailResolver({super.key, required this.doctorId});

  @override
  State<DoctorDetailResolver> createState() => _DoctorDetailResolverState();
}

class _DoctorDetailResolverState extends State<DoctorDetailResolver> {
  bool _notFound = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final doctors = await DoctorService().getDoctors();
      final match = doctors.where((d) => d.id == widget.doctorId);
      if (!mounted) return;
      if (match.isEmpty) {
        setState(() => _notFound = true);
        return;
      }
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(builder: (_) => DoctorDetailScreen(doctor: match.first)),
      );
    } catch (_) {
      if (mounted) setState(() => _notFound = true);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_notFound) {
      return Scaffold(
        appBar: AppBar(title: const Text('Doctor')),
        body: Center(child: Text('Doctor not found', style: TextStyle(color: Colors.grey.shade500))),
      );
    }
    return const Scaffold(body: Center(child: CircularProgressIndicator(color: _teal)));
  }
}
