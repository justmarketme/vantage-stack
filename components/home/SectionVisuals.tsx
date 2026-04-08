"use client";

import { motion } from "framer-motion";

/** ─── PROBLEM: Missed opportunities phone mockup ─────────────────────────── */
export function ProblemVisual() {
  return (
    <motion.div
      className="relative w-full rounded-3xl border border-white/10 bg-gradient-to-br from-[#0d0d12] to-[#0a0a0f] overflow-hidden p-5 shadow-[0_0_60px_rgba(239,68,68,0.07)]"
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.25 }}
      transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-[10px] uppercase tracking-[0.2em] text-textMuted/60">Right now — without a system</p>
        <span className="flex items-center gap-1 text-[10px] text-rose-400">
          <span className="h-1.5 w-1.5 rounded-full bg-rose-400 animate-pulse" />
          Live leaks
        </span>
      </div>

      {/* Notification stack */}
      <div className="space-y-2">
        {[
          {
            icon: <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4 text-rose-400 flex-shrink-0" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2 3.5A1.5 1.5 0 013.5 2h1.148a1.5 1.5 0 011.465 1.175l.716 3.223a1.5 1.5 0 01-1.052 1.767l-.933.267c-.41.117-.643.555-.48.95a11.542 11.542 0 006.254 6.254c.395.163.833-.07.95-.48l.267-.933a1.5 1.5 0 011.767-1.052l3.223.716A1.5 1.5 0 0118 15.352V16.5a1.5 1.5 0 01-1.5 1.5H15C7.82 18 2 12.18 2 5V3.5z"/></svg>,
            label: "Missed call", sub: "+27 83 421 7890 — unanswered", tag: "Revenue lost", tagColor: "text-rose-400 bg-rose-500/10 border-rose-500/20",
          },
          {
            icon: <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4 text-rose-400 flex-shrink-0" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2 3.5A1.5 1.5 0 013.5 2h1.148a1.5 1.5 0 011.465 1.175l.716 3.223a1.5 1.5 0 01-1.052 1.767l-.933.267c-.41.117-.643.555-.48.95a11.542 11.542 0 006.254 6.254c.395.163.833-.07.95-.48l.267-.933a1.5 1.5 0 011.767-1.052l3.223.716A1.5 1.5 0 0118 15.352V16.5a1.5 1.5 0 01-1.5 1.5H15C7.82 18 2 12.18 2 5V3.5z"/></svg>,
            label: "Missed call", sub: "+27 71 209 3341 — unanswered", tag: "Revenue lost", tagColor: "text-rose-400 bg-rose-500/10 border-rose-500/20",
          },
          {
            icon: <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4 text-amber-400 flex-shrink-0" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m-6.75 0h.008v.008H5.25V18zm0-3h.008v.008H5.25V15zm0-3h.008v.008H5.25V12zm0-4.5c0-.621.504-1.125 1.125-1.125h9.75c.621 0 1.125.504 1.125 1.125v15a1.125 1.125 0 01-1.125 1.125H6.375A1.125 1.125 0 015.25 22.5V7.5z"/></svg>,
            label: "Form submitted", sub: "No follow-up sent · 3 days ago", tag: "Gone cold", tagColor: "text-amber-400 bg-amber-500/10 border-amber-500/20",
          },
          {
            icon: <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4 text-amber-400 flex-shrink-0" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.76c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.076-4.076a1.526 1.526 0 011.037-.443 48.282 48.282 0 005.68-.494c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z"/></svg>,
            label: "WhatsApp enquiry", sub: "\"Are you available?\" — no reply", tag: "Gone cold", tagColor: "text-amber-400 bg-amber-500/10 border-amber-500/20",
          },
          {
            icon: <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4 text-rose-400 flex-shrink-0" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m-6.75 0h.008v.008H5.25V18zm0-3h.008v.008H5.25V15zm0-3h.008v.008H5.25V12zm0-4.5c0-.621.504-1.125 1.125-1.125h9.75c.621 0 1.125.504 1.125 1.125v15a1.125 1.125 0 01-1.125 1.125H6.375A1.125 1.125 0 015.25 22.5V7.5z"/></svg>,
            label: "Form submitted", sub: "No follow-up sent · 6 days ago", tag: "Revenue lost", tagColor: "text-rose-400 bg-rose-500/10 border-rose-500/20",
          },
        ].map((n, i) => (
          <motion.div
            key={i}
            className="flex items-center justify-between gap-3 rounded-xl border border-white/6 bg-white/[0.03] px-3 py-2.5"
            initial={{ opacity: 0, x: 16 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 + i * 0.07, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              {n.icon}
              <div className="min-w-0">
                <p className="text-xs font-medium text-white truncate">{n.label}</p>
                <p className="text-[10px] text-textMuted/70 truncate">{n.sub}</p>
              </div>
            </div>
            <span className={`flex-shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-medium ${n.tagColor}`}>
              {n.tag}
            </span>
          </motion.div>
        ))}
      </div>

      {/* Total lost footer */}
      <div className="mt-4 rounded-xl border border-rose-500/20 bg-rose-500/5 px-4 py-3 flex items-center justify-between">
        <div>
          <p className="text-[10px] text-rose-300/80 uppercase tracking-[0.16em]">Estimated revenue lost this week</p>
          <p className="text-xl font-bold text-rose-300 mt-0.5">R 24 000+</p>
        </div>
        <svg viewBox="0 0 24 24" fill="none" className="h-8 w-8 text-rose-400/40" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
        </svg>
      </div>

      {/* Decorative glow */}
      <div className="pointer-events-none absolute -bottom-12 -right-12 h-40 w-40 rounded-full bg-rose-500/10 blur-3xl" />
    </motion.div>
  );
}

