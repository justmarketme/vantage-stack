import { ApiClientError } from "../../../../lib/consultant/client/api";
import { VOICE_ERRORS, voiceErrorKey, voiceErrorMessage } from "../../../../lib/consultant/client/voiceErrors";

const dom = (name: string) => Object.assign(new Error("x"), { name });
const tw = (code: number) => Object.assign(new Error("twilio"), { code });

describe("voiceErrorMessage", () => {
  it.each([
    [dom("NotAllowedError"), "micDenied"],
    [dom("NotFoundError"), "micMissing"],
    [dom("NotReadableError"), "micBusy"],
    [tw(31401), "micDenied"],
    [tw(31402), "micMissing"],
    [tw(20104), "token"],
    [tw(31205), "token"],
    [tw(31005), "network"],
    [tw(53405), "network"],
    [new ApiClientError(503, "Voice is not configured"), "notConfigured"],
    [new ApiClientError(0, "offline"), "offline"],
    [new ApiClientError(409, "live"), "alreadyLive"],
    [new ApiClientError(403, "no"), "forbidden"],
    [new ApiClientError(429, "slow"), "rateLimited"],
    [new Error("???"), "generic"],
    [undefined, "generic"],
  ])("%p → %s", (err, key) => {
    expect(voiceErrorKey(err)).toBe(key);
    expect(voiceErrorMessage(err)).toBe(VOICE_ERRORS[key as keyof typeof VOICE_ERRORS]);
  });
});
