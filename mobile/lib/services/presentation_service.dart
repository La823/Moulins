import '../config/api.dart';
import '../models/presentation.dart';

class PresentationService {
  final _dio = createDio();

  Future<List<Presentation>> getPresentations() async {
    final res = await _dio.get('/presentations');
    return (res.data as List<dynamic>).map((e) => Presentation.fromJson(e)).toList();
  }

  Future<String> createPresentation(String name, {String? doctorId}) async {
    final res = await _dio.post('/presentations', data: {'name': name, 'doctor_id': doctorId});
    return res.data['id'] as String;
  }

  Future<PresentationDetail> getPresentation(String id) async {
    final res = await _dio.get('/presentations/$id');
    return PresentationDetail.fromJson(res.data);
  }

  // Renames the deck and sets/clears its linked doctor in one call —
  // doctorId null clears the link.
  Future<void> updatePresentation(String id, String name, {String? doctorId}) async {
    await _dio.put('/presentations/$id', data: {'name': name, 'doctor_id': doctorId});
  }

  // Replaces the deck's whole slide list with the given images in the
  // given order — the natural save shape for a drag-and-drop builder.
  Future<void> replaceSlides(String id, List<String> productImageIds) async {
    await _dio.put('/presentations/$id/slides', data: {'product_image_ids': productImageIds});
  }

  Future<void> deletePresentation(String id) async {
    await _dio.delete('/presentations/$id');
  }

  // (Re)builds the doctor's one default deck from every visual_aid image
  // of every product currently assigned to them — safe to call repeatedly.
  Future<String> generateDefaultForDoctor(String doctorId) async {
    final res = await _dio.post('/doctors/$doctorId/generate-presentation');
    return res.data['id'] as String;
  }
}
