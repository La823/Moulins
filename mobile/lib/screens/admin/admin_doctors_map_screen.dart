import 'package:flutter/material.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import '../../models/doctor.dart';
import '../../services/doctor_service.dart';

const _teal = Color(0xFF00A6A4);
const _ink = Color(0xFF1A1A1A);

// Admin-only map of every doctor across every customer's clinic locations —
// a separate map from any customer-location map, showing doctors only.
class AdminDoctorsMapScreen extends StatefulWidget {
  const AdminDoctorsMapScreen({super.key});

  @override
  State<AdminDoctorsMapScreen> createState() => _AdminDoctorsMapScreenState();
}

class _AdminDoctorsMapScreenState extends State<AdminDoctorsMapScreen> {
  List<Doctor> _doctors = [];
  bool _loading = true;
  String? _error;
  GoogleMapController? _mapController;

  static const _indiaCenter = LatLng(22.5, 79.5);

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final doctors = await DoctorService().getAllDoctorsWithLocation();
      setState(() { _doctors = doctors; _loading = false; });
      if (doctors.length == 1) {
        _mapController?.animateCamera(
          CameraUpdate.newLatLngZoom(LatLng(doctors[0].latitude!, doctors[0].longitude!), 14),
        );
      } else if (doctors.isNotEmpty) {
        final bounds = _boundsFor(doctors);
        Future.delayed(const Duration(milliseconds: 300), () {
          _mapController?.animateCamera(CameraUpdate.newLatLngBounds(bounds, 60));
        });
      }
    } catch (_) {
      setState(() { _error = 'Could not load doctors'; _loading = false; });
    }
  }

  LatLngBounds _boundsFor(List<Doctor> doctors) {
    var minLat = doctors.first.latitude!, maxLat = doctors.first.latitude!;
    var minLng = doctors.first.longitude!, maxLng = doctors.first.longitude!;
    for (final d in doctors) {
      minLat = minLat < d.latitude! ? minLat : d.latitude!;
      maxLat = maxLat > d.latitude! ? maxLat : d.latitude!;
      minLng = minLng < d.longitude! ? minLng : d.longitude!;
      maxLng = maxLng > d.longitude! ? maxLng : d.longitude!;
    }
    return LatLngBounds(southwest: LatLng(minLat, minLng), northeast: LatLng(maxLat, maxLng));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        title: const Text('Doctors Map', style: TextStyle(color: _ink, fontWeight: FontWeight.w600)),
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  '${_doctors.length} doctor${_doctors.length != 1 ? 's' : ''} shown',
                  style: TextStyle(fontSize: 12.5, color: Colors.grey.shade500),
                ),
                if (_error != null) Text(_error!, style: const TextStyle(color: Colors.red, fontSize: 12.5)),
              ],
            ),
          ),
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator(color: _teal))
                : GoogleMap(
                    initialCameraPosition: const CameraPosition(target: _indiaCenter, zoom: 4.2),
                    onMapCreated: (c) => _mapController = c,
                    markers: _doctors
                        .map((d) => Marker(
                              markerId: MarkerId(d.id),
                              position: LatLng(d.latitude!, d.longitude!),
                              icon: BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueRed),
                              infoWindow: InfoWindow(
                                title: 'Dr. ${d.name}',
                                snippet: [
                                  if (d.clinicName != null) d.clinicName!,
                                  'Added by ${d.ownerName ?? d.ownerPhone ?? ''}',
                                ].join(' · '),
                              ),
                            ))
                        .toSet(),
                  ),
          ),
        ],
      ),
    );
  }
}
