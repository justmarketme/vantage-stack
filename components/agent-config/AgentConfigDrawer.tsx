'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useConversation } from '@elevenlabs/react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X, Save, Loader2, CheckCircle2, AlertCircle, ChevronDown,
  Mic, FileText, Phone, Settings, BookOpen,
  Upload, Trash2, Globe, Type, Play, PhoneIncoming, PhoneOutgoing,
  Copy, Check, RefreshCw, Volume2, MessageSquare, MicOff, Send,
  RotateCcw, Sparkles, XCircle,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ElevenLabsVoice {
  voice_id: string
  name: string
  category: string
  labels?: Record<string, string>
  preview_url?: string
  public_owner_id?: string  // present on shared/public voices
}

interface KnowledgeBaseDoc { id: string; name: string; type: string }

interface AgentConfig {
  prompt: string
  firstMessage: string
  voiceId: string
  voiceName: string
  temperature: number
  language: string
  knowledgeBase: KnowledgeBaseDoc[]
}

type LeftTab = 'prompt' | 'knowledge' | 'phone' | 'settings' | 'persona'
type ChatMode = 'text' | 'voice'
interface ChatMessage { role: 'user' | 'agent'; text: string }

const inputCls = 'w-full bg-white/[0.03] border border-white/[0.07] rounded-xl px-3 py-2.5 text-sm text-textPrimary placeholder:text-textMuted outline-none focus:border-accent/50 transition-all'
const labelCls = 'flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-textMuted mb-1.5'

// ─── Left Panel: Config ───────────────────────────────────────────────────────

const LEFT_TABS: { id: LeftTab; label: string; icon: React.ReactNode }[] = [
  { id: 'prompt', label: 'Prompt', icon: <FileText size={13} /> },
  { id: 'knowledge', label: 'Knowledge', icon: <BookOpen size={13} /> },
  { id: 'phone', label: 'Phone', icon: <Phone size={13} /> },
  { id: 'settings', label: 'Settings', icon: <Settings size={13} /> },
  { id: 'persona', label: 'Persona', icon: <Sparkles size={13} /> },
]

// ─── Persona definitions ──────────────────────────────────────────────────────

interface PersonaDef {
  id: string
  name: string
  tagline: string
  traits: string[]
  stability: number
  speed: number
  similarity_boost: number
  expressive_mode: boolean
  audioTags: string[]
}

const PERSONAS: PersonaDef[] = [
  {
    id: 'isabel',
    name: 'Isabel',
    tagline: 'Builds trust, listens deeply',
    traits: ['Empathetic', 'Rapport-focused', 'Patient'],
    stability: 0.42,
    speed: 0.93,
    similarity_boost: 0.82,
    expressive_mode: true,
    audioTags: ['Empathetically', 'Warmly', 'Patiently'],
  },
  {
    id: 'alex',
    name: 'Alex',
    tagline: 'Creates momentum, drives action',
    traits: ['High-energy', 'Confident', 'Direct'],
    stability: 0.25,
    speed: 1.12,
    similarity_boost: 0.78,
    expressive_mode: true,
    audioTags: ['Confidently', 'Excitedly'],
  },
  {
    id: 'sarah',
    name: 'Sarah',
    tagline: 'Authority through expertise',
    traits: ['Measured', 'Authoritative', 'Knowledge-first'],
    stability: 0.68,
    speed: 0.88,
    similarity_boost: 0.85,
    expressive_mode: false,
    audioTags: ['Confidently', 'Patiently'],
  },
  {
    id: 'marcus',
    name: 'Marcus',
    tagline: 'Relatable, real, connects instantly',
    traits: ['Casual', 'Storytelling', 'Authentic'],
    stability: 0.35,
    speed: 1.05,
    similarity_boost: 0.80,
    expressive_mode: true,
    audioTags: ['Warmly', 'Enthusiastically'],
  },
  {
    id: 'amara',
    name: 'Amara',
    tagline: 'Understands before advising',
    traits: ['Deeply empathetic', 'Problem-solving', 'Consultative'],
    stability: 0.50,
    speed: 0.90,
    similarity_boost: 0.83,
    expressive_mode: true,
    audioTags: ['Empathetically', 'Warmly'],
  },
]

type CallStatus = 'idle' | 'calling' | 'success' | 'error'

// ─── Persona Panel ────────────────────────────────────────────────────────────

type PersonaApplyState = 'idle' | 'loading' | 'done' | 'error'