/** ─── SOLUTION: Connected system dashboard mockup ───────────────────────── */
export function SolutionVisual() {
  return (
    <motion.div
      className="relative w-full rounded-3xl border border-sky-500/20 bg-gradient-to-br from-[#0d0d12] to-[#070a10] overflow-hidden p-5 shadow-[0_0_60px_rgba(59,130,246,0.08)]"
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.25 }}
      transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="flex items-center justify-between mb-4">
        <p className="text-[10px] uppercase tracking-[0.2em] text-textMuted/60">With VantageStack — everything connected</p>
        <span className="flex items-center gap-1 text-[10px] text-emerald-400">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
          All systems live
        </span>
      </div>

      {/* System layers */}
      <div className="space-y-1.5">
        {[
          {
            icon: <svg viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5" stroke="currentColor" strokeWidth={1.5}><circle cx="10" cy="10" r="7.5"/><path d="M10 2.5C10 2.5 7.5 6 7.5 10s2.5 7.5 2.5 7.5M10 2.5C10 2.5 12.5 6 12.5 10s-2.5 7.5-2.5 7.5M2.5 10h15"/></svg>,
            label: "Website", status: "Converting visitors", pct: 74, bar: "bg-sky-500", statusColor: "text-emerald-300",
          },
          {
            icon: <svg viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2 3.5A1.5 1.5 0 013.5 2h1.148a1.5 1.5 0 011.465 1.175l.716 3.223a1.5 1.5 0 01-1.052 1.767l-.933.267c-.41.117-.643.555-.48.95a11.542 11.542 0 006.254 6.254c.395.163.833-.07.95-.48l.267-.933a1.5 1.5 0 011.767-1.052l3.223.716A1.5 1.5 0 0118 15.352V16.5a1.5 1.5 0 01-1.5 1.5H15C7.82 18 2 12.18 2 5V3.5z"/></svg>,
            label: "AI Call Assistant — Human voice, multilingual", status: "0 missed calls today", pct: 100, bar: "bg-emerald-500", statusColor: "text-emerald-300",
          },
          {
            icon: <svg viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v-8.25M12 17.25v-4.5M8.25 17.25v-6M4.5 17.25v-2.25M3 7.5l4.5-4.5 4.5 4.5 4.5-4.5"/></svg>,
            label: "Lead Capture", status: "12 leads captured", pct: 88, bar: "bg-sky-400", statusColor: "text-sky-300",
          },
          {
            icon: <svg viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 3.75H6.912a2.25 2.25 0 00-2.15 1.588L2.35 13.177a2.25 2.25 0 00-.1.661V18a1.5 1.5 0 001.5 1.5h16.5A1.5 1.5 0 0021.75 18v-4.162c0-.224-.034-.447-.1-.661L19.24 5.338a2.25 2.25 0 00-2.15-1.588H15M2.25 13.5h3.86a2.25 2.25 0 012.012 1.244l.256.512a2.25 2.25 0 002.013 1.244h3.218a2.25 2.25 0 002.013-1.244l.256-.512a2.25 2.25 0 012.013-1.244h3.859M12 3v8.25m0 0l-3-3m3 3l3-3"/></svg>,
            label: "Auto Follow-up", status: "Sent in < 60 seconds", pct: 100, bar: "bg-emerald-400", statusColor: "text-emerald-300",
          },
          {
            icon: <svg viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h12M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-12m12-13.5V3M9 7.5h.008v.008H9V7.5zm0 3h.008v.008H9V10.5zm0 3h.008v.008H9V13.5zm3-6h.008v.008H12V7.5zm0 3h.008v.008H12V10.5zm0 3h.008v.008H12V13.5zm3-6h.008v.008H15V7.5zm0 3h.008v.008H15V10.5z"/></svg>,
            label: "CRM Pipeline", status: "R 186k in pipeline", pct: 65, bar: "bg-sky-500", statusColor: "text-sky-300",
          },
        ].map((item, i) => (
          <motion.div
            key={item.label}
            className="rounded-xl border border-white/6 bg-white/[0.03] px-3 py-2.5"
            initial={{ opacity: 0, x: -12 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 + i * 0.07, duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2 text-textMuted/60">
                {item.icon}
                <p className="text-xs font-medium text-white">{item.label}</p>
              </div>
              <p className={`text-[10px] ${item.statusColor}`}>{item.status}</p>
            </div>
            <div className="h-1 rounded-full bg-white/5 overflow-hidden">
              <motion.div
                className={`h-full rounded-full ${item.bar}`}
                initial={{ width: 0 }}
                whileInView={{ width: `${item.pct}%` }}
                viewport={{ once: true }}
                transition={{ duration: 1, delay: 0.3 + i * 0.07, ease: [0.16, 1, 0.3, 1] }}
              />
            </div>
          </motion.div>
        ))}
      </div>

      {/* Revenue meter */}
      <div className="mt-4 rounded-xl border border-emerald-500/25 bg-emerald-500/5 px-4 py-3 flex items-center justify-between">
        <div>
          <p className="text-[10px] text-emerald-300/80 uppercase tracking-[0.16em]">Revenue this month</p>
          <p className="text-xl font-bold text-emerald-300 mt-0.5">R 87 400</p>
        </div>
        <svg viewBox="0 0 24 24" fill="none" className="h-8 w-8 text-emerald-400/40" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
        </svg>
      </div>

      <div className="pointer-events-none absolute -top-10 -right-10 h-40 w-40 rounded-full bg-sky-500/8 blur-3xl" />
    </motion.div>
  );
}

