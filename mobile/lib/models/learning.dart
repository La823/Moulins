class LearningVideo {
  final String id;
  final String youtubeId;
  final String youtubeUrl;
  final String title;
  final String? description;
  final String thumbnailUrl;
  final String? productId;
  final String? productName;

  LearningVideo({
    required this.id,
    required this.youtubeId,
    required this.youtubeUrl,
    required this.title,
    this.description,
    required this.thumbnailUrl,
    this.productId,
    this.productName,
  });

  factory LearningVideo.fromJson(Map<String, dynamic> json) => LearningVideo(
        id: json['id'] ?? '',
        youtubeId: json['youtube_id'] ?? '',
        youtubeUrl: json['youtube_url'] ?? '',
        title: json['title'] ?? '',
        description: json['description'],
        thumbnailUrl: json['thumbnail_url'] ?? '',
        productId: json['product_id'],
        productName: json['product_name'],
      );
}

class LearningPlaylist {
  final String id;
  final String title;
  final String? description;
  final int videoCount;

  LearningPlaylist({
    required this.id,
    required this.title,
    this.description,
    required this.videoCount,
  });

  factory LearningPlaylist.fromJson(Map<String, dynamic> json) => LearningPlaylist(
        id: json['id'] ?? '',
        title: json['title'] ?? '',
        description: json['description'],
        videoCount: json['video_count'] ?? 0,
      );
}
