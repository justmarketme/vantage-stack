'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Phone, PhoneOff, Loader2, Mic, Brain, Globe, Type, MapPin, Tag, List, Zap, CheckCircle2, AlertCircle, Rocket, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { useVoiceCall, type CallState } from '@/hooks/useVoiceCall'
import { generatePreviewHTML, generateFallbackWebsiteHTML, extractBrandFromUrl, getDefaultPreviewHTML } from '@/lib/demo-call/generatePreviewHTML'
import { triggerN8n } from '@/lib/demo-call/triggerN8n'
import { triggerTwilioCall } from '@/lib/demo-call/triggerTwilioCall'
import type { TabType, ManualFormData, WebsiteFormData, PreviewData } from '@/types/demo-call'

const inputCls = 'w-full bg-white/[0.03] border border-white/[0.07] rounded-xl px-4 py-3 text-sm text-textPrimary placeholder:text-textMuted outline-none focus:border-accent/50 focus:bg-white/[0.04] transition-all'
const labelCls = 'flex items-center gap-2 text-[10px] font-semibold uppercase tracking-widest text-textMuted mb-1.5'

const callLabels: Record<CallState, string> = {
  idle: 'Start Demo Call',
  connecting: 'Connecting...',
  listening: 'Listening...',
  thinking: 'Processing...',
  speaking: 'Speaking...',
  ending: 'Ending...',
}

// iPhone 14 Pro: 393 x 852px logical resolution
const PHONE_W = 393
const PHONE_H = 852
// Phone display height matches available vertical space nicely
const PHONE_DISPLAY_H = 480
const PHONE_DISPLAY_W = Math.round((PHONE_W / PHONE_H) * PHONE_DISPLAY_H) // ≈222px
const PHONE_SCALE = PHONE_DISPLAY_H / PHONE_H // ≈0.56

