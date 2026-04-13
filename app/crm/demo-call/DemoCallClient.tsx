'use client'

import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Phone, PhoneOff, Loader2, Mic, Brain, Globe, Type, MapPin, Tag, List, Zap, CheckCircle2, AlertCircle, Rocket, PanelLeftClose, PanelLeftOpen, Monitor, Smartphone } from 'lucide-react'
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

// iPhone 14 Pro logical resolution
const PHONE_W = 393
const PHONE_H = 852

// Scaled browser iframe ref helper
function ScaledIframe({ srcDoc, title }: { srcDoc: string; title: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    const container = containerRef.current
    const iframe = iframeRef.current
    if (!container || !iframe) return
    const update = () => {
      const scale = container.clientWidth / 1280
      iframe.style.transform = `scale(${scale})`
      iframe.style.height = (container.clientHeight / scale) + 'px'
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(container)
    return () => ro.disconnect()
  }, [])

  return (
    <div ref={containerRef} className="flex-1 relative overflow-hidden">
      <iframe
        ref={iframeRef}
        srcDoc={srcDoc}
        className="absolute top-0 left-0 border-0 origin-top-left"
        sandbox="allow-scripts allow-same-origin"
        title={title}
        style={{ width: '1280px' }}
      />
    </div>
  )
}

