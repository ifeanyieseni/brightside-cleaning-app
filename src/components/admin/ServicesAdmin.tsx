import { useEffect, useRef, useState } from 'react'
import { SprayCan, Pencil, Eye, EyeOff, Trash2, ImagePlus, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { listMedia, uploadMedia, IMAGE_ACCEPT } from '../../lib/media'
import type { MediaAsset, Service } from '../../lib/types'
import Modal from './Modal'

interface ServiceForm {
  name: string
  description: string
  duration_minutes: string
  price: string
  featured_image_url: string
  is_active: boolean
}

const emptyForm: ServiceForm = {
  name: '',
  description: '',
  duration_minutes: '120',
  price: '100',
  featured_image_url: '',
  is_active: true,
}

export default function ServicesAdmin() {
  const [rows, setRows] = useState<Service[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Service | 'new' | null>(null)
  const [form, setForm] = useState<ServiceForm>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [flash, setFlash] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  // Image picker state (shared with the Media Library — same uploads/storage).
  const [mediaImages, setMediaImages] = useState<MediaAsset[]>([])
  const [mediaErr, setMediaErr] = useState(false)
  const [uploadPct, setUploadPct] = useState<number | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('services').select('*').order('created_at')
    setRows((data as Service[]) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  // Load uploaded images whenever the editor opens, so the admin can pick or
  // upload a picture without leaving the form.
  useEffect(() => {
    if (editing === null) return
    let cancelled = false
    listMedia()
      .then((all) => {
        if (cancelled) return
        setMediaImages(all.filter((m) => m.type === 'image'))
        setMediaErr(false)
      })
      .catch(() => {
        if (!cancelled) setMediaErr(true)
      })
    return () => {
      cancelled = true
    }
  }, [editing])

  async function handleUpload(file: File | undefined) {
    if (!file) return
    setUploadPct(0)
    try {
      const asset = await uploadMedia(file, 'image', (f) => setUploadPct(Math.round(f * 100)))
      setMediaImages((prev) => [asset, ...prev])
      setForm((prev) => ({ ...prev, featured_image_url: asset.public_url }))
    } catch (e) {
      setFlash({ kind: 'err', text: (e as Error).message || 'Could not upload the image.' })
    } finally {
      setUploadPct(null)
    }
  }

  function openNew() {
    setForm(emptyForm)
    setEditing('new')
  }

  function openEdit(s: Service) {
    setForm({
      name: s.name,
      description: s.description,
      duration_minutes: String(s.duration_minutes),
      price: String(s.price),
      featured_image_url: s.featured_image_url ?? '',
      is_active: s.is_active,
    })
    setEditing(s)
  }

  async function save() {
    const payload = {
      name: form.name.trim(),
      description: form.description.trim(),
      duration_minutes: Math.max(15, parseInt(form.duration_minutes, 10) || 60),
      price: Math.max(0, parseFloat(form.price) || 0),
      featured_image_url: form.featured_image_url.trim() || null,
      is_active: form.is_active,
    }
    if (!payload.name) return

    setSaving(true)
    const result =
      editing === 'new'
        ? await supabase.from('services').insert(payload)
        : await supabase.from('services').update(payload).eq('id', (editing as Service).id)
    setSaving(false)

    if (result.error) {
      setFlash({ kind: 'err', text: 'Could not save the service — please try again.' })
      return
    }
    setFlash({
      kind: 'ok',
      text: editing === 'new' ? 'Service added. Active services appear in the booking flow immediately.' : 'Service updated.',
    })
    setEditing(null)
    load()
  }

  async function toggleActive(s: Service) {
    const { error } = await supabase
      .from('services')
      .update({ is_active: !s.is_active })
      .eq('id', s.id)
    if (!error) {
      setRows((rs) => rs.map((r) => (r.id === s.id ? { ...r, is_active: !r.is_active } : r)))
    }
  }

  async function remove(s: Service) {
    if (!window.confirm(`Delete “${s.name}”? This permanently removes the service.`)) return
    const { error } = await supabase.from('services').delete().eq('id', s.id)
    if (error) {
      // Most likely a foreign-key violation: appointments still reference
      // this service. Keep history intact and steer toward deactivating.
      setFlash({
        kind: 'err',
        text: 'Could not delete — this service has existing appointments. Deactivate it instead to hide it from booking while keeping its history.',
      })
      return
    }
    setRows((rs) => rs.filter((r) => r.id !== s.id))
    setFlash({ kind: 'ok', text: 'Service deleted.' })
  }

  return (
    <>
      <div className="admin-head">
        <div>
          <h2>Services</h2>
          <p>What clients can book. Deactivate instead of deleting to keep history intact.</p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={openNew}>
          + Add service
        </button>
      </div>

      {flash && <p className={`flash flash-${flash.kind}`}>{flash.text}</p>}

      <div className="panel">
        {loading ? (
          <div className="empty-state">
            <span className="spinner" style={{ margin: '0 auto 12px' }} aria-hidden="true" />
            Loading services…
          </div>
        ) : rows.length === 0 ? (
          <div className="empty-state">
            <div className="glyph" aria-hidden="true">
              <SprayCan size={26} />
            </div>
            <b>No services yet</b>
            Add your first cleaning service to start taking bookings.
          </div>
        ) : (
          <div className="table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Service</th>
                  <th>Duration</th>
                  <th>Price</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <span className="cell-main">{s.name}</span>
                      <span className="cell-sub cell-desc" title={s.description}>
                        {s.description}
                      </span>
                    </td>
                    <td>{s.duration_minutes} min</td>
                    <td>${Number(s.price).toFixed(2)}</td>
                    <td>
                      <span className={`badge badge-${s.is_active ? 'active' : 'inactive'}`}>
                        {s.is_active ? 'active' : 'inactive'}
                      </span>
                    </td>
                    <td>
                      <div className="row-actions">
                        <button
                          className="btn btn-ghost btn-sm btn-icon"
                          onClick={() => openEdit(s)}
                          aria-label="Edit service"
                          title="Edit"
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          className="btn btn-ghost btn-sm btn-icon"
                          onClick={() => toggleActive(s)}
                          aria-label={s.is_active ? 'Deactivate service' : 'Activate service'}
                          title={s.is_active ? 'Deactivate' : 'Activate'}
                        >
                          {s.is_active ? <EyeOff size={15} /> : <Eye size={15} />}
                        </button>
                        <button
                          className="btn btn-danger btn-sm btn-icon"
                          onClick={() => remove(s)}
                          aria-label="Delete service"
                          title="Delete"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing !== null && (
        <Modal
          title={editing === 'new' ? 'Add service' : 'Edit service'}
          onClose={() => setEditing(null)}
        >
          <div className="field">
            <label htmlFor="svc-name">Service name</label>
            <input
              id="svc-name"
              className="input"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Deep Cleaning"
            />
          </div>
          <div className="field">
            <label htmlFor="svc-desc">Description</label>
            <textarea
              id="svc-desc"
              className="textarea"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="What's included, in one or two sentences"
            />
          </div>
          <div className="form-row-2">
            <div className="field">
              <label htmlFor="svc-dur">Duration (minutes)</label>
              <input
                id="svc-dur"
                className="input"
                type="number"
                min={15}
                step={15}
                value={form.duration_minutes}
                onChange={(e) => setForm({ ...form, duration_minutes: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="svc-price">Price ($)</label>
              <input
                id="svc-price"
                className="input"
                type="number"
                min={0}
                step={5}
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
              />
            </div>
          </div>
          <div className="field">
            <label>Service image</label>

            {form.featured_image_url.trim() ? (
              <div className="svc-image-preview">
                <img
                  src={form.featured_image_url}
                  alt=""
                  onError={(e) => {
                    e.currentTarget.style.opacity = '0.25'
                  }}
                  onLoad={(e) => {
                    e.currentTarget.style.opacity = '1'
                  }}
                />
                <button
                  type="button"
                  className="svc-image-remove"
                  aria-label="Remove image"
                  title="Remove image"
                  onClick={() => setForm({ ...form, featured_image_url: '' })}
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <div className="svc-image-empty">
                No image set — the card uses an automatic one. Upload or choose below.
              </div>
            )}

            <div style={{ marginTop: 10 }}>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => fileRef.current?.click()}
                disabled={uploadPct !== null}
              >
                <ImagePlus size={15} style={{ marginRight: 6, verticalAlign: '-2px' }} />
                {uploadPct !== null ? `Uploading ${uploadPct}%…` : 'Upload image'}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept={IMAGE_ACCEPT}
                hidden
                onChange={(e) => {
                  handleUpload(e.target.files?.[0])
                  e.target.value = ''
                }}
              />
            </div>

            {mediaImages.length > 0 && (
              <>
                <span style={{ fontSize: '0.8rem', color: 'var(--ink-soft)', marginTop: 12 }}>
                  Or choose from your Media Library:
                </span>
                <div className="svc-image-grid">
                  {mediaImages.map((m) => (
                    <button
                      type="button"
                      key={m.id}
                      className={`svc-image-thumb ${
                        form.featured_image_url === m.public_url ? 'selected' : ''
                      }`}
                      onClick={() => setForm({ ...form, featured_image_url: m.public_url })}
                      title={m.file_name}
                    >
                      <img src={m.public_url} alt={m.alt_text ?? m.file_name} loading="lazy" />
                    </button>
                  ))}
                </div>
              </>
            )}

            {mediaErr && (
              <span style={{ fontSize: '0.8rem', color: 'var(--ink-soft)' }}>
                Media Library isn’t available yet — you can still paste an image URL below.
              </span>
            )}

            <input
              className="input"
              style={{ marginTop: 10 }}
              value={form.featured_image_url}
              onChange={(e) => setForm({ ...form, featured_image_url: e.target.value })}
              placeholder="…or paste an image URL"
            />
          </div>
          <div className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <span className="switch">
              <input
                id="svc-active"
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
              />
              <span className="track" />
            </span>
            <label htmlFor="svc-active" style={{ cursor: 'pointer' }}>
              Visible on the public booking page
            </label>
          </div>
          <div className="modal-foot">
            <button className="btn btn-ghost" onClick={() => setEditing(null)}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={save} disabled={saving || !form.name.trim()}>
              {saving ? 'Saving…' : 'Save service'}
            </button>
          </div>
        </Modal>
      )}
    </>
  )
}
