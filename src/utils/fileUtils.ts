// 파일 관련 유틸리티 함수

/**
 * 파일 크기를 읽기 쉬운 형식으로 포맷
 * @example 1024 -> "1.0 KB"
 * @example 1048576 -> "1.0 MB"
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}