export function DemoCallClient() {
  const [isMobile, setIsMobile] = useState(false)
  const [mobileView, setMobileView] = useState<'setup' | 'preview'>('setup')
  const [panelOpen, setPanelOpen] = useState(true)
  const [inputTab, setInputTab] = useState<TabType>('manual-info')
  const [websiteData, setWebsiteData] = useState<WebsiteFormData>({ url: '' })
  const [manualData, setManualData] = useState<ManualFormData>({ businessName: '', location: '', pricing: '', services: '' })
  const [previewHTML, setPreviewHTML] = useState<string>(getDefaultPreviewHTML())
  const [previewData, setPreviewData] = useState<PreviewData>({
    mode: 'manual', businessName: 'plumbing', location: 'pretoria east',
    pricing: 'call out fee R300', services: ['leak detection', 'toilets', 'geyser installation'],
  })
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [phoneNumber, setPhoneNumber] = useState('')
  const [dialState, setDialState] = useState<'idle' | 'dialling' | 'success' | 'error'>('idle')
  const [dialError, setDialError] = useState<string | null>(null)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

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
    setLoading(true); setError(null); setSuccess(false)
    try {
      if (inputTab === 'has-website') {
        if (!websiteData.url) { setError('Please enter a website URL'); setLoading(false); return }
        const loadingHTML = `<!DOCTYPE html><html><head><style>body{margin:0;background:#0B0B0C;display:flex;align-items:center;justify-content:center;height:100vh;font-family:system-ui,sans-serif;color:#fff;flex-direction:column;gap:16px}.s{width:36px;height:36px;border:2px solid rgba(255,255,255,0.1);border-top-color:#38bdf8;border-radius:50%;animation:spin 0.7s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}</style></head><body><div class="s"></div><div style="font-size:13px;font-weight:600">Analysing website...</div></body></html>`
        setPreviewHTML(loadingHTML); setPreviewData({ mode: 'url', url: websiteData.url })
        let screenshotUrl: string | undefined, corpusId: string | undefined, scrapedTitle: string | undefined
        try { const r = await triggerN8n({ mode: 'url', url: websiteData.url }); screenshotUrl = r.screenshotUrl; corpusId = r.corpusId; scrapedTitle = r.scrapedTitle } catch {}
        const brand = scrapedTitle || extractBrandFromUrl(websiteData.url)
        const data: PreviewData = { mode: 'url', url: websiteData.url, screenshotUrl, corpusId, scrapedTitle, businessName: brand }
        setPreviewHTML(generateFallbackWebsiteHTML(websiteData.url)); setPreviewData(data)
        if (!screenshotUrl) setError('Screenshot unavailable — Voice AI is ready.')
      } else {
        const services = manualData.services.split('\n').map(s => s.trim()).filter(Boolean)
        const data: PreviewData = { mode: 'manual', businessName: manualData.businessName, location: manualData.location, pricing: manualData.pricing, services }
        setPreviewHTML(generatePreviewHTML(manualData)); setPreviewData(data)
        try { const r = await triggerN8n({ ...data }); if (r.corpusId || r.screenshotUrl) setPreviewData({ ...data, corpusId: r.corpusId, screenshotUrl: r.screenshotUrl }) } catch {}
      }
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
      if (isMobile) setMobileView('preview')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally { setLoading(false) }
  }

  const handleDial = async () => {
    if (!phoneNumber.trim()) { setDialError('Please enter a phone number'); return }
    setDialState('dialling'); setDialError(null)
    try {
      const result = await triggerTwilioCall(phoneNumber.trim(), previewData)
      if (result.success) { setDialState('success'); setTimeout(() => setDialState('idle'), 4000) }
      else { setDialState('error'); setDialError(result.message ?? 'Call failed'); setTimeout(() => setDialState('idle'), 4000) }
    } catch (err) { setDialState('error'); setDialError(err instanceof Error ? err.message : 'Error'); setTimeout(() => setDialState('idle'), 4000) }
  }

  const CallIcon = () => {
    if (isCallLoading) return <Loader2 size={18} className="animate-spin" />
    if (callState === 'listening') return <Mic size={18} />
    if (callState === 'thinking') return <Brain size={18} />
    if (isCallActive) return <PhoneOff size={18} />
    return <Phone size={18} />
  }

  // ── FORM panel (shared between mobile + desktop) ─────────────────────────
  const FormPanel = () => (
    <div className="space-y-5">
      <div>
        <p className={labelCls}>Input Mode</p>
        <div className="flex rounded-lg bg-white/[0.04] border border-white/[0.07] p-1 gap-1">
          {(['has-website', 'manual-info'] as TabType[]).map(tab => (
            <button key={tab} onClick={() => setInputTab(tab)}
              className={['flex-1 rounded-md py-2 text-xs font-medium transition-all', inputTab === tab ? 'bg-accent text-white' : 'text-textMuted hover:text-textPrimary'].join(' ')}>
              {tab === 'has-website' ? 'Has Website' : 'Manual Info'}
            </button>
          ))}
        </div>
      </div>

      <motion.div key={inputTab} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.2 }} className="space-y-4">
        {inputTab === 'has-website' ? (
          <div className="space-y-1.5">
            <label className={labelCls}><Globe size={11} className="text-accent" />Website URL</label>
            <input type="url" placeholder="https://clientwebsite.com" value={websiteData.url} onChange={e => setWebsiteData({ url: e.target.value })} className={inputCls} />
            <p className="text-[11px] text-textMuted">We will analyse the site and train the AI agent on its content.</p>
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
  )

  // ── CALL controls (shared) ───────────────────────────────────────────────
  const CallControls = ({ compact = false }: { compact?: boolean }) => (
    <div className={['flex flex-wrap items-center gap-3', compact ? '' : 'bg-[#111113] border border-white/[0.07] rounded-xl p-4'].join(' ')}>
      <div className="flex flex-col gap-1.5">
        {!compact && <p className="text-[10px] font-semibold uppercase tracking-widest text-textMuted">Browser Demo</p>}
        <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
          onClick={isCallActive ? endCall : startCall} disabled={isCallLoading}
          className={['flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all',
            isCallActive ? 'bg-red-500 text-white hover:bg-red-600' : 'bg-accent text-white hover:bg-accent/90',
            isCallLoading ? 'opacity-70 cursor-not-allowed' : ''].join(' ')}>
          <CallIcon />{callLabels[callState]}
        </motion.button>
      </div>
      <div className="w-px h-8 bg-white/[0.07] hidden sm:block" />
      <div className="flex-1 min-w-[180px] space-y-1.5">
        {!compact && <p className="text-[10px] font-semibold uppercase tracking-widest text-textMuted">Call a Phone</p>}
        <div className="flex gap-2">
          <input type="tel" placeholder="+27 82 123 4567" value={phoneNumber}
            onChange={e => { setPhoneNumber(e.target.value); setDialError(null) }}
            onKeyDown={e => { if (e.key === 'Enter') handleDial() }}
            className={`${inputCls} flex-1`} />
          <motion.button whileTap={{ scale: 0.97 }} onClick={handleDial}
            disabled={dialState === 'dialling' || !phoneNumber.trim()}
            className={['flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-semibold whitespace-nowrap transition-all',
              dialState === 'success' ? 'bg-emerald-500 text-white' : 'bg-white/10 text-textPrimary hover:bg-white/15',
              (dialState === 'dialling' || !phoneNumber.trim()) ? 'opacity-50 cursor-not-allowed' : ''].join(' ')}>
            {dialState === 'dialling' ? <Loader2 size={14} className="animate-spin" /> : dialState === 'success' ? <CheckCircle2 size={14} /> : <Zap size={14} />}
            {dialState === 'dialling' ? 'Calling...' : dialState === 'success' ? 'Called!' : 'Call'}
          </motion.button>
        </div>
        {dialError && <p className="text-[11px] text-orange-400">{dialError}</p>}
      </div>
    </div>
  )

  // ═══════════════════════════════════════════════════════════════════════════
  // MOBILE LAYOUT
  // ═══════════════════════════════════════════════════════════════════════════
  if (isMobile) {
    return (
      <div className="flex flex-col h-full bg-[#0B0B0C] overflow-hidden">
        {/* Mobile tab switcher */}
        <div className="shrink-0 flex gap-1 px-4 pt-4 pb-3 border-b border-white/[0.07]">
          {(['setup', 'preview'] as const).map(view => (
            <button key={view} onClick={() => setMobileView(view)}
              className={['flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-semibold transition-all capitalize',
                mobileView === view ? 'bg-accent text-white' : 'bg-white/[0.04] text-textMuted hover:text-textPrimary border border-white/[0.07]'].join(' ')}>
              {view === 'setup' ? <><Rocket size={13} />Setup</> : <><Monitor size={13} />Preview</>}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {mobileView === 'setup' ? (
            <div className="px-4 py-5">
              <FormPanel />
            </div>
          ) : (
            <div className="flex flex-col h-full">
              {/* Call controls — sticky top on preview */}
              <div className="px-4 py-3 border-b border-white/[0.07] bg-[#111113]">
                {isCallActive && (
                  <div className="flex items-center gap-2 text-xs font-semibold text-accent mb-2">
                    <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
                    {callLabels[callState].toUpperCase()}
                  </div>
                )}
                <div className="flex gap-2">
                  <motion.button whileTap={{ scale: 0.97 }} onClick={isCallActive ? endCall : startCall} disabled={isCallLoading}
                    className={['flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all',
                      isCallActive ? 'bg-red-500 text-white' : 'bg-accent text-white hover:bg-accent/90',
                      isCallLoading ? 'opacity-70' : ''].join(' ')}>
                    <CallIcon />{callLabels[callState]}
                  </motion.button>
                  <button onClick={() => setMobileView('setup')}
                    className="px-4 py-3 rounded-xl text-sm font-semibold bg-white/[0.06] text-textMuted border border-white/[0.07]">
                    Edit
                  </button>
                </div>
              </div>

              {/* Mobile preview — browser mockup full width */}
              <div className="flex-1 flex flex-col p-3 gap-3 overflow-hidden min-h-0">
                <div className="flex-1 flex flex-col rounded-xl border border-white/[0.07] overflow-hidden bg-[#111113] min-h-0">
                  <div className="flex items-center gap-2 px-3 py-2 bg-[#0d0d0f] border-b border-white/[0.07] shrink-0">
                    <div className="flex gap-1"><div className="w-2 h-2 rounded-full bg-[#ff5f57]"/><div className="w-2 h-2 rounded-full bg-[#ffbd2e]"/><div className="w-2 h-2 rounded-full bg-[#28c840]"/></div>
                    <div className="flex-1 bg-white/[0.05] rounded px-2 py-1 text-[10px] text-textMuted truncate">{previewData.url || businessName.toLowerCase().replace(/\s+/g,'') + '.co.za'}</div>
                  </div>
                  <ScaledIframe srcDoc={previewHTML} title="Preview" />
                </div>

                {/* Outbound call */}
                <div className="shrink-0 bg-[#111113] border border-white/[0.07] rounded-xl p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-textMuted mb-2">Call a Phone Number</p>
                  <div className="flex gap-2">
                    <input type="tel" placeholder="+27 82 123 4567" value={phoneNumber} onChange={e => { setPhoneNumber(e.target.value); setDialError(null) }} onKeyDown={e => { if (e.key === 'Enter') handleDial() }} className={`${inputCls} flex-1`} />
                    <motion.button whileTap={{ scale: 0.97 }} onClick={handleDial} disabled={dialState === 'dialling' || !phoneNumber.trim()}
                      className={['flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-semibold whitespace-nowrap transition-all',
                        dialState === 'success' ? 'bg-emerald-500 text-white' : 'bg-white/10 text-textPrimary hover:bg-white/15',
                        (dialState === 'dialling' || !phoneNumber.trim()) ? 'opacity-50 cursor-not-allowed' : ''].join(' ')}>
                      {dialState === 'dialling' ? <Loader2 size={14} className="animate-spin" /> : dialState === 'success' ? <CheckCircle2 size={14} /> : <Zap size={14} />}
                      {dialState === 'dialling' ? 'Calling...' : dialState === 'success' ? 'Called!' : 'Call'}
                    </motion.button>
                  </div>
                  {dialError && <p className="text-[11px] text-orange-400 mt-1.5">{dialError}</p>}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DESKTOP LAYOUT
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <div className="flex h-full overflow-hidden bg-[#0B0B0C]">

      {/* LEFT PANEL (collapsible) */}
      <motion.div
        animate={{ width: panelOpen ? 320 : 0 }}
        transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
        className="shrink-0 h-full flex flex-col border-r border-white/[0.07] bg-[#111113] overflow-hidden"
        style={{ minWidth: 0 }}
      >
        <div className="w-[320px]">
          <div className="px-5 py-4 border-b border-white/[0.07] flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/15 text-accent shrink-0"><Phone size={15} /></div>
            <div className="min-w-0">
              <h1 className="text-sm font-semibold text-textPrimary whitespace-nowrap">VS Demo Caller</h1>
              <p className="text-[11px] text-textMuted whitespace-nowrap">Configure your AI demo agent</p>
            </div>
          </div>
          <div className="overflow-y-auto px-5 py-5" style={{ height: 'calc(100vh - 65px)' }}>
            <FormPanel />
          </div>
        </div>
      </motion.div>

      {/* RIGHT PANEL */}
      <div className="flex-1 min-w-0 h-full flex flex-col overflow-hidden">

        {/* Toolbar */}
        <div className="shrink-0 flex items-center gap-3 px-4 py-3 border-b border-white/[0.07] bg-[#111113]">
          <button onClick={() => setPanelOpen(o => !o)} title={panelOpen ? 'Collapse panel' : 'Expand panel'}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-textMuted hover:text-textPrimary hover:bg-white/[0.06] transition-all text-xs font-medium">
            {panelOpen ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
            {panelOpen ? 'Hide Panel' : 'Show Panel'}
          </button>
          <div className="w-px h-5 bg-white/[0.07]" />
          {isCallActive && (
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-accent">
              <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
              {callLabels[callState].toUpperCase()}
            </div>
          )}
          <div className="flex-1" />
          <div className="flex items-center gap-3">
            <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
              onClick={isCallActive ? endCall : startCall} disabled={isCallLoading}
              className={['flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all',
                isCallActive ? 'bg-red-500 text-white hover:bg-red-600' : 'bg-accent text-white hover:bg-accent/90',
                isCallLoading ? 'opacity-70 cursor-not-allowed' : ''].join(' ')}>
              <CallIcon />{callLabels[callState]}
            </motion.button>
            <div className="flex gap-2 items-center">
              <input type="tel" placeholder="+27 82 123 4567" value={phoneNumber}
                onChange={e => { setPhoneNumber(e.target.value); setDialError(null) }}
                onKeyDown={e => { if (e.key === 'Enter') handleDial() }}
                className="bg-white/[0.03] border border-white/[0.07] rounded-xl px-3 py-2 text-sm text-textPrimary placeholder:text-textMuted outline-none focus:border-accent/50 transition-all w-40" />
              <motion.button whileTap={{ scale: 0.97 }} onClick={handleDial}
                disabled={dialState === 'dialling' || !phoneNumber.trim()}
                className={['flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-all',
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

          {/* DESKTOP MOCKUP */}
          <div className="flex-1 min-w-0 flex flex-col">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-textMuted mb-2 flex items-center gap-2">
              <Monitor size={11} />Desktop Preview
            </p>
            <div className="flex-1 min-h-0 flex flex-col rounded-xl border border-white/10 overflow-hidden bg-[#0d0d10] shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_20px_60px_-10px_rgba(0,0,0,0.8)]">
              <div className="shrink-0 flex items-center gap-2 px-4 py-2.5 bg-[#1a1a1f] border-b border-white/[0.07]">
                <div className="flex gap-1.5 shrink-0">
                  <div className="w-3 h-3 rounded-full bg-[#ff5f57]"/>
                  <div className="w-3 h-3 rounded-full bg-[#ffbd2e]"/>
                  <div className="w-3 h-3 rounded-full bg-[#28c840]"/>
                </div>
                <div className="flex-1 mx-3 flex items-center gap-2 bg-[#111113] border border-white/[0.07] rounded-md px-3 py-1.5">
                  <svg className="w-3 h-3 text-textMuted shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                  <span className="text-[11px] text-textMuted truncate flex-1">{previewData.url || businessName.toLowerCase().replace(/\s+/g,'') + '.co.za'}</span>
                </div>
                <div className="w-16 h-5 bg-[#111113] rounded-md border border-white/[0.06] flex items-center justify-center text-[9px] text-textMuted/60 truncate px-1 shrink-0">
                  {businessName || 'New Tab'}
                </div>
              </div>
              <ScaledIframe srcDoc={previewHTML} title="Desktop preview" />
            </div>
            <div className="shrink-0 flex flex-col items-center mt-1">
              <div className="w-16 h-3 bg-[#1a1a1f] rounded-b-lg border border-t-0 border-white/[0.06]"/>
              <div className="w-28 h-1.5 bg-[#111113] rounded-full border border-white/[0.05] mt-0.5"/>
            </div>
          </div>

          {/* PHONE MOCKUP */}
          <div className="shrink-0 flex flex-col items-center self-start">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-textMuted mb-2 flex items-center gap-2">
              <Smartphone size={11} />Mobile Preview
            </p>
            {(() => {
              const displayH = 480
              const displayW = Math.round((PHONE_W / PHONE_H) * displayH)
              const scale = displayH / PHONE_H
              return (
                <div className="relative rounded-[36px] border-[3px] border-white/20 bg-[#0d0d10] overflow-hidden shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_30px_70px_-15px_rgba(0,0,0,0.9)]"
                  style={{ width: displayW, height: displayH }}>
                  <div className="absolute top-2.5 left-1/2 -translate-x-1/2 w-24 h-6 bg-black rounded-full z-10"/>
                  <div className="absolute -right-[3px] top-20 w-[3px] h-8 bg-white/10 rounded-l"/>
                  <div className="absolute -left-[3px] top-16 w-[3px] h-6 bg-white/10 rounded-r"/>
                  <div className="absolute -left-[3px] top-24 w-[3px] h-10 bg-white/10 rounded-r"/>
                  <div className="absolute inset-0 overflow-hidden rounded-[33px]">
                    <iframe srcDoc={previewHTML} className="absolute top-0 left-0 border-0"
                      sandbox="allow-scripts allow-same-origin" title="Mobile preview"
                      style={{ width: PHONE_W + 'px', height: PHONE_H + 'px', transform: `scale(${scale})`, transformOrigin: 'top left' }} />
                  </div>
                  <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-24 h-1 bg-white/30 rounded-full z-10"/>
                </div>
              )
            })()}
          </div>

        </div>
      </div>
    </div>
  )
}