export function DemoCallClient() {
  const [panelOpen, setPanelOpen] = useState(true)
  const [activeTab, setActiveTab] = useState<TabType>('manual-info')
  const [websiteData, setWebsiteData] = useState<WebsiteFormData>({ url: '' })
  const [manualData, setManualData] = useState<ManualFormData>({ businessName: '', location: '', pricing: '', services: '' })
  const [previewHTML, setPreviewHTML] = useState<string>(getDefaultPreviewHTML())
  const [previewData, setPreviewData] = useState<PreviewData>({
    mode: 'manual',
    businessName: 'plumbing',
    location: 'pretoria east',
    pricing: 'call out fee R300',
    services: ['leak detection', 'toilets', 'geyser installation'],
  })
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [phoneNumber, setPhoneNumber] = useState('')
  const [dialState, setDialState] = useState<'idle' | 'dialling' | 'success' | 'error'>('idle')
  const [dialError, setDialError] = useState<string | null>(null)

  const { callState, startCall, endCall } = useVoiceCall({
    businessName: previewData.businessName ?? previewData.scrapedTitle,
    location: previewData.location,
    services: previewData.services,
    pricing: previewData.pricing,
    corpusId: previewData.corpusId,
  })

  const isCallActive = callState !== 'idle'
  const isCallLoading = callState === 'connecting' || callState === 'ending'
  const businessName = previewData.businessName ?? previewData.scrapedTitle ?? 'this business'

  const handleDeploy = async () => {
    setLoading(true)
    setError(null)
    setSuccess(false)
    try {
      if (activeTab === 'has-website') {
        if (!websiteData.url) { setError('Please enter a website URL'); setLoading(false); return }
        const loadingHTML = `<!DOCTYPE html><html><head><style>body{margin:0;background:#0B0B0C;display:flex;align-items:center;justify-content:center;height:100vh;font-family:system-ui,sans-serif;color:#fff;flex-direction:column;gap:16px}.s{width:36px;height:36px;border:2px solid rgba(255,255,255,0.1);border-top-color:#38bdf8;border-radius:50%;animation:spin 0.7s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}</style></head><body><div class="s"></div><div style="font-size:13px;font-weight:600">Analysing website...</div><div style="font-size:11px;color:rgba(255,255,255,0.4)">${websiteData.url}</div></body></html>`
        setPreviewHTML(loadingHTML)
        setPreviewData({ mode: 'url', url: websiteData.url })
        let screenshotUrl: string | undefined, corpusId: string | undefined, scrapedTitle: string | undefined
        try {
          const result = await triggerN8n({ mode: 'url', url: websiteData.url })
          screenshotUrl = result.screenshotUrl; corpusId = result.corpusId; scrapedTitle = result.scrapedTitle
        } catch { console.warn('[n8n] Not running') }
        const brand = scrapedTitle || extractBrandFromUrl(websiteData.url)
        const html = generateFallbackWebsiteHTML(websiteData.url)
        const data: PreviewData = { mode: 'url', url: websiteData.url, screenshotUrl, corpusId, scrapedTitle, businessName: brand }
        setPreviewHTML(html); setPreviewData(data)
        if (!screenshotUrl) setError('Website screenshot unavailable — Voice AI is ready to demo.')
      } else {
        const html = generatePreviewHTML(manualData)
        const services = manualData.services.split('\n').map(s => s.trim()).filter(Boolean)
        const data: PreviewData = { mode: 'manual', businessName: manualData.businessName, location: manualData.location, pricing: manualData.pricing, services }
        setPreviewHTML(html); setPreviewData(data)
        try {
          const result = await triggerN8n({ ...data })
          if (result.corpusId || result.screenshotUrl) setPreviewData({ ...data, corpusId: result.corpusId, screenshotUrl: result.screenshotUrl, scrapedTitle: result.scrapedTitle })
        } catch { console.warn('[n8n] Background trigger failed') }
      }
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  const handleDial = async () => {
    if (!phoneNumber.trim()) { setDialError('Please enter a phone number'); return }
    setDialState('dialling'); setDialError(null)
    try {
      const result = await triggerTwilioCall(phoneNumber.trim(), previewData)
      if (result.success) { setDialState('success'); setTimeout(() => setDialState('idle'), 4000) }
      else { setDialState('error'); setDialError(result.message ?? 'Call failed'); setTimeout(() => setDialState('idle'), 4000) }
    } catch (err) {
      setDialState('error'); setDialError(err instanceof Error ? err.message : 'Unknown error'); setTimeout(() => setDialState('idle'), 4000)
    }
  }

  const CallIcon = () => {
    if (isCallLoading) return <Loader2 size={18} className="animate-spin" />
    if (callState === 'listening') return <Mic size={18} />
    if (callState === 'thinking') return <Brain size={18} />
    if (isCallActive) return <PhoneOff size={18} />
    return <Phone size={18} />
  }

  return (
    <div className="flex h-full overflow-hidden bg-[#0B0B0C]">

      {/* ── LEFT PANEL (collapsible) ── */}
      <motion.div
        animate={{ width: panelOpen ? 320 : 0 }}
        transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
        className="shrink-0 h-full flex flex-col border-r border-white/[0.07] bg-[#111113] overflow-hidden"
        style={{ minWidth: 0 }}
      >
        <div className="w-[320px]"> {/* fixed inner width so content doesn't reflow */}
          {/* Header */}
          <div className="px-5 py-4 border-b border-white/[0.07] flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/15 text-accent shrink-0">
              <Phone size={15} />
            </div>
            <div className="min-w-0">
              <h1 className="text-sm font-semibold text-textPrimary whitespace-nowrap">VS Demo Caller</h1>
              <p className="text-[11px] text-textMuted whitespace-nowrap">Configure your AI demo agent</p>
            </div>
          </div>

          {/* Form body */}
          <div className="overflow-y-auto px-5 py-5 space-y-5" style={{ height: 'calc(100vh - 65px)' }}>
            {/* Tab bar */}
            <div>
              <p className={labelCls}>Input Mode</p>
              <div className="flex rounded-lg bg-white/[0.04] border border-white/[0.07] p-1 gap-1">
                {(['has-website', 'manual-info'] as TabType[]).map((tab) => (
                  <button key={tab} onClick={() => setActiveTab(tab)}
                    className={['flex-1 rounded-md py-1.5 text-xs font-medium transition-all whitespace-nowrap', activeTab === tab ? 'bg-accent text-white' : 'text-textMuted hover:text-textPrimary'].join(' ')}>
                    {tab === 'has-website' ? 'Has Website' : 'Manual Info'}
                  </button>
                ))}
              </div>
            </div>

            <motion.div key={activeTab} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.2 }} className="space-y-4">
              {activeTab === 'has-website' ? (
                <div className="space-y-1.5">
                  <label className={labelCls}><Globe size={11} className="text-accent" />Website URL</label>
                  <input type="url" placeholder="https://clientwebsite.com" value={websiteData.url} onChange={e => setWebsiteData({ url: e.target.value })} className={inputCls} />
                  <p className="text-[11px] text-textMuted leading-relaxed">We will analyse the site and train the AI agent on its content.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className={labelCls}><Type size={11} className="text-accent" />Business Name</label>
                    <input type="text" placeholder="e.g. Lekker Plumbing" value={manualData.businessName} onChange={e => setManualData({ ...manualData, businessName: e.target.value })} className={inputCls} />
                  </div>
                  <div className="space-y-1.5">
                    <label className={labelCls}><MapPin size={11} className="text-accent" />Location</label>
                    <input type="text" placeholder="e.g. Pretoria East" value={manualData.location} onChange={e => setManualData({ ...manualData, location: e.target.value })} className={inputCls} />
                  </div>
                  <div className="space-y-1.5">
                    <label className={labelCls}><Tag size={11} className="text-accent" />Pricing / Offer</label>
                    <input type="text" placeholder="e.g. Call-out fee R350" value={manualData.pricing} onChange={e => setManualData({ ...manualData, pricing: e.target.value })} className={inputCls} />
                  </div>
                  <div className="space-y-1.5">
                    <label className={labelCls}><List size={11} className="text-accent" />Services (one per line)</label>
                    <textarea rows={4} placeholder={'Leak detection\nGeyser installation\nDrain cleaning'} value={manualData.services} onChange={e => setManualData({ ...manualData, services: e.target.value })} className={`${inputCls} resize-none`} />
                  </div>
                </div>
              )}
            </motion.div>

            <AnimatePresence>
              {error && (
                <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex items-start gap-2.5 p-3 rounded-xl bg-orange-500/10 border border-orange-500/20">
                  <AlertCircle size={14} className="text-orange-400 shrink-0 mt-0.5" />
                  <p className="text-[11px] text-orange-300 leading-relaxed">{error}</p>
                </motion.div>
              )}
            </AnimatePresence>

            <button onClick={handleDeploy} disabled={loading}
              className={['w-full flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition-all',
                success ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-accent text-white hover:bg-accent/90',
                loading ? 'opacity-70 cursor-not-allowed' : ''].join(' ')}>
              {loading ? <Loader2 size={15} className="animate-spin" /> : success ? <CheckCircle2 size={15} /> : <Rocket size={15} />}
              {loading ? 'Setting up agent...' : success ? 'Agent ready!' : 'Deploy Agent'}
            </button>
          </div>
        </div>
      </motion.div>

      {/* ── RIGHT PANEL ── */}
      <div className="flex-1 min-w-0 h-full flex flex-col overflow-hidden">

        {/* Top toolbar */}
        <div className="shrink-0 flex items-center gap-3 px-4 py-3 border-b border-white/[0.07] bg-[#111113]">
          {/* Toggle button */}
          <button
            onClick={() => setPanelOpen(o => !o)}
            title={panelOpen ? 'Collapse panel' : 'Expand panel'}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-textMuted hover:text-textPrimary hover:bg-white/[0.06] transition-all text-xs font-medium"
          >
            {panelOpen ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
            {panelOpen ? 'Hide Panel' : 'Show Panel'}
          </button>

          <div className="w-px h-5 bg-white/[0.07]" />

          {/* Call status badge */}
          {isCallActive && (
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-accent">
              <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
              {callLabels[callState].toUpperCase()}
            </div>
          )}

          <div className="flex-1" />

          {/* Call controls in toolbar */}
          <div className="flex items-center gap-3">
            <motion.button
              whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
              onClick={isCallActive ? endCall : startCall}
              disabled={isCallLoading}
              className={['flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all',
                isCallActive ? 'bg-red-500 text-white hover:bg-red-600' : 'bg-accent text-white hover:bg-accent/90',
                isCallLoading ? 'opacity-70 cursor-not-allowed' : ''].join(' ')}>
              <CallIcon />
              {callLabels[callState]}
            </motion.button>

            <div className="flex gap-2 items-center">
              <input type="tel" placeholder="+27 82 123 4567" value={phoneNumber}
                onChange={e => { setPhoneNumber(e.target.value); setDialError(null) }}
                onKeyDown={e => { if (e.key === 'Enter') handleDial() }}
                className="bg-white/[0.03] border border-white/[0.07] rounded-xl px-3 py-2 text-sm text-textPrimary placeholder:text-textMuted outline-none focus:border-accent/50 transition-all w-44" />
              <motion.button whileTap={{ scale: 0.97 }} onClick={handleDial}
                disabled={dialState === 'dialling' || !phoneNumber.trim()}
                className={['flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold transition-all whitespace-nowrap',
                  dialState === 'success' ? 'bg-emerald-500 text-white' : 'bg-white/10 text-textPrimary hover:bg-white/15',
                  (dialState === 'dialling' || !phoneNumber.trim()) ? 'opacity-50 cursor-not-allowed' : ''].join(' ')}>
                {dialState === 'dialling' ? <Loader2 size={14} className="animate-spin" /> : dialState === 'success' ? <CheckCircle2 size={14} /> : <Zap size={14} />}
                {dialState === 'dialling' ? 'Calling...' : dialState === 'success' ? 'Called!' : 'Call'}
              </motion.button>
            </div>
          </div>
        </div>

        {/* Mockup area */}
        <div className="flex-1 min-h-0 flex gap-5 p-5 overflow-hidden items-stretch">

          {/* ── DESKTOP / BROWSER MOCKUP ── */}
          <div className="flex-1 min-w-0 flex flex-col">
            {/* Label */}
            <p className="text-[10px] font-semibold uppercase tracking-widest text-textMuted mb-2 flex items-center gap-2">
              <span className="w-2 h-2 rounded-sm bg-white/20 inline-block" />
              Desktop Preview
            </p>
            {/* Monitor bezel */}
            <div className="flex-1 min-h-0 flex flex-col rounded-xl border border-white/10 overflow-hidden bg-[#0d0d10] shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_20px_60px_-10px_rgba(0,0,0,0.8)]">
              {/* macOS title bar */}
              <div className="shrink-0 flex items-center gap-2 px-4 py-2.5 bg-[#1a1a1f] border-b border-white/[0.07]">
                <div className="flex gap-1.5 shrink-0">
                  <div className="w-3 h-3 rounded-full bg-[#ff5f57]" />
                  <div className="w-3 h-3 rounded-full bg-[#ffbd2e]" />
                  <div className="w-3 h-3 rounded-full bg-[#28c840]" />
                </div>
                {/* URL bar */}
                <div className="flex-1 mx-3 flex items-center gap-2 bg-[#111113] border border-white/[0.07] rounded-md px-3 py-1.5">
                  <div className="w-3 h-3 text-textMuted shrink-0">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                  </div>
                  <span className="text-[11px] text-textMuted truncate flex-1">
                    {previewData.url || businessName.toLowerCase().replace(/\s+/g, '') + '.co.za'}
                  </span>
                </div>
                {/* Tab indicator strip */}
                <div className="shrink-0 flex items-center gap-1.5 text-[10px] text-textMuted">
                  <div className="w-16 h-5 bg-[#111113] rounded-md border border-white/[0.06] flex items-center justify-center text-[9px] text-textMuted/60 truncate px-1">
                    {businessName || 'New Tab'}
                  </div>
                </div>
              </div>
              {/* Page content */}
              <iframe
                srcDoc={previewHTML}
                className="flex-1 w-full border-0"
                sandbox="allow-scripts allow-same-origin"
                title="Desktop preview"
              />
            </div>
            {/* Monitor stand */}
            <div className="shrink-0 flex flex-col items-center mt-1">
              <div className="w-16 h-3 bg-[#1a1a1f] rounded-b-lg border border-t-0 border-white/[0.06]" />
              <div className="w-28 h-1.5 bg-[#111113] rounded-full border border-white/[0.05] mt-0.5" />
            </div>
          </div>

          {/* ── PHONE MOCKUP ── */}
          <div className="shrink-0 flex flex-col items-center self-start">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-textMuted mb-2 flex items-center gap-2">
              <span className="w-2 h-3 rounded-sm bg-white/20 inline-block" />
              Mobile Preview
            </p>
            {/* Phone shell */}
            <div
              className="relative rounded-[36px] border-[3px] border-white/20 bg-[#0d0d10] overflow-hidden shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_30px_70px_-15px_rgba(0,0,0,0.9)]"
              style={{ width: PHONE_DISPLAY_W, height: PHONE_DISPLAY_H }}
            >
              {/* Dynamic island */}
              <div className="absolute top-2.5 left-1/2 -translate-x-1/2 w-24 h-6 bg-black rounded-full z-10" />
              {/* Side buttons (decorative) */}
              <div className="absolute -right-[3px] top-20 w-[3px] h-8 bg-white/10 rounded-l" />
              <div className="absolute -left-[3px] top-16 w-[3px] h-6 bg-white/10 rounded-r" />
              <div className="absolute -left-[3px] top-24 w-[3px] h-10 bg-white/10 rounded-r" />
              {/* iframe scaled to phone viewport */}
              <div className="absolute inset-0 overflow-hidden rounded-[33px]">
                <iframe
                  srcDoc={previewHTML}
                  className="absolute top-0 left-0 border-0"
                  sandbox="allow-scripts allow-same-origin"
                  title="Mobile preview"
                  style={{
                    width: PHONE_W + 'px',
                    height: PHONE_H + 'px',
                    transform: `scale(${PHONE_SCALE})`,
                    transformOrigin: 'top left',
                  }}
                />
              </div>
              {/* Home indicator */}
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-24 h-1 bg-white/30 rounded-full z-10" />
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
