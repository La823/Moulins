import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import 'package:geolocator/geolocator.dart';
import 'package:http/http.dart' as http;

const _mapsApiKey = 'AIzaSyAIjjIrpj8s3eWBjqRuh1XX0q2vgKCrmOc';
const _teal = Color(0xFF00A6A4);

class PickedLocation {
  final double lat;
  final double lng;
  final String? address;

  PickedLocation({required this.lat, required this.lng, this.address});
}

// Full-screen map picker — search an address, tap the map, or use the
// device's current location to drop a single marker, then return it via
// Navigator.pop. Used for setting a doctor's clinic location.
class LocationPickerScreen extends StatefulWidget {
  final PickedLocation? initial;

  const LocationPickerScreen({super.key, this.initial});

  @override
  State<LocationPickerScreen> createState() => _LocationPickerScreenState();
}

class _LocationPickerScreenState extends State<LocationPickerScreen> {
  GoogleMapController? _mapController;
  LatLng? _picked;
  String? _address;
  bool _locating = false;
  bool _searching = false;
  String? _error;
  final _searchCtrl = TextEditingController();

  static const _indiaCenter = LatLng(22.5, 79.5);

  @override
  void initState() {
    super.initState();
    if (widget.initial != null) {
      _picked = LatLng(widget.initial!.lat, widget.initial!.lng);
      _address = widget.initial!.address;
    }
  }

  Future<void> _reverseGeocode(LatLng pos) async {
    try {
      final uri = Uri.https('maps.googleapis.com', '/maps/api/geocode/json', {
        'latlng': '${pos.latitude},${pos.longitude}',
        'key': _mapsApiKey,
      });
      final res = await http.get(uri);
      final data = jsonDecode(res.body);
      final results = data['results'] as List<dynamic>?;
      if (mounted) {
        setState(() => _address = results != null && results.isNotEmpty ? results[0]['formatted_address'] as String? : null);
      }
    } catch (_) {
      // Address label is best-effort — the picked coordinates still work fine without it.
    }
  }

  void _onMapTap(LatLng pos) {
    setState(() => _picked = pos);
    _reverseGeocode(pos);
  }

  Future<void> _useCurrentLocation() async {
    setState(() { _locating = true; _error = null; });
    try {
      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }
      if (permission == LocationPermission.denied || permission == LocationPermission.deniedForever) {
        setState(() { _error = 'Location permission denied'; _locating = false; });
        return;
      }
      if (!await Geolocator.isLocationServiceEnabled()) {
        setState(() { _error = 'Please turn on location services'; _locating = false; });
        return;
      }
      final pos = await Geolocator.getCurrentPosition();
      final latLng = LatLng(pos.latitude, pos.longitude);
      setState(() => _picked = latLng);
      _mapController?.animateCamera(CameraUpdate.newLatLngZoom(latLng, 16));
      await _reverseGeocode(latLng);
    } catch (_) {
      setState(() => _error = 'Could not get your current location');
    } finally {
      if (mounted) setState(() => _locating = false);
    }
  }

  Future<void> _search() async {
    final query = _searchCtrl.text.trim();
    if (query.isEmpty) return;
    setState(() { _searching = true; _error = null; });
    try {
      final uri = Uri.https('maps.googleapis.com', '/maps/api/geocode/json', {
        'address': query,
        'components': 'country:IN',
        'key': _mapsApiKey,
      });
      final res = await http.get(uri);
      final data = jsonDecode(res.body);
      final results = data['results'] as List<dynamic>?;
      if (results == null || results.isEmpty) {
        setState(() => _error = 'No matching address found');
        return;
      }
      final loc = results[0]['geometry']['location'];
      final latLng = LatLng((loc['lat'] as num).toDouble(), (loc['lng'] as num).toDouble());
      setState(() {
        _picked = latLng;
        _address = results[0]['formatted_address'] as String?;
      });
      _mapController?.animateCamera(CameraUpdate.newLatLngZoom(latLng, 16));
    } catch (_) {
      setState(() => _error = 'Search failed');
    } finally {
      if (mounted) setState(() => _searching = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        title: const Text('Set Clinic Location', style: TextStyle(color: Color(0xFF1A1A1A), fontWeight: FontWeight.w600)),
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _searchCtrl,
                    onSubmitted: (_) => _search(),
                    decoration: InputDecoration(
                      hintText: 'Search an address...',
                      isDense: true,
                      filled: true,
                      fillColor: Colors.grey.shade50,
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide(color: Colors.grey.shade200)),
                      suffixIcon: IconButton(
                        icon: _searching
                            ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
                            : const Icon(Icons.search),
                        onPressed: _search,
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                IconButton(
                  onPressed: _locating ? null : _useCurrentLocation,
                  icon: _locating
                      ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: _teal))
                      : const Icon(Icons.my_location, color: _teal),
                  tooltip: 'Use current location',
                ),
              ],
            ),
          ),
          if (_error != null)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Text(_error!, style: const TextStyle(color: Colors.red, fontSize: 12.5)),
            ),
          Expanded(
            child: GoogleMap(
              initialCameraPosition: CameraPosition(target: _picked ?? _indiaCenter, zoom: _picked != null ? 15 : 4.2),
              onMapCreated: (c) => _mapController = c,
              onTap: _onMapTap,
              markers: _picked == null
                  ? {}
                  : {
                      Marker(
                        markerId: const MarkerId('picked'),
                        position: _picked!,
                        draggable: true,
                        onDragEnd: _onMapTap,
                      ),
                    },
              myLocationButtonEnabled: false,
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  _picked == null
                      ? 'Search, use current location, or tap the map to drop a pin.'
                      : (_address ?? '${_picked!.latitude.toStringAsFixed(5)}, ${_picked!.longitude.toStringAsFixed(5)}'),
                  style: TextStyle(fontSize: 12.5, color: Colors.grey.shade600),
                ),
                const SizedBox(height: 12),
                SizedBox(
                  width: double.infinity,
                  height: 48,
                  child: ElevatedButton(
                    onPressed: _picked == null
                        ? null
                        : () => Navigator.pop(context, PickedLocation(lat: _picked!.latitude, lng: _picked!.longitude, address: _address)),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: _teal,
                      foregroundColor: Colors.white,
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                      elevation: 0,
                    ),
                    child: const Text('Use this location'),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
