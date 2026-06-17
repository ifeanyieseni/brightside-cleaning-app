import { supabase, supabaseUrl, supabaseAnonKey } from './supabase'
import type { MediaAsset, MediaType } from './types'

// ---------- buckets / limits / accepted formats ----------

export const IMAGE_BUCKET = 'media-images'
export const VIDEO_BUCKET = 'media-videos'

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024 // 10 MB
export const MAX_VIDEO_BYTES = 200 * 1024 * 1024 // 200 MB

const IMAGE_EXT = ['jpg', 'jpeg', 'png', 'webp']
const VIDEO_EXT = ['mp4', 'mov', 'webm']

/** `accept` attribute values for the two file pickers. */
export const IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp'
export const VIDEO_ACCEPT = 'video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm'

const MIME_BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
}

// ---------- small helpers ----------

export function formatBytes(n: number): string {
  if (!n) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)))
  return `${(n / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

function extOf(name: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(name.trim())
  return m ? m[1].toLowerCase() : ''
}

/** Infer image|video from a file, or null if the format is unsupported. */
export function mediaTypeForFile(file: File): MediaType | null {
  const ext = extOf(file.name)
  if (IMAGE_EXT.includes(ext) || file.type.startsWith('image/')) return 'image'
  if (VIDEO_EXT.includes(ext) || file.type.startsWith('video/')) return 'video'
  return null
}

/** Returns a human error string when a file is not valid for `type`, else null. */
export function validateFile(file: File, type: MediaType): string | null {
  const ext = extOf(file.name)
  const allowed = type === 'image' ? IMAGE_EXT : VIDEO_EXT
  if (!allowed.includes(ext)) {
    return `${file.name}: unsupported format. Allowed: ${allowed.join(', ').toUpperCase()}.`
  }
  const max = type === 'image' ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES
  if (file.size > max) {
    return `${file.name} is ${formatBytes(file.size)} — over the ${formatBytes(max)} limit.`
  }
  return null
}

function contentTypeFor(file: File): string {
  if (file.type) return file.type
  return MIME_BY_EXT[extOf(file.name)] ?? 'application/octet-stream'
}

/** Read an image's pixel dimensions (best-effort; resolves null on failure). */
function readImageSize(file: File): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve({ width: img.naturalWidth, height: img.naturalHeight })
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(null)
    }
    img.src = url
  })
}

// ---------- storage transfer (XHR → real progress) ----------

/**
 * Upload a file to Storage via the REST endpoint so we get genuine
 * upload-progress events (supabase-js `.upload()` does not expose these).
 */
function putObject(
  bucket: string,
  path: string,
  file: File,
  upsert: boolean,
  onProgress?: (fraction: number) => void
): Promise<void> {
  return new Promise(async (resolve, reject) => {
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    if (!token) {
      reject(new Error('You are signed out. Sign in again to upload media.'))
      return
    }

    const xhr = new XMLHttpRequest()
    const endpoint = `${supabaseUrl}/storage/v1/object/${bucket}/${encodeURIComponent(path)}`
    xhr.open('POST', endpoint, true)
    xhr.setRequestHeader('Authorization', `Bearer ${token}`)
    xhr.setRequestHeader('apikey', supabaseAnonKey)
    xhr.setRequestHeader('Content-Type', contentTypeFor(file))
    xhr.setRequestHeader('x-upsert', upsert ? 'true' : 'false')
    xhr.setRequestHeader('cache-control', 'max-age=3600')

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total)
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(1)
        resolve()
      } else {
        let msg = `Upload failed (${xhr.status}).`
        try {
          const body = JSON.parse(xhr.responseText)
          if (body?.message) msg = body.message
        } catch {
          /* keep default */
        }
        reject(new Error(msg))
      }
    }
    xhr.onerror = () => reject(new Error('Network error during upload.'))
    xhr.send(file)
  })
}

function publicUrlFor(bucket: string, path: string): string {
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl
}

// ---------- public API ----------

export async function listMedia(): Promise<MediaAsset[]> {
  const { data, error } = await supabase
    .from('media_assets')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data as MediaAsset[]) ?? []
}

/** Upload one file, store its metadata row, and return the new asset. */
export async function uploadMedia(
  file: File,
  type: MediaType,
  onProgress?: (fraction: number) => void
): Promise<MediaAsset> {
  const invalid = validateFile(file, type)
  if (invalid) throw new Error(invalid)

  const bucket = type === 'image' ? IMAGE_BUCKET : VIDEO_BUCKET
  const path = `${crypto.randomUUID()}.${extOf(file.name)}`

  await putObject(bucket, path, file, false, onProgress)

  const dims = type === 'image' ? await readImageSize(file) : null
  const row = {
    type,
    bucket,
    path,
    public_url: publicUrlFor(bucket, path),
    file_name: file.name,
    mime_type: contentTypeFor(file),
    size_bytes: file.size,
    width: dims?.width ?? null,
    height: dims?.height ?? null,
  }

  const { data, error } = await supabase.from('media_assets').insert(row).select().single()
  if (error) {
    // Roll back the orphaned object so storage + metadata stay in sync.
    await supabase.storage.from(bucket).remove([path])
    throw error
  }
  return data as MediaAsset
}

/**
 * Replace an existing asset's file in place (same metadata row + id).
 * Uploads the new file to a fresh path, repoints the row, then removes
 * the old object. The new file must be the same media type.
 */
export async function replaceMedia(
  asset: MediaAsset,
  file: File,
  onProgress?: (fraction: number) => void
): Promise<MediaAsset> {
  const invalid = validateFile(file, asset.type)
  if (invalid) throw new Error(invalid)

  const newPath = `${crypto.randomUUID()}.${extOf(file.name)}`
  await putObject(asset.bucket, newPath, file, false, onProgress)

  const dims = asset.type === 'image' ? await readImageSize(file) : null
  const { data, error } = await supabase
    .from('media_assets')
    .update({
      path: newPath,
      public_url: publicUrlFor(asset.bucket, newPath),
      file_name: file.name,
      mime_type: contentTypeFor(file),
      size_bytes: file.size,
      width: dims?.width ?? null,
      height: dims?.height ?? null,
    })
    .eq('id', asset.id)
    .select()
    .single()

  if (error) {
    await supabase.storage.from(asset.bucket).remove([newPath])
    throw error
  }
  // Best-effort cleanup of the now-unreferenced old object.
  await supabase.storage.from(asset.bucket).remove([asset.path])
  return data as MediaAsset
}

/** Delete an asset's object and its metadata row. */
export async function deleteMedia(asset: MediaAsset): Promise<void> {
  const { error: storageError } = await supabase.storage.from(asset.bucket).remove([asset.path])
  if (storageError) throw storageError
  const { error } = await supabase.from('media_assets').delete().eq('id', asset.id)
  if (error) throw error
}

/** True when the error looks like "the media migration hasn't been run yet". */
export function isMissingMediaSetup(error: unknown): boolean {
  const msg = (error as { message?: string })?.message?.toLowerCase() ?? ''
  return (
    msg.includes('media_assets') ||
    msg.includes('relation') ||
    msg.includes('does not exist') ||
    msg.includes('bucket not found')
  )
}
