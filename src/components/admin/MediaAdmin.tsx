import { useEffect, useRef, useState } from 'react'
import {
  Upload,
  Film,
  Image as ImageIcon,
  ImageOff,
  Play,
  Unplug,
  Database,
  AlertTriangle,
} from 'lucide-react'
import { isSupabaseConfigured } from '../../lib/supabase'
import type { MediaAsset, MediaType } from '../../lib/types'
import {
  IMAGE_ACCEPT,
  VIDEO_ACCEPT,
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
  formatBytes,
  mediaTypeForFile,
  uploadMedia,
  replaceMedia,
  deleteMedia,
  listMedia,
  isMissingMediaSetup,
} from '../../lib/media'

type Filter = 'all' | 'image' | 'video'

interface UploadJob {
  id: string
  name: string
  type: MediaType
  mode: 'upload' | 'replace'
  previewUrl: string | null
  progress: number
  status: 'working' | 'error'
  error?: string
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready' }
  | { kind: 'unconfigured' }
  | { kind: 'needs-setup' }
  | { kind: 'error'; message: string }

export default function MediaAdmin() {
  const [assets, setAssets] = useState<MediaAsset[]>([])
  const [load, setLoad] = useState<LoadState>({ kind: 'loading' })
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [jobs, setJobs] = useState<UploadJob[]>([])
  const [flash, setFlash] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)

