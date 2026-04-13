#!/bin/bash

ELEVENLABS_API_KEY=$(grep "^NEXT_PUBLIC_ELEVENLABS_API_KEY=" .env.production.local | cut -d'"' -f2 | sed 's/\n$//')
ELEVENLABS_VOICE_ID=$(grep "^NEXT_PUBLIC_ELEVENLABS_VOICE_ID=" .env.production.local | cut -d'"' -f2 | sed 's/\n$//')

echo "Adding NEXT_PUBLIC_ELEVENLABS_API_KEY..."
echo "$ELEVENLABS_API_KEY" | npx vercel env add NEXT_PUBLIC_ELEVENLABS_API_KEY production --non-interactive

echo "Adding NEXT_PUBLIC_ELEVENLABS_VOICE_ID..."
echo "$ELEVENLABS_VOICE_ID" | npx vercel env add NEXT_PUBLIC_ELEVENLABS_VOICE_ID production --non-interactive