/** ─── REVENUE SYSTEM: Live pipeline tracker mockup ─────────────────────── */
export function RevenueSystemVisual() {
  return (
    <motion.div
      className="relative w-full rounded-3xl border border-white/10 bg-gradient-to-br from-[#0d0d12] to-[#080b10] overflow-hidden p-5"
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.25 }}
      transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="flex items-center justify-between mb-4">
        <p className="text-[10px] uppercase tracking-[0.2em] text-textMuted/60">Live pipeline — today</p>
        <span className="flex items-center gap-1 text-[10px] text-sky-400">
          <span className="h-1.5 w-1.5 rounded-full bg-sky-400 animate-pulse" />
          Autopilot on
        </span>
      </div>

      {/* Pipeline stages */}
      <div className="grid grid-cols-4 gap-2 mb-4">
        {[
          { stage: "Captured", count: 24, color: "border-sky-500/30 bg-sky-500/8", num: "text-sky-300" },
          { stage: "Qualified", count: 18, color: "border-sky-500/20 bg-sky-500/5", num: "text-sky-200" },
          { stage: "Booked", count: 11, color: "border-emerald-500/30 bg-emerald-500/8", num: "text-emerald-300" },
          { stage: "Closed", count: 7, color: "border-emerald-400/40 bg-emerald-500/10", num: "text-emerald-200" },
        ].map((s, i) => (
          <motion.div
            key={s.stage}
            className={`rounded-xl border px-2 py-3 text-center ${s.color}`}
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 + i * 0.08, duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          >
            <p className={`text-lg font-bold ${s.num}`}>{s.count}</p>
            <p className="text-[9px] text-textMuted/70 mt-0.5">{s.stage}</p>
          </motion.div>
        ))}
      </div>

      {/* Recent activity feed */}
      <p className="text-[10px] uppercase tracking-[0.18em] text-textMuted/50 mb-2">Recent activity</p>
      <div className="space-y-1.5">
        {[
          { time: "2 min ago", action: "AI answered call from +27 82 *** ****", dot: "bg-emerald-400" },
          { time: "14 min ago", action: "Follow-up SMS sent to Sipho M.", dot: "bg-sky-400" },
          { time: "31 min ago", action: "Appointment booked — Thursday 10:30", dot: "bg-emerald-400" },
          { time: "1 hr ago", action: "New lead qualified — Budget: R15k/mo", dot: "bg-sky-300" },
        ].map((item, i) => (
          <motion.div
            key={i}
            className="flex items-center gap-2.5 text-[10px]"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.3 + i * 0.06 }}
          >
            <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${item.dot}`} />
            <span className="text-textMuted/90 flex-1 truncate">{item.action}</span>
            <span className="text-textMuted/40 flex-shrink-0">{item.time}</span>
          </motion.div>
        ))}
      </div>

      <div className="pointer-events-none absolute -bottom-10 -right-10 h-40 w-40 rounded-full bg-emerald-500/6 blur-3xl" />
    </motion.div>
  );
}

/** ─── SA: Local context visual ──────────────────────────────────────────── */
export function SouthAfricaVisual() {
  return (
    <motion.div
      className="relative w-full rounded-3xl border border-white/10 bg-gradient-to-br from-[#0d0d12] to-[#090c10] overflow-hidden p-5"
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.25 }}
      transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
    >
      <p className="text-[10px] uppercase tracking-[0.2em] text-textMuted/60 mb-4">What we build for</p>

      <div className="grid grid-cols-2 gap-3">
        {[
          {
            icon: <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4 text-sky-400" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z"/></svg>,
            title: "Fast on any connection", body: "Loads in under 2 seconds even on 3G.",
          },
          {
            icon: <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4 text-sky-400" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z"/></svg>,
            title: "SA buying behaviour", body: "Built around how local buyers decide.",
          },
          {
            icon: <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4 text-sky-400" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z"/></svg>,
            title: "WhatsApp-first", body: "Your clients prefer WhatsApp. So do we.",
          },
          {
            icon: <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4 text-sky-400" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>,
            title: "Local pricing", body: "No inflated overseas rates. Ever.",
          },
        ].map((item, i) => (
          <motion.div
            key={item.title}
            className="rounded-2xl border border-white/8 bg-white/[0.03] p-3"
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 + i * 0.08, duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="mb-2">{item.icon}</div>
            <p className="text-xs font-medium text-white mb-1">{item.title}</p>
            <p className="text-[10px] text-textMuted/70 leading-relaxed">{item.body}</p>
          </motion.div>
        ))}
      </div>

      <div className="mt-4 rounded-xl border border-sky-500/15 bg-sky-500/5 px-4 py-3">
        <p className="text-[10px] text-sky-300/80 uppercase tracking-[0.16em] mb-1">Our promise</p>
        <p className="text-xs text-white/80 leading-relaxed">
          "We don't guess what works in South Africa. We live here, we work here, and we build for here."
        </p>
      </div>

      <div className="pointer-events-none absolute -top-10 -left-10 h-36 w-36 rounded-full bg-sky-500/6 blur-3xl" />
    </motion.div>
  );
}
