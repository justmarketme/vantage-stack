#!/bin/bash

ELEVENLABS_API_KEY="d6eaa383c192531a3ffb01a4c18c304560c9d4a105866cbe3ffdd6ce468dd50f"
ELEVENLABS_VOICE_ID="TTY70JqFvDxeExufZ1za"

echo "Adding NEXT_PUBLIC_ELEVEN_LABS_API_KEY (with correct naming)..."
echo "$ELEVENLABS_API_KEY" | npx vercel env add NEXT_PUBLIC_ELEVEN_LABS_API_KEY production --non-interactive

echo "Adding NEXT_PUBLIC_ELEVENLABS_VOICE_ID..."
echo "$ELEVENLABS_VOICE_ID" | npx vercel env add NEXT_PUBLIC_ELEVENLABS_VOICE_ID production --non-interactive

echo ""
echo "✅ Verifying all ElevenLabs variables..."
npx vercel env ls production | grep -i eleven
