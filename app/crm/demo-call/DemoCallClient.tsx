'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Phone, PhoneOff, Loader2, Mic, Brain, Globe, Type, MapPin, Tag, List, Zap, CheckCircle2, AlertCircle, Rocket } from 'lucide-react'
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

export function DemoCallClient() {
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

        let screenshotUrl: string | undefined
        let corpusId: string | undefined
        let scrapedTitle: string | undefined

        try {
          const result = await triggerN8n({ mode: 'url', url: websiteData.url })
          screenshotUrl = result.screenshotUrl
          corpusId = result.corpusId
          scrapedTitle = result.scrapedTitle
        } catch { console.warn('[n8n] Not running') }

        const brand = scrapedTitle || extractBrandFromUrl(websiteData.url)
        const html = generateFallbackWebsiteHTML(websiteData.url)
        const data: PreviewData = { mode: 'url', url: websiteData.url, screenshotUrl, corpusId, scrapedTitle, businessName: brand }
        setPreviewHTML(html)
        setPreviewData(data)
        if (!screenshotUrl) setError('Website screenshot unavailable — Voice AI is ready to demo.')

      } else {
        const html = generatePreviewHTML(manualData)
        const services = manualData.services.split('\n').map(s => s.trim()).filter(Boolean)
        const data: PreviewData = { mode: 'manual', businessName: manualData.businessName, location: manualData.location, pricing: manualData.pricing, services }
        setPreviewHTML(html)
        setPreviewData(data)

        try {
          const result = await triggerN8n({ ...data })
          if (result.corpusId || result.screenshotUrl) {
            setPreviewData({ ...data, corpusId: result.corpusId, screenshotUrl: result.screenshotUrl, scrapedTitle: result.scrapedTitle })
          }
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
    setDialState('dialling')
    setDialError(null)
    try {
      const result = await triggerTwilioCall(phoneNumber.trim(), previewData)
      if (result.success) { setDialState('success'); setTimeout(() => setDialState('idle'), 4000) }
      else { setDialState('error'); setDialError(result.message ?? 'Call failed'); setTimeout(() => setDialState('idle'), 4000) }
    } catch (err) {
      setDialState('error')
      setDialError(err instanceof Error ? err.message : 'Unknown error')
      setTimeout(() => setDialState('idle'), 4000)
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

      {/* LEFT PANEL */}
      <div className="w-[320px] shrink-0 h-full flex flex-col border-r border-white/[0.07] bg-[#111113]">
        <div className="px-5 py-4 border-b border-white/[0.07]">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/15 text-accent">
              <Phone size={15} />
            </div>
            <div>
              <h1 className="text-sm font-semibold text-textPrimary">VS Demo Caller</h1>
              <p className="text-[11px] text-textMuted">Configure your AI demo agent</p>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
          {/* Tab bar */}
          <div>
            <p className={labelCls}>Input Mode</p>
            <div className="flex rounded-lg bg-white/[0.04] border border-white/[0.07] p-1 gap-1">
              {(['has-website', 'manual-info'] as TabType[]).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={[
                    'flex-1 rounded-md py-1.5 text-xs font-medium transition-all',
                    activeTab === tab ? 'bg-accent text-white' : 'text-textMuted hover:text-textPrimary',
                  ].join(' ')}
                >
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

          <button
            onClick={handleDeploy}
            disabled={loading}
            className={[
              'w-full flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition-all',
              success ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-accent text-white hover:bg-accent/90',
              loading ? 'opacity-70 cursor-not-allowed' : '',
            ].join(' ')}
          >
            {loading ? <Loader2 size={15} className="animate-spin" /> : success ? <CheckCircle2 size={15} /> : <Rocket size={15} />}
            {loading ? 'Setting up agent...' : success ? 'Agent ready!' : 'Deploy Agent'}
          </button>
        </div>
      </div>

      {/* RIGHT PANEL */}
      <div className="flex-1 min-w-0 h-full flex flex-col p-5 gap-4 overflow-hidden">

        {/* Mockup frames */}
        <div className="flex-1 min-h-0 flex gap-4">
          {/* Browser mockup */}
          <div className="flex-1 min-w-0 flex flex-col rounded-xl border border-white/[0.07] overflow-hidden bg-[#111113]">
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/[0.07] bg-[#0d0d0f] shrink-0">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-red-500/70" />
                <div className="w-3 h-3 rounded-full bg-yellow-500/70" />
                <div className="w-3 h-3 rounded-full bg-green-500/70" />
              </div>
              <div className="flex-1 bg-white/[0.05] rounded-md px-3 py-1 text-[11px] text-textMuted truncate">
                {previewData.url || businessName.toLowerCase().replace(/\s+/g, '') + '.co.za'}
              </div>
              {isCallActive && (
                <div className="flex items-center gap-1.5 text-[10px] font-semibold text-accent shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                  {callState.toUpperCase()}
                </div>
              )}
            </div>
            <iframe srcDoc={previewHTML} className="flex-1 w-full border-0" sandbox="allow-scripts allow-same-origin" title="Business preview" />
          </div>

          {/* Phone mockup */}
          <div className="w-[140px] shrink-0 flex flex-col rounded-[28px] border-2 border-white/10 overflow-hidden bg-[#111113]">
            <div className="h-5 bg-[#0d0d0f] flex items-center justify-center shrink-0">
              <div className="w-12 h-1.5 rounded-full bg-white/10" />
            </div>
            <div className="flex-1 overflow-hidden relative">
              <iframe
                srcDoc={previewHTML}
                className="absolute top-0 left-0 border-0"
                sandbox="allow-scripts allow-same-origin"
                title="Mobile preview"
                style={{ width: '280px', height: '560px', transform: 'scale(0.5)', transformOrigin: 'top left' }}
              />
            </div>
          </div>
        </div>

        {/* Call controls */}
        <div className="shrink-0 bg-[#111113] border border-white/[0.07] rounded-xl p-4 flex flex-wrap items-center gap-4">
          <div className="flex flex-col items-start gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-textMuted">Browser Demo</p>
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={isCallActive ? endCall : startCall}
              disabled={isCallLoading}
              className={[
                'flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all',
                isCallActive ? 'bg-red-500 text-white hover:bg-red-600' : 'bg-accent text-white hover:bg-accent/90',
                isCallLoading ? 'opacity-70 cursor-not-allowed' : '',
              ].join(' ')}
            >
              <CallIcon />
              {callLabels[callState]}
            </motion.button>
          </div>

          <div className="w-px h-10 bg-white/[0.07] hidden sm:block" />

          <div className="flex-1 min-w-[220px]">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-textMuted mb-2">Call a Phone Number</p>
            <div className="flex gap-2">
              <input
                type="tel"
                placeholder="+27 82 123 4567"
                value={phoneNumber}
                onChange={e => { setPhoneNumber(e.target.value); setDialError(null) }}
                onKeyDown={e => { if (e.key === 'Enter') handleDial() }}
                className={`${inputCls} flex-1`}
              />
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={handleDial}
                disabled={dialState === 'dialling' || !phoneNumber.trim()}
                className={[
                  'flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all whitespace-nowrap',
                  dialState === 'success' ? 'bg-emerald-500 text-white' : 'bg-white/10 text-textPrimary hover:bg-white/15',
                  (dialState === 'dialling' || !phoneNumber.trim()) ? 'opacity-50 cursor-not-allowed' : '',
                ].join(' ')}
              >
                {dialState === 'dialling' ? <Loader2 size={14} className="animate-spin" /> : dialState === 'success' ? <CheckCircle2 size={14} /> : <Zap size={14} />}
                {dialState === 'dialling' ? 'Calling...' : dialState === 'success' ? 'Called!' : 'Call Now'}
              </motion.button>
            </div>
            <AnimatePresence>
              {dialError && (
                <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="text-[11px] text-orange-400 mt-1.5">
                  {dialError}
                </motion.p>
              )}
            </AnimatePresence>
          </div>
        </div>

      </div>
    </div>
  )
}