  const imageInputRef = useRef<HTMLInputElement>(null)
  const videoInputRef = useRef<HTMLInputElement>(null)
  const replaceInputRef = useRef<HTMLInputElement>(null)
  const replaceTargetRef = useRef<MediaAsset | null>(null)

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoad({ kind: 'unconfigured' })
      return
    }
    listMedia()
      .then((rows) => {
        setAssets(rows)
        setLoad({ kind: 'ready' })
      })
      .catch((err) => {
        setLoad(
          isMissingMediaSetup(err)
            ? { kind: 'needs-setup' }
            : { kind: 'error', message: err?.message ?? 'Could not load media.' }
        )
      })
  }, [])

  function updateJob(id: string, patch: Partial<UploadJob>) {
    setJobs((js) => js.map((j) => (j.id === id ? { ...j, ...patch } : j)))
  }

  function dismissJob(id: string) {
    setJobs((js) => {
      const job = js.find((j) => j.id === id)
      if (job?.previewUrl) URL.revokeObjectURL(job.previewUrl)
      return js.filter((j) => j.id !== id)
    })
  }

  async function runUpload(file: File, type: MediaType) {
    const id = crypto.randomUUID()
    const previewUrl = URL.createObjectURL(file)
    setJobs((js) => [
      ...js,
      { id, name: file.name, type, mode: 'upload', previewUrl, progress: 0, status: 'working' },
    ])
    try {
      const asset = await uploadMedia(file, type, (f) => updateJob(id, { progress: f }))
      setAssets((prev) => [asset, ...prev])
      dismissJob(id)
      setFlash({ kind: 'ok', text: `Uploaded “${file.name}”.` })
      if (load.kind !== 'ready') setLoad({ kind: 'ready' })
    } catch (err) {
      updateJob(id, { status: 'error', error: (err as Error).message })
      setFlash({ kind: 'err', text: (err as Error).message })
    }
  }

  async function runReplace(file: File, target: MediaAsset) {
    const id = crypto.randomUUID()
    const previewUrl = URL.createObjectURL(file)
    setJobs((js) => [
      ...js,
      {
        id,
        name: file.name,
        type: target.type,
        mode: 'replace',
        previewUrl,
        progress: 0,
        status: 'working',
      },
    ])
    try {
      const updated = await replaceMedia(target, file, (f) => updateJob(id, { progress: f }))
      setAssets((prev) => prev.map((a) => (a.id === updated.id ? updated : a)))
      dismissJob(id)
      setFlash({ kind: 'ok', text: `Replaced “${target.file_name}”.` })
    } catch (err) {
      updateJob(id, { status: 'error', error: (err as Error).message })
      setFlash({ kind: 'err', text: (err as Error).message })
    }
  }

  function handlePicked(files: FileList | null, forced?: MediaType) {
    if (!files) return
    setFlash(null)
    for (const file of Array.from(files)) {
      const type = forced ?? mediaTypeForFile(file)
      if (!type) {
        setFlash({ kind: 'err', text: `“${file.name}” is not a supported image or video.` })
        continue
      }
      runUpload(file, type)
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    handlePicked(e.dataTransfer.files)
  }

  function startReplace(asset: MediaAsset) {
    replaceTargetRef.current = asset
    const input = replaceInputRef.current
    if (!input) return
    input.accept = asset.type === 'image' ? IMAGE_ACCEPT : VIDEO_ACCEPT
    input.value = ''
    input.click()
  }

  async function remove(asset: MediaAsset) {
    if (!window.confirm(`Delete “${asset.file_name}”? This cannot be undone.`)) return
    setBusyId(asset.id)
    try {
      await deleteMedia(asset)
      setAssets((prev) => prev.filter((a) => a.id !== asset.id))
      setFlash({ kind: 'ok', text: `Deleted “${asset.file_name}”.` })
    } catch (err) {
      setFlash({ kind: 'err', text: (err as Error).message })
    } finally {
      setBusyId(null)
    }
  }

  async function copyUrl(asset: MediaAsset) {
    try {
      await navigator.clipboard.writeText(asset.public_url)
    } catch {
      window.prompt('Copy this media URL:', asset.public_url)
      return
    }
    setCopiedId(asset.id)
    window.setTimeout(() => setCopiedId((c) => (c === asset.id ? null : c)), 1500)
  }

  const counts = {
    all: assets.length,
    image: assets.filter((a) => a.type === 'image').length,
    video: assets.filter((a) => a.type === 'video').length,
  }

  const q = search.trim().toLowerCase()
  const visible = assets.filter((a) => {
    if (filter !== 'all' && a.type !== filter) return false
    if (!q) return true
    return (
      a.file_name.toLowerCase().includes(q) ||
      (a.title ?? '').toLowerCase().includes(q) ||
      (a.alt_text ?? '').toLowerCase().includes(q)
    )
  })

  return (
    <>
      <div className="admin-head">
        <div>
          <h2>Media Library</h2>
          <p>Upload, organise, and reuse images and videos for your site.</p>
        </div>
        <div className="row-actions">
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => imageInputRef.current?.click()}
            disabled={load.kind === 'unconfigured'}
          >
            + Images
          </button>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => videoInputRef.current?.click()}
            disabled={load.kind === 'unconfigured'}
          >
            + Videos
          </button>
        </div>
      </div>

      {flash && <p className={`flash flash-${flash.kind}`}>{flash.text}</p>}

      {/* hidden file inputs */}
      <input
        ref={imageInputRef}
        type="file"
        accept={IMAGE_ACCEPT}
        multiple
        hidden
        onChange={(e) => handlePicked(e.target.files, 'image')}
      />
      <input
        ref={videoInputRef}
        type="file"
        accept={VIDEO_ACCEPT}
        multiple
        hidden
        onChange={(e) => handlePicked(e.target.files, 'video')}
      />
      <input
        ref={replaceInputRef}
        type="file"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          const target = replaceTargetRef.current
          if (file && target) runReplace(file, target)
          replaceTargetRef.current = null
        }}
      />

      {load.kind === 'unconfigured' ? (
        <div className="panel panel-pad empty-state">
          <div className="glyph" aria-hidden="true">
            <Unplug size={26} />
          </div>
          <b>Media library isn’t connected</b>
          Add your backend credentials to <code>.env</code>, then restart the dev server to
          enable media uploads.
        </div>
      ) : load.kind === 'needs-setup' ? (
        <div className="panel panel-pad empty-state">
          <div className="glyph" aria-hidden="true">
            <Database size={26} />
          </div>
          <b>Media storage not set up</b>
          The media storage hasn’t been initialised yet. Complete the one-time backend setup, then
          reload.
        </div>
      ) : load.kind === 'error' ? (
        <div className="panel panel-pad empty-state">
          <div className="glyph" aria-hidden="true">
            <AlertTriangle size={26} />
          </div>
          <b>Could not load media</b>
          {load.message}
        </div>
      ) : (
        <>
          {/* dropzone */}
          <div
            className={`media-dropzone${dragging ? ' dragging' : ''}`}
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => imageInputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') imageInputRef.current?.click()
            }}
          >
            <div className="media-dropzone-icon" aria-hidden="true">
              <Upload size={28} />
            </div>
            <b>Drag &amp; drop files here, or click to browse</b>
            <span className="media-dropzone-hint">
              Images: JPG, PNG, WEBP (≤ {formatBytes(MAX_IMAGE_BYTES)}) · Videos: MP4, MOV, WEBM (≤{' '}
              {formatBytes(MAX_VIDEO_BYTES)})
            </span>
          </div>

          {/* in-progress / failed jobs */}
          {jobs.length > 0 && (
            <div className="upload-jobs">
              {jobs.map((job) => (
                <div key={job.id} className={`upload-job${job.status === 'error' ? ' is-error' : ''}`}>
                  <div className="upload-job-thumb">
                    {job.type === 'image' && job.previewUrl ? (
                      <img src={job.previewUrl} alt="" />
                    ) : (
                      <span aria-hidden="true">
                        {job.type === 'video' ? <Film size={20} /> : <ImageIcon size={20} />}
                      </span>
                    )}
                  </div>
                  <div className="upload-job-body">
                    <div className="upload-job-name">
                      {job.mode === 'replace' ? 'Replacing · ' : ''}
                      {job.name}
                    </div>
                    {job.status === 'error' ? (
                      <div className="upload-job-err">{job.error}</div>
                    ) : (
                      <div className="progress" aria-label="Upload progress">
                        <span
                          className="progress-bar"
                          style={{ width: `${Math.round(job.progress * 100)}%` }}
                        />
                      </div>
                    )}
                  </div>
                  <div className="upload-job-pct">
                    {job.status === 'error' ? (
                      <button className="btn btn-ghost btn-sm" onClick={() => dismissJob(job.id)}>
                        Dismiss
                      </button>
                    ) : (
                      `${Math.round(job.progress * 100)}%`
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* toolbar */}
          <div className="media-toolbar">
            <input
              className="input media-search"
              type="search"
              placeholder="Search media by name…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="chip-row">
              {(['all', 'image', 'video'] as Filter[]).map((f) => (
                <button
                  key={f}
                  className={`chip${filter === f ? ' on' : ''}`}
                  onClick={() => setFilter(f)}
                >
                  {f === 'all' ? 'All' : f === 'image' ? 'Images' : 'Videos'} ({counts[f]})
                </button>
              ))}
            </div>
          </div>

          {/* grid */}
          {load.kind === 'loading' ? (
            <div className="panel empty-state">
              <span className="spinner" style={{ margin: '0 auto 12px' }} aria-hidden="true" />
              Loading media…
            </div>
          ) : visible.length === 0 ? (
            <div className="panel empty-state">
              <div className="glyph" aria-hidden="true">
                <ImageOff size={26} />
              </div>
              <b>{assets.length === 0 ? 'No media yet' : 'No matches'}</b>
              {assets.length === 0
                ? 'Upload your first image or video to build the library.'
                : 'Try a different search or filter.'}
            </div>
          ) : (
            <div className="media-grid">
              {visible.map((a) => (
                <article className="media-card" key={a.id}>
                  <a
                    className="media-thumb"
                    href={a.public_url}
                    target="_blank"
                    rel="noreferrer"
                    title="Open in new tab"
                  >
                    {a.type === 'image' ? (
                      <img src={a.public_url} alt={a.alt_text ?? a.file_name} loading="lazy" />
                    ) : (
                      <>
                        <video src={a.public_url} preload="metadata" muted playsInline />
                        <span className="media-play" aria-hidden="true">
                          <Play size={18} />
                        </span>
                      </>
                    )}
                    <span className={`media-type-badge badge-${a.type}`}>{a.type}</span>
                  </a>
                  <div className="media-card-body">
                    <div className="media-card-name" title={a.file_name}>
                      {a.file_name}
                    </div>
                    <div className="media-card-meta">
                      {formatBytes(a.size_bytes)}
                      {a.width && a.height ? ` · ${a.width}×${a.height}` : ''}
                    </div>
                    <div className="media-card-actions">
                      <button className="btn btn-ghost btn-sm" onClick={() => copyUrl(a)}>
                        {copiedId === a.id ? '✓ Copied' : 'Copy URL'}
                      </button>
                      <button className="btn btn-ghost btn-sm" onClick={() => startReplace(a)}>
                        Replace
                      </button>
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => remove(a)}
                        disabled={busyId === a.id}
                      >
                        {busyId === a.id ? '…' : 'Delete'}
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </>
      )}
    </>
  )
}
