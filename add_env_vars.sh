#!/bin/bash

# Extract values from .env.production.local
ELEVENLABS_API_KEY=$(grep "^ELEVENLABS_API_KEY=" .env.production.local | cut -d'"' -f2 | sed 's/\n$//')
ELEVENLABS_VOICE_ID=$(grep "^ELEVENLABS_VOICE_ID=" .env.production.local | cut -d'"' -f2 | sed 's/\n$//')
NEXT_PUBLIC_ELEVENLABS_AGENT_ID=$(grep "^NEXT_PUBLIC_ELEVENLABS_AGENT_ID=" .env.production.local | cut -d'"' -f2 | sed 's/\n$//')

# Add each variable to Vercel production
echo "Adding ELEVENLABS_API_KEY..."
echo "$ELEVENLABS_API_KEY" | npx vercel env add ELEVENLABS_API_KEY production --non-interactive

echo "Adding ELEVENLABS_VOICE_ID..."
echo "$ELEVENLABS_VOICE_ID" | npx vercel env add ELEVENLABS_VOICE_ID production --non-interactive

echo "Adding NEXT_PUBLIC_ELEVENLABS_AGENT_ID..."
echo "$NEXT_PUBLIC_ELEVENLABS_AGENT_ID" | npx vercel env add NEXT_PUBLIC_ELEVENLABS_AGENT_ID production --non-interactive