function PersonaPanel({ onChange, onSave, initialExpressiveMode }: {
  onChange: (p: Partial<AgentConfig>) => void
  onSave: () => void
  initialExpressiveMode?: boolean
}) {
  const [activePersona, setActivePersona] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('vs_active_persona') ?? null
    }
    return null
  })
  const [applyState, setApplyState] = useState<Record<string, PersonaApplyState>>({})
  const [expressiveMode, setExpressiveMode] = useState(initialExpressiveMode ?? true)
  const [togglingExpressive, setTogglingExpressive] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem('vs_active_persona')
    if (saved) setActivePersona(saved)
  }, [])

  const applyPersona = async (p: PersonaDef) => {
    setApplyState(s => ({ ...s, [p.id]: 'loading' }))
    try {
      // 1. Apply voice settings via expressive API
      const expressiveRes = await fetch('/api/elevenlabs/agent/expressive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stability: p.stability,
          speed: p.speed,
          similarity_boost: p.similarity_boost,
          expressive_mode: p.expressive_mode,
        }),
      })
      if (!expressiveRes.ok) { throw new Error(await expressiveRes.text()) }

      // 1b. Apply audio tags
      const audioTagsRes = await fetch('/api/elevenlabs/agent/audio-tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audio_tags: p.audioTags }),
      })
      if (!audioTagsRes.ok) { throw new Error(await audioTagsRes.text()) }

      setActivePersona(p.id)
      localStorage.setItem('vs_active_persona', p.id)
      setApplyState(s => ({ ...s, [p.id]: 'done' }))
      setTimeout(() => setApplyState(s => ({ ...s, [p.id]: 'idle' })), 2500)
    } catch {
      setApplyState(s => ({ ...s, [p.id]: 'error' }))
      setTimeout(() => setApplyState(s => ({ ...s, [p.id]: 'idle' })), 3000)
    }
  }

  const toggleExpressive = async () => {
    setTogglingExpressive(true)
    const next = !expressiveMode
    try {
      await fetch('/api/elevenlabs/agent/expressive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expressive_mode: next }),
      })
      setExpressiveMode(next)
    } finally {
      setTogglingExpressive(false)
    }
  }

  const getState = (id: string): PersonaApplyState => applyState[id] ?? 'idle'

  return (
    <div className="space-y-4">
      {/* Expressive Mode toggle */}
      <div className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.07]">
        <div className="flex items-center gap-2">
          <Sparkles size={12} className="text-accent" />
          <span className="text-xs font-semibold text-textPrimary">Expressive Mode</span>
        </div>
        <button
          onClick={toggleExpressive}
          disabled={togglingExpressive}
          className={[
            'relative w-10 h-5.5 rounded-full transition-all duration-200 disabled:opacity-50',
            expressiveMode ? 'bg-accent' : 'bg-white/[0.12]',
          ].join(' ')}
          style={{ height: '22px', width: '40px' }}
          aria-label="Toggle expressive mode"
        >
          <span className={[
            'absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-all duration-200',
            expressiveMode ? 'left-5' : 'left-0.5',
          ].join(' ')} />
          {togglingExpressive && (
            <span className="absolute inset-0 flex items-center justify-center">
              <Loader2 size={10} className="animate-spin text-white/70" />
            </span>
          )}
        </button>
      </div>

      {/* Persona grid */}
      <div className="grid grid-cols-2 gap-2.5">
        {PERSONAS.map(p => {
          const state = getState(p.id)
          const isActive = activePersona === p.id
          const isLoading = state === 'loading'
          const isDone = state === 'done'
          const isError = state === 'error'

          return (
            <motion.button
              key={p.id}
              whileTap={{ scale: 0.97 }}
              onClick={() => applyPersona(p)}
              disabled={isLoading}
              className={[
                'relative flex flex-col items-start gap-2 p-3 rounded-xl border text-left transition-all duration-200',
                isActive
                  ? 'bg-accent/[0.08] border-accent/40 shadow-[0_0_12px_rgba(99,102,241,0.15)]'
                  : 'bg-white/[0.03] border-white/[0.07] hover:bg-white/[0.06] hover:border-white/[0.14]',
                isLoading ? 'cursor-wait' : 'cursor-pointer',
              ].join(' ')}
            >
              {/* Active badge */}
              {isActive && (
                <span className="absolute top-2 right-2 text-[9px] font-bold uppercase tracking-widest text-accent bg-accent/10 border border-accent/20 px-1.5 py-0.5 rounded-full">
                  Active
                </span>
              )}

              {/* Name + apply state */}
              <div className="flex items-center gap-1.5 w-full pr-10">
                <span className="text-[13px] font-bold text-textPrimary leading-tight">{p.name}</span>
                {isLoading && <Loader2 size={11} className="animate-spin text-accent shrink-0" />}
                {isDone && <CheckCircle2 size={11} className="text-emerald-400 shrink-0" />}
                {isError && <XCircle size={11} className="text-red-400 shrink-0" />}
              </div>

              {/* Tagline */}
              <p className="text-[10px] text-textMuted leading-tight">{p.tagline}</p>

              {/* Trait chips */}
              <div className="flex flex-wrap gap-1">
                {p.traits.map(t => (
                  <span key={t} className={[
                    'text-[9px] font-medium px-1.5 py-0.5 rounded-full border',
                    isActive
                      ? 'bg-accent/10 border-accent/20 text-accent/80'
                      : 'bg-white/[0.05] border-white/[0.08] text-textMuted',
                  ].join(' ')}>
                    {t}
                  </span>
                ))}
                {p.expressive_mode && (
                  <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full border bg-yellow-500/10 border-yellow-500/25 text-yellow-400/80 flex items-center gap-0.5">
                    <Sparkles size={7} />Expressive
                  </span>
                )}
              </div>

              {/* Audio tag chips */}
              <div className="flex flex-wrap gap-1">
                {p.audioTags.map(t => (
                  <span key={t} className={[
                    'text-[9px] font-medium px-1.5 py-0.5 rounded-full border',
                    isActive
                      ? 'bg-violet-500/10 border-violet-500/20 text-violet-400/80'
                      : 'bg-white/[0.03] border-white/[0.06] text-textMuted/60',
                  ].join(' ')}>
                    {t}
                  </span>
                ))}
              </div>

              {/* Voice settings preview */}
              <div className="w-full grid grid-cols-2 gap-x-2 gap-y-0.5 mt-0.5">
                {([
                  ['Stability', p.stability],
                  ['Speed', p.speed - 0.5],  // normalize: 0.5–1.5 → 0–1
                ] as [string, number][]).map(([label, val]) => (
                  <div key={label}>
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-[9px] text-textMuted/70">{label}</span>
                      <span className="text-[9px] font-mono text-textMuted">{label === 'Speed' ? p.speed.toFixed(2) : (val as number).toFixed(2)}</span>
                    </div>
                    <div className="h-0.5 w-full rounded-full bg-white/[0.08]">
                      <div
                        className={['h-full rounded-full transition-all', isActive ? 'bg-accent/70' : 'bg-white/25'].join(' ')}
                        style={{ width: `${Math.min(1, Math.max(0, val as number)) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </motion.button>
          )
        })}
      </div>
    </div>
  )
}

// ─── Left Panel ───────────────────────────────────────────────────────────────

function LeftPanel({
  config, onChange, saving, saved, saveError, onSave, loadingConfig, initialExpressiveMode,
}: {
  config: AgentConfig
  onChange: (p: Partial<AgentConfig>) => void
  saving: boolean; saved: boolean; saveError: string | null
  onSave: () => void
  loadingConfig: boolean
  initialExpressiveMode?: boolean
}) {
  const [tab, setTab] = useState<LeftTab>('prompt')

  // Phone state
  const [dialNumber, setDialNumber] = useState('')
  const [bizName, setBizName] = useState('')
  const [callStatus, setCallStatus] = useState<CallStatus>('idle')
  const [callError, setCallError] = useState<string | null>(null)
  const [phoneMode, setPhoneMode] = useState<'outbound' | 'inbound'>('outbound')
  const [copied, setCopied] = useState(false)
  const webhookUrl = typeof window !== 'undefined' ? `${window.location.origin}/api/demo-call/twiml` : ''

  const dial = async () => {
    if (!dialNumber.trim()) return
    setCallStatus('calling'); setCallError(null)
    try {
      const res = await fetch('/api/demo-call/outbound', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: dialNumber.trim(), businessName: bizName.trim() || 'the business' }),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? `Error ${res.status}`) }
      setCallStatus('success')
      setTimeout(() => setCallStatus('idle'), 5000)
    } catch (e) {
      setCallError(e instanceof Error ? e.message : 'Call failed')
      setCallStatus('error')
      setTimeout(() => setCallStatus('idle'), 6000)
    }
  }

  const copy = (t: string) => { navigator.clipboard.writeText(t); setCopied(true); setTimeout(() => setCopied(false), 2000) }

  const TABS_WITH_SAVE: LeftTab[] = ['prompt', 'knowledge', 'settings']

  return (
    <div className="flex flex-col h-full border-r border-white/[0.07]">
      {/* Tab bar */}
      <div className="flex border-b border-white/[0.07] shrink-0">
        {LEFT_TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={['flex-1 flex items-center justify-center gap-1 py-3 text-[11px] font-medium border-b-2 transition-all',
              tab === t.id ? 'border-accent text-accent' : 'border-transparent text-textMuted hover:text-textPrimary'].join(' ')}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {loadingConfig ? (
          <div className="flex items-center justify-center h-32 gap-2 text-textMuted">
            <Loader2 size={15} className="animate-spin" /><span className="text-sm">Loading…</span>
          </div>
        ) : (
          <>
            {tab === 'prompt' && (
              <>
                <div>
                  <label className={labelCls}><FileText size={10} className="text-accent" />System Prompt</label>
                  <textarea rows={10} value={config.prompt} onChange={e => onChange({ prompt: e.target.value })}
                    className={`${inputCls} resize-none font-mono text-[12px] leading-relaxed`}
                    placeholder="You are a helpful AI voice assistant for…" />
                </div>
                <div>
                  <label className={labelCls}><Mic size={10} className="text-accent" />First Message / Greeting</label>
                  <input type="text" value={config.firstMessage} onChange={e => onChange({ firstMessage: e.target.value })}
                    className={inputCls} placeholder="Hi! How can I help you today?" />
                </div>
              </>
            )}

            {tab === 'knowledge' && (
              <KnowledgePanel config={config} onDocsChange={docs => onChange({ knowledgeBase: docs })} />
            )}

            {tab === 'phone' && (
              <div className="space-y-4">
                <div className="flex rounded-lg bg-white/[0.04] border border-white/[0.07] p-1 gap-1">
                  {(['outbound', 'inbound'] as const).map(m => (
                    <button key={m} onClick={() => setPhoneMode(m)}
                      className={['flex-1 flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium transition-all capitalize',
                        phoneMode === m ? 'bg-accent text-white' : 'text-textMuted hover:text-textPrimary'].join(' ')}>
                      {m === 'outbound' ? <PhoneOutgoing size={11} /> : <PhoneIncoming size={11} />}{m}
                    </button>
                  ))}
                </div>

                {phoneMode === 'outbound' ? (
                  <>
                    <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.07]">
                      <PhoneOutgoing size={13} className="text-accent shrink-0" />
                      <div className="flex-1">
                        <p className="text-[10px] text-textMuted uppercase tracking-widest font-semibold">Caller ID</p>
                        <p className="text-sm font-mono text-textPrimary">your Twilio number</p>
                      </div>
                      <span className="text-[11px] text-emerald-400 font-medium">Active</span>
                    </div>
                    <div>
                      <label className={labelCls}><Phone size={10} />Target Number</label>
                      <input type="tel" value={dialNumber} onChange={e => setDialNumber(e.target.value)}
                        placeholder="+27 82 123 4567" className={inputCls}
                        onKeyDown={e => e.key === 'Enter' && dial()} />
                    </div>
                    <div>
                      <label className={labelCls}><Type size={10} />Business Name (optional)</label>
                      <input type="text" value={bizName} onChange={e => setBizName(e.target.value)}
                        placeholder="Acme Plumbing" className={inputCls} />
                    </div>
                    <motion.button whileTap={{ scale: 0.97 }} onClick={dial}
                      disabled={!dialNumber.trim() || callStatus === 'calling'}
                      className={['w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all',
                        callStatus === 'success' ? 'bg-emerald-500/20 border border-emerald-500/30 text-emerald-300'
                          : callStatus === 'error' ? 'bg-red-500/20 border border-red-500/30 text-red-300'
                            : 'bg-accent text-white hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed'].join(' ')}>
                      {callStatus === 'calling' && <><Loader2 size={14} className="animate-spin" />Dialling…</>}
                      {callStatus === 'success' && <><CheckCircle2 size={14} />Agent is dialling</>}
                      {callStatus === 'error' && <><AlertCircle size={14} />{callError ?? 'Failed'}</>}
                      {callStatus === 'idle' && <><PhoneOutgoing size={14} />Dial Number</>}
                    </motion.button>
                  </>
                ) : (
                  <>
                    <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-300 text-[12px] space-y-1">
                      <p className="font-semibold">Inbound setup</p>
                      <ol className="list-decimal list-inside space-y-0.5 text-[11px]">
                        <li>Open Twilio Console → Phone Numbers → Configure</li>
                        <li>Set "A call comes in" to Webhook</li>
                        <li>Paste the URL below and save</li>
                      </ol>
                    </div>
                    <div>
                      <label className={labelCls}><Globe size={10} />Twilio Webhook URL</label>
                      <div className="flex gap-2">
                        <div className="flex-1 flex items-center px-3 py-2 rounded-xl bg-white/[0.03] border border-white/[0.07] text-xs text-textPrimary font-mono truncate">{webhookUrl}</div>
                        <button onClick={() => copy(webhookUrl)} className="px-3 rounded-xl bg-white/[0.06] border border-white/[0.07] hover:bg-white/[0.1] transition-all">
                          {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} className="text-textMuted" />}
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {tab === 'settings' && (
              <div className="space-y-4">
                <div>
                  <label className={labelCls}><Settings size={10} className="text-accent" />Temperature</label>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] text-textMuted">
                      <span>Consistent</span>
                      <span className="font-mono text-textPrimary">{config.temperature.toFixed(1)}</span>
                      <span>Creative</span>
                    </div>
                    <input type="range" min="0" max="1" step="0.1" value={config.temperature}
                      onChange={e => onChange({ temperature: parseFloat(e.target.value) })}
                      className="w-full accent-accent" />
                  </div>
                </div>
                <div>
                  <label className={labelCls}><Globe size={10} className="text-accent" />Language</label>
                  <div className="relative">
                    <select value={config.language} onChange={e => onChange({ language: e.target.value })}
                      className={`${inputCls} appearance-none cursor-pointer`}>
                      {[['en','English'],['af','Afrikaans'],['zh','Chinese'],['fr','French'],['de','German'],
                        ['hi','Hindi'],['it','Italian'],['ja','Japanese'],['ko','Korean'],['pt','Portuguese'],
                        ['es','Spanish'],['sw','Swahili'],['ar','Arabic']].map(([v,l]) => (
                        <option key={v} value={v}>{l}</option>
                      ))}
                    </select>
                    <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-textMuted pointer-events-none" />
                  </div>
                </div>
                <div>
                  <label className={labelCls}><Settings size={10} className="text-accent" />Model</label>
                  <div className="space-y-2">
                    {['eleven_turbo_v2_5','eleven_multilingual_v2','eleven_flash_v2_5'].map(m => (
                      <label key={m} className="flex items-center gap-2.5 cursor-pointer">
                        <input type="radio" name="model" value={m} defaultChecked={m === 'eleven_turbo_v2_5'} className="accent-accent" />
                        <span className="text-xs text-textPrimary font-mono">{m}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {tab === 'persona' && (
              <PersonaPanel onChange={onChange} onSave={onSave} initialExpressiveMode={initialExpressiveMode} />
            )}
          </>
        )}
      </div>

      {/* Save bar */}
      {TABS_WITH_SAVE.includes(tab) && (
        <div className="shrink-0 px-4 py-3 border-t border-white/[0.07] flex items-center justify-between gap-3">
          <AnimatePresence mode="wait">
            {saveError && (
              <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="text-[11px] text-orange-400 flex items-center gap-1"><AlertCircle size={12} />{saveError}</motion.p>
            )}
            {saved && !saveError && (
              <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="text-[11px] text-emerald-400 flex items-center gap-1"><CheckCircle2 size={12} />Saved</motion.p>
            )}
            {!saveError && !saved && <span />}
          </AnimatePresence>
          <button onClick={onSave} disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-accent text-white hover:bg-accent/90 disabled:opacity-60 disabled:cursor-not-allowed transition-all">
            {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Middle Panel: Voice Picker ───────────────────────────────────────────────

function VoicePanel({ config, onChange }: { config: AgentConfig; onChange: (p: Partial<AgentConfig>) => void }) {
  const [voices, setVoices] = useState<ElevenLabsVoice[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [playing, setPlaying] = useState<string | null>(null)
  const [saving, setSaving] = useState<string | null>(null)
  const [savedId, setSavedId] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    fetch('/api/elevenlabs/voices')
      .then(r => r.json())
      .then(d => setVoices(d.voices ?? []))
      .finally(() => setLoading(false))
  }, [])

  const preview = (v: ElevenLabsVoice) => {
    if (!v.preview_url) return
    if (playing === v.voice_id) { audioRef.current?.pause(); setPlaying(null); return }
    audioRef.current?.pause()
    const audio = new Audio(v.preview_url)
    audioRef.current = audio
    setPlaying(v.voice_id)
    audio.onended = () => setPlaying(null)
    audio.play()
  }

  const select = async (v: ElevenLabsVoice) => {
    if (saving) return
    onChange({ voiceId: v.voice_id, voiceName: v.name })
    setSaving(v.voice_id)
    try {
      let voiceId = v.voice_id

      // Public/shared voices must be added to the account library before they
      // can be assigned to an agent — otherwise ElevenLabs returns voice_not_found.
      if (v.public_owner_id && v.category !== 'premade' && v.category !== 'cloned') {
        const addRes = await fetch('/api/elevenlabs/voices/add', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ voice_id: v.voice_id, public_owner_id: v.public_owner_id, name: v.name }),
        })
        if (addRes.ok) {
          const added = await addRes.json()
          voiceId = added.voice_id ?? voiceId
          // Update local state with the library voice_id
          onChange({ voiceId, voiceName: v.name })
        }
      }

      await fetch('/api/elevenlabs/agent', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversation_config: { tts: { voice_id: voiceId } } }),
      })
      setSavedId(v.voice_id)
      setTimeout(() => setSavedId(null), 2000)
    } finally { setSaving(null) }
  }

  const grouped = voices.reduce<Record<string, ElevenLabsVoice[]>>((acc, v) => {
    const g = v.category === 'cloned' ? 'My Voices' : v.category === 'premade' ? 'ElevenLabs' : 'Public'
    ;(acc[g] ??= []).push(v)
    return acc
  }, {})

  const filtered = voices.filter(v =>
    v.name.toLowerCase().includes(search.toLowerCase()) ||
    Object.values(v.labels ?? {}).some(l => l.toLowerCase().includes(search.toLowerCase()))
  )

  const currentVoiceName = config.voiceName || (config.voiceId ? voices.find(v => v.voice_id === config.voiceId)?.name : null)

  return (
    <div className="flex flex-col h-full border-r border-white/[0.07]">
      {/* Header */}
      <div className="shrink-0 px-4 py-3 border-b border-white/[0.07]">
        <p className="text-xs font-semibold text-textMuted uppercase tracking-widest mb-0.5">Voice</p>
        <p className="text-sm font-medium text-textPrimary truncate">
          {currentVoiceName ?? 'Unselected'}
        </p>
      </div>

      {/* Search */}
      <div className="shrink-0 px-3 py-2.5 border-b border-white/[0.07]">
        <input type="text" placeholder="Search voices…" value={search} onChange={e => setSearch(e.target.value)}
          className="w-full bg-white/[0.04] border border-white/[0.07] rounded-lg px-3 py-2 text-xs text-textPrimary placeholder:text-textMuted outline-none focus:border-accent/40 transition-all" />
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-24 gap-2 text-textMuted">
            <Loader2 size={14} className="animate-spin" /><span className="text-xs">Loading…</span>
          </div>
        ) : search ? (
          <div className="p-2 space-y-1">
            {filtered.map(v => <VoiceRow key={v.voice_id} voice={v} config={config} playing={playing} saving={saving} savedId={savedId} onSelect={select} onPreview={preview} />)}
            {filtered.length === 0 && <p className="text-center text-xs text-textMuted py-6">No voices match</p>}
          </div>
        ) : (
          ['My Voices','ElevenLabs','Public'].filter(g => grouped[g]?.length).map(g => (
            <div key={g}>
              <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-textMuted bg-white/[0.02] sticky top-0">{g}</p>
              <div className="p-2 space-y-0.5">
                {grouped[g].map(v => <VoiceRow key={v.voice_id} voice={v} config={config} playing={playing} saving={saving} savedId={savedId} onSelect={select} onPreview={preview} />)}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function VoiceRow({ voice: v, config, playing, saving, savedId, onSelect, onPreview }: {
  voice: ElevenLabsVoice; config: AgentConfig
  playing: string | null; saving: string | null; savedId: string | null
  onSelect: (v: ElevenLabsVoice) => void; onPreview: (v: ElevenLabsVoice) => void
}) {
  const selected = config.voiceId === v.voice_id
  const isSaving = saving === v.voice_id
  const justSaved = savedId === v.voice_id
  return (
    <div onClick={() => onSelect(v)}
      className={['flex items-center gap-2 px-2.5 py-2 rounded-lg cursor-pointer transition-all group',
        selected ? 'bg-accent/10 text-textPrimary' : 'hover:bg-white/[0.04] text-textMuted hover:text-textPrimary'].join(' ')}>
      <div className="shrink-0 w-4 flex items-center justify-center">
        {isSaving ? <Loader2 size={11} className="animate-spin text-accent" />
          : justSaved ? <CheckCircle2 size={11} className="text-emerald-400" />
            : <div className={['w-1.5 h-1.5 rounded-full', selected ? 'bg-accent' : 'bg-white/20'].join(' ')} />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium truncate">{v.name}</p>
        <p className="text-[10px] text-textMuted truncate">
          {[v.labels?.accent, v.labels?.gender].filter(Boolean).join(' · ')}
        </p>
      </div>
      {v.preview_url && (
        <button onClick={e => { e.stopPropagation(); onPreview(v) }}
          className="shrink-0 p-1 rounded hover:bg-white/10 opacity-0 group-hover:opacity-100 transition-all">
          {playing === v.voice_id
            ? <Volume2 size={11} className="text-accent animate-pulse" />
            : <Play size={11} className="text-textMuted" />}
        </button>
      )}
    </div>
  )
}

// ─── Right Panel: Test Chat ───────────────────────────────────────────────────

type AgentStatus = 'idle' | 'connecting' | 'saving' | 'listening' | 'thinking' | 'speaking'
type InputMode = 'voice' | 'text'

const STATUS_LABEL: Record<AgentStatus, string> = {
  idle: 'Ready',
  connecting: 'Connecting…',
  saving: 'Saving prompt…',
  listening: 'Listening',
  thinking: 'Thinking…',
  speaking: 'Speaking',
}

const STATUS_COLOR: Record<AgentStatus, string> = {
  idle: 'bg-white/20',
  connecting: 'bg-yellow-400 animate-pulse',
  saving: 'bg-yellow-400 animate-pulse',
  listening: 'bg-emerald-400',
  thinking: 'bg-accent animate-pulse',
  speaking: 'bg-accent',
}

function TestPanel({ agentConfig, onSave, isDirty }: {
  agentConfig: AgentConfig
  onSave: () => Promise<void>
  isDirty: boolean
}) {
  const agentId = process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID ?? ''
  const [agentStatus, setAgentStatus] = useState<AgentStatus>('idle')
  const [inputMode, setInputMode] = useState<InputMode>('voice')
  const [muted, setMuted] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [micBlocked, setMicBlocked] = useState(false)
  const [micHintOpen, setMicHintOpen] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const micStreamRef = useRef<MediaStream | null>(null)

  const conversation = useConversation({
    onMessage: ({ message, source }: { message: string; source: string }) => {
      setMessages(m => [...m, { role: source === 'ai' ? 'agent' : 'user', text: message }])
      if (source === 'ai') setAgentStatus('listening')
    },
    onError: (err: string) => {
      setMessages(m => [...m, { role: 'agent', text: `⚠ ${err}` }])
      setAgentStatus('idle')
    },
    onDisconnect: () => {
      setAgentStatus('idle')
      if (micStreamRef.current) { micStreamRef.current.getTracks().forEach(t => t.stop()); micStreamRef.current = null }
    },
  })

  const isConnected = conversation.status === 'connected'
  const isActive = agentStatus !== 'idle'

  useEffect(() => {
    if (!isConnected) return
    if (conversation.isSpeaking) setAgentStatus('speaking')
    else if (agentStatus === 'speaking') setAgentStatus('listening')
  }, [conversation.isSpeaking, isConnected]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  // Auto-save prompt to ElevenLabs before starting a session so the agent uses the latest prompt
  const saveAndConnect = async (startFn: () => Promise<void>) => {
    if (isDirty) {
      setAgentStatus('saving')
      try { await onSave() } catch { /* continue even if save fails */ }
    }
    await startFn()
  }

  // Start voice session (WebRTC + mic)
  const startVoiceSession = async () => {
    if (!agentId || agentStatus === 'connecting' || agentStatus === 'saving') return
    setAgentStatus('connecting')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      micStreamRef.current = stream
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await conversation.startSession({ agentId, connectionType: 'webrtc' } as any)
      setAgentStatus('listening')
    } catch (e) {
      setAgentStatus('idle')
      const msg = e instanceof Error ? e.message : String(e)
      const isPermission = /permission|denied|notallowed/i.test(msg)
      if (isPermission) {
        setInputMode('text')
        setMicBlocked(true)
        setMessages(m => [...m, {
          role: 'agent',
          text: 'Microphone access was denied — switched to text mode.',
        }])
        await startTextSession()
      } else {
        setMessages(m => [...m, { role: 'agent', text: `⚠ ${msg}` }])
      }
    }
  }

  // Start text-only session via signed WebSocket URL (no mic needed)
  const startTextSession = async () => {
    if (!agentId || agentStatus === 'connecting' || agentStatus === 'saving') return
    setAgentStatus('connecting')
    try {
      // Get a server-signed WebSocket URL so we don't expose the API key client-side
      const urlRes = await fetch('/api/elevenlabs/signed-url')
      if (!urlRes.ok) throw new Error('Could not get session URL')
      const { signedUrl } = await urlRes.json()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await conversation.startSession({ signedUrl, textOnly: true } as any)
      setAgentStatus('listening')
    } catch (e) {
      setAgentStatus('idle')
      setMessages(m => [...m, { role: 'agent', text: `⚠ ${e instanceof Error ? e.message : 'Could not start session'}` }])
    }
  }

  const endSession = async () => {
    if (isConnected) await conversation.endSession()
    if (micStreamRef.current) { micStreamRef.current.getTracks().forEach(t => t.stop()); micStreamRef.current = null }
    setAgentStatus('idle')
  }

  const newChat = async () => {
    await endSession()
    setMessages([])
    setMuted(false)
  }

  const toggleMute = () => {
    if (!micStreamRef.current) return
    micStreamRef.current.getAudioTracks().forEach(t => { t.enabled = muted })
    setMuted(m => !m)
  }

  // Send a text message through the live session (works in both voice + text mode)
  const sendText = async () => {
    if (!input.trim() || !agentId) return
    const text = input.trim()
    setInput('')
    setMessages(m => [...m, { role: 'user', text }])

    // If not connected, auto-save then start the right type of session,
    // then wait a tick for the WebSocket handshake to fully complete.
    if (!isConnected) {
      if (inputMode === 'voice') await saveAndConnect(startVoiceSession)
      else await saveAndConnect(startTextSession)
      await new Promise(r => setTimeout(r, 300))
    }

    // Send through live WebSocket — agent uses its prompt + knowledge base
    try {
      conversation.sendUserMessage(text)
      setAgentStatus('thinking')
    } catch {
      setMessages(m => [...m, { role: 'agent', text: '⚠ Could not send message — please try again.' }])
      setAgentStatus('listening')
    }
  }

  // ── Always-visible 3-part layout ─────────────────────────────────────────
  return (
    <div className="flex flex-col h-full">

      {/* ── Header ── */}
      <div className="shrink-0 flex items-center gap-2 px-5 py-3 border-b border-white/[0.06]">
        {/* Left: status + new chat */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <MessageSquare size={13} className="text-textMuted shrink-0" />
          <span className="text-[11px] font-semibold text-textMuted uppercase tracking-widest">Test</span>
          {isDirty && !isActive && (
            <span className="text-[10px] text-yellow-400/80 bg-yellow-400/10 border border-yellow-400/20 px-1.5 py-0.5 rounded font-medium">
              Unsaved — will auto-save on test
            </span>
          )}
          {isActive && (
            <>
              <span className="text-textMuted/30">·</span>
              <div className={['w-1.5 h-1.5 rounded-full shrink-0 transition-all', STATUS_COLOR[agentStatus]].join(' ')} />
              <AnimatePresence mode="wait">
                <motion.span key={agentStatus}
                  initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -3 }}
                  transition={{ duration: 0.12 }}
                  className="text-[11px] text-textMuted">
                  {STATUS_LABEL[agentStatus]}
                </motion.span>
              </AnimatePresence>
            </>
          )}
        </div>

        {/* Right: mute + reset + Test Agent button */}
        <div className="flex items-center gap-1.5">
          {isConnected && (
            <button onClick={toggleMute} title={muted ? 'Unmute' : 'Mute'}
              className={['p-1.5 rounded-lg transition-all',
                muted ? 'bg-red-500/15 text-red-400' : 'text-textMuted hover:text-textPrimary hover:bg-white/[0.06]'].join(' ')}>
              {muted ? <MicOff size={13} /> : <Mic size={13} />}
            </button>
          )}
          <button onClick={newChat} title="New chat"
            className="p-1.5 rounded-lg text-textMuted hover:text-textPrimary hover:bg-white/[0.06] transition-all">
            <RotateCcw size={13} />
          </button>
          {/* The primary action — matches Ultravox's green "Test Agent" button */}
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={isConnected ? endSession : () => saveAndConnect(inputMode === 'voice' ? startVoiceSession : startTextSession)}
            className={['flex items-center gap-2 px-4 py-2 rounded-xl text-[12px] font-semibold transition-all shadow-sm',
              isConnected
                ? 'bg-red-500/15 text-red-400 border border-red-500/25 hover:bg-red-500/20'
                : agentStatus === 'connecting'
                  ? 'bg-accent/60 text-white cursor-not-allowed'
                  : 'bg-accent text-white hover:bg-accent/90 shadow-accent/20'].join(' ')}>
            {agentStatus === 'connecting'
              ? <><Loader2 size={12} className="animate-spin" />Connecting…</>
              : isConnected
                ? <>End Call</>
                : <><Play size={12} fill="white" />Test Agent</>}
          </motion.button>
        </div>
      </div>

      {/* ── Transcript ── */}
      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-4 select-none">
            {agentStatus === 'connecting' ? (
              <>
                <div className="w-8 h-8 rounded-full border-2 border-accent/25 border-t-accent animate-spin" />
                <p className="text-[12px] text-textMuted">Connecting to agent…</p>
              </>
            ) : isConnected ? (
              <>
                <div className="w-10 h-10 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                  <Mic size={16} className="text-emerald-400" />
                </div>
                <p className="text-[12px] text-textMuted">Speak — the agent is listening</p>
              </>
            ) : (
              <>
                <div className="w-10 h-10 rounded-full bg-white/[0.04] border border-white/[0.08] flex items-center justify-center">
                  <MessageSquare size={16} className="text-white/20" />
                </div>
                <div className="text-center space-y-1">
                  <p className="text-[13px] font-medium text-textPrimary/60">Ready to test</p>
                  <p className="text-[11px] text-textMuted">Click Test Agent or type below</p>
                </div>
              </>
            )}
          </div>
        )}

        {messages.map((m, i) => (
          <motion.div key={i}
            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}
            className={['flex gap-2.5 items-end', m.role === 'user' ? 'justify-end' : 'justify-start'].join(' ')}>
            {m.role === 'agent' && (
              <div className="shrink-0 w-7 h-7 rounded-full bg-gradient-to-br from-accent/25 to-accent/10 border border-accent/20 flex items-center justify-center mb-0.5">
                <Volume2 size={11} className="text-accent" />
              </div>
            )}
            <div className={['max-w-[78%] rounded-2xl px-4 py-2.5 text-[13px] leading-relaxed',
              m.role === 'user'
                ? 'bg-accent text-white rounded-br-sm shadow-sm shadow-accent/15'
                : 'bg-white/[0.06] text-textPrimary rounded-bl-sm border border-white/[0.05]'].join(' ')}>
              {m.text}
            </div>
            {m.role === 'user' && (
              <div className="shrink-0 w-7 h-7 rounded-full bg-white/[0.07] border border-white/[0.08] flex items-center justify-center mb-0.5">
                <span className="text-[10px] font-bold text-textMuted">U</span>
              </div>
            )}
          </motion.div>
        ))}

        {(sending || agentStatus === 'thinking') && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
            className="flex gap-2.5 items-end">
            <div className="shrink-0 w-7 h-7 rounded-full bg-gradient-to-br from-accent/25 to-accent/10 border border-accent/20 flex items-center justify-center">
              <Volume2 size={11} className="text-accent" />
            </div>
            <div className="bg-white/[0.06] border border-white/[0.05] rounded-2xl rounded-bl-sm px-4 py-3.5 flex items-center gap-1.5">
              {[0, 120, 240].map(d => (
                <span key={d} className="w-1.5 h-1.5 rounded-full bg-textMuted/50 animate-bounce" style={{ animationDelay: `${d}ms` }} />
              ))}
            </div>
          </motion.div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* ── Input area — always visible ── */}
      <div className="shrink-0 border-t border-white/[0.06] px-5 pt-3.5 pb-4 space-y-2.5 bg-white/[0.01]">

        {/* Voice listening strip */}
        <AnimatePresence>
          {isConnected && inputMode === 'voice' && (
            <motion.div
              initial={{ opacity: 0, height: 0, marginBottom: 0 }}
              animate={{ opacity: 1, height: 'auto', marginBottom: 0 }}
              exit={{ opacity: 0, height: 0 }}
              className="flex items-center gap-2.5 px-3.5 py-2 rounded-xl bg-emerald-500/[0.06] border border-emerald-500/[0.15]">
              <div className={['w-2 h-2 rounded-full transition-all', conversation.isSpeaking ? 'bg-accent animate-pulse' : 'bg-emerald-400'].join(' ')} />
              <p className="text-[11px] text-emerald-300/70 flex-1 leading-tight">
                {conversation.isSpeaking ? 'Agent speaking…' : muted ? 'Microphone muted' : 'Listening — speak now or type below'}
              </p>
              {muted && <span className="text-[10px] font-semibold text-red-400 uppercase tracking-wide">Muted</span>}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Text input */}
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendText()}
            placeholder="Type your message…"
            className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-textPrimary placeholder:text-textMuted/50 outline-none focus:border-accent/40 focus:bg-white/[0.06] transition-all"
            disabled={sending}
          />
          <motion.button whileTap={{ scale: 0.9 }} onClick={sendText}
            disabled={!input.trim() || sending}
            className="w-[42px] h-[42px] rounded-xl bg-accent text-white flex items-center justify-center hover:bg-accent/90 disabled:opacity-25 disabled:cursor-not-allowed transition-all shadow-sm">
            <Send size={14} />
          </motion.button>
        </div>

        {/* Voice / Text toggle */}
        <div className="flex items-center justify-between">
          <div className="flex items-center rounded-lg bg-white/[0.03] border border-white/[0.07] p-0.5 gap-0.5">
            <button
              onClick={() => setInputMode('voice')}
              className={['flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-medium transition-all',
                inputMode === 'voice' ? 'bg-white/[0.09] text-textPrimary' : 'text-textMuted hover:text-textPrimary'].join(' ')}>
              <Mic size={11} />Voice
            </button>
            <button
              onClick={() => setInputMode('text')}
              className={['flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-medium transition-all',
                inputMode === 'text' ? 'bg-white/[0.09] text-textPrimary' : 'text-textMuted hover:text-textPrimary'].join(' ')}>
              <MessageSquare size={11} />Text
            </button>
          </div>
          <span className="text-[10px] text-textMuted/50">↵ Enter to submit</span>
        </div>

        {/* Mic blocked hint */}
        {micBlocked && (
          <div className="rounded-lg bg-orange-500/[0.08] border border-orange-500/20 overflow-hidden">
            <button
              onClick={() => setMicHintOpen(o => !o)}
              className="w-full flex items-center gap-2 px-3 py-2 text-left">
              <MicOff size={11} className="text-orange-400 shrink-0" />
              <span className="flex-1 text-[11px] text-orange-300">Mic blocked — how to re-enable</span>
              <ChevronDown size={11} className={['text-orange-400 transition-transform', micHintOpen ? 'rotate-180' : ''].join(' ')} />
            </button>
            {micHintOpen && (
              <p className="px-3 pb-2.5 text-[11px] text-orange-200/70 leading-relaxed">
                Click the <strong>🔒 lock icon</strong> in Chrome&apos;s address bar → set <strong>Microphone</strong> to <em>Allow</em> → refresh the page, then click <strong>Voice</strong> and <strong>Test Agent</strong>.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Knowledge Panel ──────────────────────────────────────────────────────────

type AddMode = 'url' | 'text' | 'file'

function KnowledgePanel({ config, onDocsChange }: { config: AgentConfig; onDocsChange: (d: KnowledgeBaseDoc[]) => void }) {
  const [addMode, setAddMode] = useState<AddMode>('url')
  const [urlInput, setUrlInput] = useState('')
  const [nameInput, setNameInput] = useState('')
  const [textInput, setTextInput] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const upload = async () => {
    setUploading(true); setUploadError(null)
    try {
      let res: Response
      if (addMode === 'file' && file) {
        const form = new FormData(); form.append('file', file); if (nameInput) form.append('name', nameInput)
        res = await fetch('/api/elevenlabs/knowledge-base', { method: 'POST', body: form })
      } else {
        res = await fetch('/api/elevenlabs/knowledge-base', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: addMode, url: urlInput, text: textInput, name: nameInput || urlInput || 'Document' }),
        })
      }
      if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? 'Upload failed') }
      const doc = await res.json()
      onDocsChange([...config.knowledgeBase, { id: doc.id, name: doc.name, type: doc.type ?? addMode }])
      setUrlInput(''); setNameInput(''); setTextInput(''); setFile(null)
    } catch (e) { setUploadError(e instanceof Error ? e.message : 'Upload failed') }
    finally { setUploading(false) }
  }

  const deleteDoc = async (id: string) => {
    setDeletingId(id)
    try { await fetch(`/api/elevenlabs/knowledge-base/${id}`, { method: 'DELETE' }); onDocsChange(config.knowledgeBase.filter(d => d.id !== id)) }
    finally { setDeletingId(null) }
  }

  return (
    <div className="space-y-4">
      {config.knowledgeBase.length > 0 && (
        <div className="space-y-1.5">
          {config.knowledgeBase.map(doc => (
            <div key={doc.id} className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06]">
              <FileText size={12} className="text-accent shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-textPrimary truncate">{doc.name}</p>
                <p className="text-[10px] text-textMuted capitalize">{doc.type}</p>
              </div>
              <button onClick={() => deleteDoc(doc.id)} disabled={deletingId === doc.id}
                className="p-1 rounded hover:bg-red-500/10 text-textMuted hover:text-red-400 transition-all">
                {deletingId === doc.id ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex rounded-lg bg-white/[0.04] border border-white/[0.07] p-0.5 gap-0.5">
        {(['url','text','file'] as AddMode[]).map(m => (
          <button key={m} onClick={() => setAddMode(m)}
            className={['flex-1 rounded-md py-1.5 text-xs font-medium capitalize transition-all',
              addMode === m ? 'bg-accent text-white' : 'text-textMuted hover:text-textPrimary'].join(' ')}>
            {m === 'url' ? 'URL' : m === 'text' ? 'Text' : 'File'}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {addMode === 'url' && (
          <>
            <input type="url" value={urlInput} onChange={e => setUrlInput(e.target.value)} placeholder="https://yoursite.com" className={inputCls} />
            <input type="text" value={nameInput} onChange={e => setNameInput(e.target.value)} placeholder="Name (optional)" className={inputCls} />
          </>
        )}
        {addMode === 'text' && (
          <>
            <input type="text" value={nameInput} onChange={e => setNameInput(e.target.value)} placeholder="Document name" className={inputCls} />
            <textarea rows={6} value={textInput} onChange={e => setTextInput(e.target.value)}
              placeholder="Paste content here…" className={`${inputCls} resize-none font-mono text-[12px]`} />
          </>
        )}
        {addMode === 'file' && (
          <>
            <div onClick={() => fileRef.current?.click()}
              className="flex items-center justify-center gap-2 h-16 rounded-xl border border-dashed border-white/[0.12] hover:border-accent/40 cursor-pointer transition-all text-textMuted hover:text-textPrimary text-xs">
              <Upload size={13} />{file ? file.name : 'Click to choose file (.pdf, .txt, .docx)'}
            </div>
            <input ref={fileRef} type="file" className="hidden" accept=".pdf,.txt,.docx,.md"
              onChange={e => setFile(e.target.files?.[0] ?? null)} />
            <input type="text" value={nameInput} onChange={e => setNameInput(e.target.value)} placeholder="Name (optional)" className={inputCls} />
          </>
        )}
      </div>

      {uploadError && <p className="text-[11px] text-orange-400 flex items-center gap-1"><AlertCircle size={11} />{uploadError}</p>}

      <button onClick={upload} disabled={uploading || (addMode === 'url' && !urlInput) || (addMode === 'text' && (!textInput || !nameInput)) || (addMode === 'file' && !file)}
        className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold bg-white/[0.06] border border-white/[0.07] text-textPrimary hover:bg-white/[0.1] disabled:opacity-40 disabled:cursor-not-allowed transition-all">
        {uploading ? <><Loader2 size={12} className="animate-spin" />Uploading…</> : <><Upload size={12} />Add Document</>}
      </button>
    </div>
  )
}

// ─── Resize Divider ───────────────────────────────────────────────────────────

function ResizeDivider({ onDrag }: { onDrag: (dx: number) => void }) {
  const dragging = useRef(false)
  const lastX = useRef(0)

  const onMouseDown = (e: React.MouseEvent) => {
    dragging.current = true
    lastX.current = e.clientX
    e.preventDefault()

    const onMove = (ev: MouseEvent) => {
      if (!dragging.current) return
      onDrag(ev.clientX - lastX.current)
      lastX.current = ev.clientX
    }
    const onUp = () => { dragging.current = false; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  return (
    <div
      onMouseDown={onMouseDown}
      className="w-1 shrink-0 cursor-col-resize group relative z-10 select-none"
      style={{ background: 'transparent' }}
    >
      <div className="absolute inset-y-0 left-0 w-px bg-white/[0.06] group-hover:bg-accent/40 group-active:bg-accent/60 transition-colors" />
      <div className="absolute inset-y-0 -left-1 -right-1" />
    </div>
  )
}

// ─── Main Drawer ──────────────────────────────────────────────────────────────

interface AgentConfigDrawerProps { open: boolean; onClose: () => void }

export function AgentConfigDrawer({ open, onClose }: AgentConfigDrawerProps) {
  const [config, setConfig] = useState<AgentConfig>({
    prompt: '', firstMessage: '', voiceId: '', voiceName: '', temperature: 0.7, language: 'en', knowledgeBase: [],
  })
  const [agentName, setAgentName] = useState('Agent')
  const [loadingConfig, setLoadingConfig] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [isDirty, setIsDirty] = useState(false)
  const [expressiveMode, setExpressiveMode] = useState(true)

  // Resizable panel widths
  const drawerRef = useRef<HTMLDivElement>(null)
  const [leftW, setLeftW] = useState(300)
  const [midW, setMidW] = useState(260)

  // Clamp helper
  const MIN = 180; const MAX = 600
  const clamp = (v: number) => Math.max(MIN, Math.min(MAX, v))

  const loadConfig = useCallback(async () => {
    setLoadingConfig(true)
    try {
      const res = await fetch('/api/elevenlabs/agent')
      if (!res.ok) return
      const data = await res.json()
      setAgentName(data.name ?? 'Agent')
      const cc = data.conversation_config ?? {}
      const voiceId = cc.tts?.voice_id ?? ''
      setConfig({
        prompt: cc.agent?.prompt?.prompt ?? '',
        firstMessage: cc.agent?.first_message ?? '',
        voiceId,
        voiceName: '',
        temperature: cc.agent?.prompt?.temperature ?? 0.7,
        language: cc.agent?.language ?? 'en',
        knowledgeBase: cc.agent?.prompt?.knowledge_base ?? [],
      })
      const tts = data.conversation_config?.tts
      if (tts?.expressive_mode !== undefined) setExpressiveMode(tts.expressive_mode)
      setIsDirty(false)
    } finally { setLoadingConfig(false) }
  }, [])

  useEffect(() => { if (open) loadConfig() }, [open, refreshKey, loadConfig])

  const patch = (p: Partial<AgentConfig>) => { setConfig(c => ({ ...c, ...p })); setIsDirty(true) }

  const save = async () => {
    setSaving(true); setSaved(false); setSaveError(null)
    try {
      const res = await fetch('/api/elevenlabs/agent', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation_config: {
            agent: {
              // Knowledge base is managed separately via the knowledge-base API routes —
              // do NOT include it here to avoid clobbering docs added outside this session.
              prompt: { prompt: config.prompt, temperature: config.temperature },
              first_message: config.firstMessage,
              language: config.language,
            },
            tts: { voice_id: config.voiceId },
          },
        }),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? 'Save failed') }
      setSaved(true); setIsDirty(false); setTimeout(() => setSaved(false), 3000)
    } catch (e) { setSaveError(e instanceof Error ? e.message : 'Save failed') }
    finally { setSaving(false) }
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose} className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40" />

          <motion.div
            ref={drawerRef}
            initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed right-0 top-0 bottom-0 w-full bg-[#0e0e10] border-l border-white/[0.06] z-50 flex flex-col shadow-2xl"
          >
            {/* Header */}
            <div className="shrink-0 flex items-center justify-between px-5 py-4 border-b border-white/[0.06] bg-white/[0.01]">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-accent/15 border border-accent/20 text-accent shrink-0">
                  <Settings size={14} />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-textPrimary tracking-tight">Configure Agent</h2>
                  <p className="text-[11px] text-textMuted">ElevenLabs ConvAI · {agentName}</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => setRefreshKey(k => k + 1)} disabled={loadingConfig}
                  className="p-2 rounded-lg text-textMuted hover:text-textPrimary hover:bg-white/[0.06] transition-all">
                  <RefreshCw size={13} className={loadingConfig ? 'animate-spin' : ''} />
                </button>
                <button onClick={onClose}
                  className="p-2 rounded-lg text-textMuted hover:text-textPrimary hover:bg-white/[0.06] transition-all">
                  <X size={14} />
                </button>
              </div>
            </div>

            {/* 3-column resizable body */}
            <div className="flex-1 flex min-h-0 overflow-hidden">
              {/* Left panel */}
              <div style={{ width: leftW, minWidth: MIN, maxWidth: MAX }} className="flex flex-col shrink-0 overflow-hidden">
                <LeftPanel config={config} onChange={patch} saving={saving} saved={saved} saveError={saveError} onSave={save} loadingConfig={loadingConfig} initialExpressiveMode={expressiveMode} />
              </div>

              <ResizeDivider onDrag={dx => setLeftW(w => clamp(w + dx))} />

              {/* Voice panel */}
              <div style={{ width: midW, minWidth: MIN, maxWidth: MAX }} className="flex flex-col shrink-0 overflow-hidden">
                <VoicePanel config={config} onChange={patch} />
              </div>

              <ResizeDivider onDrag={dx => setMidW(w => clamp(w + dx))} />

              {/* Test panel — takes remaining space */}
              <div className="flex-1 min-w-[320px] overflow-hidden">
                <TestPanel agentConfig={config} onSave={save} isDirty={isDirty} />
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
