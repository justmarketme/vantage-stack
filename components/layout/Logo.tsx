"use client";

import { motion } from "framer-motion";

export function Logo() {
  return (
    <div className="flex items-center gap-3 py-1">
      {/* Icon */}
      <div className="relative flex h-10 w-10 items-center justify-center">
        <motion.div
          initial={{ rotate: -15, scale: 0.8, opacity: 0 }}
          animate={{ rotate: 0, scale: 1, opacity: 1 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className="relative h-10 w-10"
        >
          {/* Main "V" Structure */}
          <svg
            viewBox="0 0 40 40"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="h-full w-full drop-shadow-[0_0_8px_rgba(59,130,246,0.3)]"
          >
            {/* Outer V */}
            <path
              d="M8 10L20 32L32 10"
              stroke="white"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {/* Inner Accented V */}
            <path
              d="M13 14L20 27L27 14"
              stroke="#60a5fa"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity="0.8"
            />
            {/* Growth Vector Line */}
            <motion.path
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ delay: 0.5, duration: 1 }}
              d="M14 22L19 12L25 18L32 6"
              stroke="#3b82f6"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {/* Arrowhead */}
            <path
              d="M28 6H32V10"
              stroke="#3b82f6"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {/* Connectors / Nodes */}
            <circle cx="14" cy="22" r="2" fill="white" />
            <circle cx="19" cy="12" r="2" fill="#60a5fa" />
            <circle cx="25" cy="18" r="2" fill="white" />
          </svg>
          
          {/* Subtle Glow Background */}
          <div className="absolute inset-0 -z-10 bg-blue-500/15 blur-xl rounded-full" />
        </motion.div>
      </div>

      {/* Brand Text */}
      <div className="flex flex-col">
        <motion.div
          initial={{ x: -10, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.6 }}
          className="flex items-baseline gap-0.5"
        >
          <span className="font-heading text-xl font-bold tracking-tight text-white leading-tight">
            Vantage
          </span>
          <span className="font-heading text-xl font-bold tracking-tight text-blue-400 leading-tight">
            Stack
          </span>
        </motion.div>
        <motion.span
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.7 }}
          transition={{ delay: 0.4, duration: 0.8 }}
          className="text-[9px] font-medium uppercase tracking-[0.2em] text-blue-100/60 leading-tight"
        >
          Business Revenue Systems
        </motion.span>
      </div>
    </div>
  );
}
