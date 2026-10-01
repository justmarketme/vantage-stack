/**
 * Per-device UI preferences (Zustand + persist, `vs:consultant:v2:prefs`).
 *
 * Only harmless switches live here — never customer data. The Coach Alex
 * audio "I'm wearing a headset" confirmation is deliberately NOT persisted:
 * it's true for this sitting only, because a cue spoken through laptop
 * speakers could be picked up by the microphone and heard by the clinic.
 */

import { createStore } from "zustand/vanilla";
import { persist } from "zustand/middleware";
import { kvPersistStorage, persistName, type PersistedStoreApi } from "./persist";

export const PREFS_PERSIST_NAME = persistName("prefs");
export const PREFS_PERSIST_VERSION = 1;

export type PrefsState = {
  /** Coach Alex spoken cues (off by default). */
  coachAudio: boolean;
  setCoachAudio: (on: boolean) => void;
};
type PersistedPrefs = { coachAudio: boolean };

export const prefsStore: PersistedStoreApi<PrefsState, PersistedPrefs> = createStore<PrefsState>()(
  persist<PrefsState, [], [], PersistedPrefs>(
    (set) => ({
      coachAudio: false,
      setCoachAudio: (on) => set({ coachAudio: on }),
    }),
    {
      name: PREFS_PERSIST_NAME,
      version: PREFS_PERSIST_VERSION,
      storage: kvPersistStorage<PersistedPrefs>(),
      partialize: (s) => ({ coachAudio: s.coachAudio }),
      merge: (persisted, current) => ({
        ...current,
        coachAudio: (persisted as PersistedPrefs | undefined)?.coachAudio === true,
      }),
    },
  ),
);
