"use client"

import { useEffect, useRef, useState } from "react"
import { api } from "@/lib/api"
import { Switch } from "@/components/ui/switch"
import { Icon } from "@/components/dashboard/icons"
import { Dropdown } from "@/components/dashboard/dropdown"

// Per-project rank-change alert settings. Mirrors the backend
// notificationSettingsSchema (GET/PATCH /api/projects/:id/notification-settings).
type DigestFrequency = "daily" | "weekly" | "monthly"

interface AlertSettings {
  alertsEnabled: boolean
  alertEmailEnabled: boolean
  alertMovementThreshold: number
  alertPage1Cross: boolean
  alertSerpFeature: boolean
  email: string | null
  reportDigestEnabled: boolean
  reportDigestFrequency: DigestFrequency
}

const DEFAULTS: AlertSettings = {
  alertsEnabled: false,
  alertEmailEnabled: true,
  alertMovementThreshold: 5,
  alertPage1Cross: true,
  alertSerpFeature: false,
  email: null,
  reportDigestEnabled: false,
  reportDigestFrequency: "weekly",
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

  // Set once the user edits anything, so settings arriving late can't clobber
  // what they've already typed.
  const touchedRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const data = await api.get<Partial<AlertSettings>>(`/api/projects/${projectId}/notification-settings`)
        if (!cancelled && !touchedRef.current) setSettings({ ...DEFAULTS, ...data })
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Couldn't load your saved alert settings — you can still set them below.")
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [projectId])

  const patch = (next: Partial<AlertSettings>) => {
    touchedRef.current = true
    setSettings((s) => ({ ...s, ...next }))
  }

  const handleSave = async () => {
    setSaving(true)
    setError("")
    try {
      await api.patch(`/api/projects/${projectId}/notification-settings`, {
        email: settings.email ?? "",
        alertsEnabled: settings.alertsEnabled,
        alertEmailEnabled: settings.alertEmailEnabled,
        alertMovementThreshold: settings.alertMovementThreshold,
        alertPage1Cross: settings.alertPage1Cross,
        alertSerpFeature: settings.alertSerpFeature,
        reportDigestEnabled: settings.reportDigestEnabled,
        reportDigestFrequency: settings.reportDigestFrequency,
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
          {/* The form renders immediately with sensible defaults. Gating the whole
              body on the fetch meant a slow or failing request left the modal
              showing nothing but "Loading…". Saved values merge in when they
              arrive (unless the user has already started editing). */}
          {loading && <div className="tiny muted">Loading your saved settings…</div>}
          {error && <div className="tiny" style={{ color: "var(--neg)" }}>{error}</div>}
          <>
              <div>
                <div className="b" style={{ fontSize: 13 }}>Email address</div>
                <div className="tiny muted" style={{ marginTop: 2, marginBottom: 6 }}>
                  Where rank alerts and scheduled reports are sent.
                </div>
                <input
                  type="email"
                  value={settings.email ?? ""}
                  onChange={(e) => patch({ email: e.target.value || null })}
                  placeholder="you@example.com"
                  className="input"
                  style={{ width: "100%", fontSize: 13, paddingTop: 6, paddingBottom: 6 }}
                />
              </div>

              <div style={{ height: 1, background: "var(--border)" }} />

              <Row label="Enable alerts" hint="Get notified when this project's keywords move.">
                <Switch checked={settings.alertsEnabled} onCheckedChange={(v) => patch({ alertsEnabled: v })} />
              </Row>

              <Row label="Email me" hint="Also email me each time a tracked keyword moves.">
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

              <div style={{ height: 1, background: "var(--border)" }} />

              <Row label="Scheduled report" hint="Email a rank-report summary on a regular schedule.">
                <Switch
                  checked={settings.reportDigestEnabled}
                  onCheckedChange={(v) => patch({ reportDigestEnabled: v })}
                />
              </Row>

              <Row
                label="Frequency"
                hint={settings.email ? "How often the report digest is emailed." : "Add an email address above to receive it."}
              >
                <Dropdown
                  value={settings.reportDigestFrequency}
                  disabled={!settings.reportDigestEnabled}
                  options={[
                    { value: "daily", label: "Daily" },
                    { value: "weekly", label: "Weekly" },
                    { value: "monthly", label: "Monthly" },
                  ]}
                  onChange={(v) => patch({ reportDigestFrequency: v as DigestFrequency })}
                  ariaLabel="Report digest frequency"
                />
              </Row>

          </>
        </div>

        <div className="modal-f">
          <button className="btn" onClick={onClose} disabled={saving}>Cancel</button>
          {/* Still saveable when the load failed — the user can set values fresh. */}
          <button className="btn primary" onClick={handleSave} disabled={saving || (loading && !error)}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  )
}
