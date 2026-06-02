"use client"

import { useEffect, useState } from "react"
import { api } from "@/lib/api"
import { Switch } from "@/components/ui/switch"
import { Icon } from "@/components/dashboard/icons"

// Per-project rank-change alert settings. Mirrors the backend
// notificationSettingsSchema (GET/PATCH /api/projects/:id/notification-settings).
interface AlertSettings {
  alertsEnabled: boolean
  alertEmailEnabled: boolean
  alertMovementThreshold: number
  alertPage1Cross: boolean
  alertSerpFeature: boolean
  email: string | null
}

const DEFAULTS: AlertSettings = {
  alertsEnabled: false,
  alertEmailEnabled: true,
  alertMovementThreshold: 5,
  alertPage1Cross: true,
  alertSerpFeature: false,
  email: null,
}

function Row({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
      <div style={{ minWidth: 0 }}>
        <div className="b" style={{ fontSize: 13 }}>{label}</div>
        {hint && <div className="tiny muted" style={{ marginTop: 2 }}>{hint}</div>}
      </div>
      <div style={{ flexShrink: 0 }}>{children}</div>
    </div>
  )
}

export function AlertSettingsModal({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const [settings, setSettings] = useState<AlertSettings>(DEFAULTS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const data = await api.get<Partial<AlertSettings>>(`/api/projects/${projectId}/notification-settings`)
        if (!cancelled) setSettings({ ...DEFAULTS, ...data })
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load alert settings")
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [projectId])

  const patch = (next: Partial<AlertSettings>) => setSettings((s) => ({ ...s, ...next }))

  const handleSave = async () => {
    setSaving(true)
    setError("")
    try {
      await api.patch(`/api/projects/${projectId}/notification-settings`, {
        alertsEnabled: settings.alertsEnabled,
        alertEmailEnabled: settings.alertEmailEnabled,
        alertMovementThreshold: settings.alertMovementThreshold,
        alertPage1Cross: settings.alertPage1Cross,
        alertSerpFeature: settings.alertSerpFeature,
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save alert settings")
    } finally {
      setSaving(false)
    }
  }

  const disabled = !settings.alertsEnabled

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
        <div className="modal-h">
          <div>
            <div className="eyebrow" style={{ margin: 0, fontSize: 11 }}>
              <span className="spark"><Icon.spark /></span> RANK-CHANGE ALERTS
            </div>
            <div className="b" style={{ fontSize: 18, marginTop: 4 }}>Notification settings</div>
          </div>
          <button onClick={onClose} className="icon-btn" aria-label="Close"><Icon.close /></button>
        </div>

        <div className="modal-b" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {loading ? (
            <div className="tiny muted">Loading…</div>
          ) : (
            <>
              <Row label="Enable alerts" hint="Get notified when this project's keywords move.">
                <Switch checked={settings.alertsEnabled} onCheckedChange={(v) => patch({ alertsEnabled: v })} />
              </Row>

              <div style={{ height: 1, background: "var(--border)" }} />

              <Row
                label="Email me"
                hint={settings.email ? `Sends to ${settings.email}` : "No project email set — add one to receive emails."}
              >
                <Switch
                  checked={settings.alertEmailEnabled}
                  disabled={disabled}
                  onCheckedChange={(v) => patch({ alertEmailEnabled: v })}
                />
              </Row>

              <Row label="Big movements" hint="Alert when a keyword moves by at least this many positions (0 = off).">
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={settings.alertMovementThreshold}
                  disabled={disabled}
                  onChange={(e) => patch({ alertMovementThreshold: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })}
                  className="input"
                  style={{ width: 72, paddingTop: 6, paddingBottom: 6, fontSize: 13, textAlign: "center" }}
                />
              </Row>

              <Row label="Page 1 crossings" hint="Alert when a keyword enters or leaves the top 10.">
                <Switch
                  checked={settings.alertPage1Cross}
                  disabled={disabled}
                  onCheckedChange={(v) => patch({ alertPage1Cross: v })}
                />
              </Row>

              <Row label="SERP feature changes" hint="Alert when the SERP gains or loses a feature (AI Overview, snippet…).">
                <Switch
                  checked={settings.alertSerpFeature}
                  disabled={disabled}
                  onCheckedChange={(v) => patch({ alertSerpFeature: v })}
                />
              </Row>

              {error && <div className="tiny" style={{ color: "var(--neg)" }}>{error}</div>}
            </>
          )}
        </div>

        <div className="modal-f">
          <button className="btn" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn primary" onClick={handleSave} disabled={saving || loading}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  )
}
