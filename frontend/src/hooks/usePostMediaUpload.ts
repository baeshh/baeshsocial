import { useCallback, useState, type ChangeEvent } from 'react'
import { uploadPostMediaFile } from '../lib/readMediaFile'

export const MAX_POST_MEDIA = 6

export function usePostMediaUpload(token: string) {
  const [mediaUrls, setMediaUrls] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  const handlePick = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files ?? [])
      event.target.value = ''
      const room = MAX_POST_MEDIA - mediaUrls.length
      if (files.length === 0 || room <= 0) {
        return
      }

      setUploading(true)
      setUploadError(null)
      const failures: string[] = []
      for (const file of files.slice(0, room)) {
        try {
          const url = await uploadPostMediaFile(token, file)
          setMediaUrls((prev) => (prev.length < MAX_POST_MEDIA ? [...prev, url] : prev))
        } catch (error) {
          failures.push(`${file.name}: ${error instanceof Error ? error.message : '업로드 실패'}`)
        }
      }
      if (files.length > room) {
        failures.push(`첨부는 최대 ${MAX_POST_MEDIA}개까지 가능합니다.`)
      }
      setUploadError(failures.length ? failures.join('\n') : null)
      setUploading(false)
    },
    [mediaUrls.length, token],
  )

  const reset = useCallback(() => {
    setMediaUrls([])
    setUploadError(null)
  }, [])

  return { mediaUrls, uploading, uploadError, handlePick, reset }
}
