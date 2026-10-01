import { ApiClientError } from "../../../../lib/consultant/client/api";
import {
  MAX_UPLOAD_BYTES,
  UPLOAD_MESSAGES,
  fitWithin,
  prepareUpload,
  putWithProgress,
} from "../../../../lib/consultant/client/upload";

describe("upload helpers", () => {
  it("fitWithin keeps aspect, caps the long edge at 1600 and never upscales", () => {
    expect(fitWithin(4032, 3024)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(3024, 4032)).toEqual({ width: 1200, height: 1600 });
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
    expect(fitWithin(0, 10)).toEqual({ width: 0, height: 0 });
  });

  it("prepareUpload passes PDFs through and builds the ticket request", async () => {
    const pdf = new Blob(["%PDF-1.4 proof"], { type: "application/pdf" });
    const { body, request } = await prepareUpload(pdf, "payment_proof");
    expect(body).toBe(pdf);
    expect(request).toEqual({ purpose: "payment_proof", contentType: "application/pdf", bytes: pdf.size });
  });

  it("rejects unsupported types and files over 5 MB with user-safe messages", async () => {
    await expect(prepareUpload(new Blob(["x"], { type: "text/plain" }), "goal_image")).rejects.toMatchObject({ error: UPLOAD_MESSAGES.type });
    const big = new Blob([new Uint8Array(MAX_UPLOAD_BYTES + 1)], { type: "application/pdf" });
    await expect(prepareUpload(big, "payment_proof")).rejects.toMatchObject({ status: 413, error: UPLOAD_MESSAGES.size });
  });
});

describe("putWithProgress", () => {
  type Handler = ((e?: unknown) => void) | null;
  class FakeXHR {
    static last: FakeXHR;
    method = "";
    url = "";
    headers: Record<string, string> = {};
    status = 0;
    timeout = 0;
    body: unknown;
    upload: { onprogress: Handler } = { onprogress: null };
    onload: Handler = null;
    onerror: Handler = null;
    ontimeout: Handler = null;
    onabort: Handler = null;
    constructor() {
      FakeXHR.last = this;
    }
    open(m: string, u: string) {
      this.method = m;
      this.url = u;
    }
    setRequestHeader(k: string, v: string) {
      this.headers[k] = v;
    }
    send(b: unknown) {
      this.body = b;
    }
    abort() {
      this.onabort?.();
    }
  }
  const g = globalThis as unknown as { XMLHttpRequest?: unknown };
  const real = g.XMLHttpRequest;
  beforeEach(() => {
    g.XMLHttpRequest = FakeXHR;
  });
  afterEach(() => {
    g.XMLHttpRequest = real;
  });

  it("PUTs the raw bytes with the content type and reports progress", async () => {
    const seen: number[] = [];
    const blob = new Blob(["abc"], { type: "image/webp" });
    const p = putWithProgress("https://x.supabase.co/storage/v1/object/upload/sign/b/p?token=secret", blob, "image/webp", (f) => seen.push(f));
    const x = FakeXHR.last;
    expect(x.method).toBe("PUT");
    expect(x.headers["Content-Type"]).toBe("image/webp");
    expect(x.body).toBe(blob);
    x.upload.onprogress?.({ lengthComputable: true, loaded: 1, total: 2 });
    x.status = 200;
    x.onload?.();
    await p;
    expect(seen).toEqual([0.5, 1]);
  });

  it("errors never echo the signed URL (it holds a token)", async () => {
    const p = putWithProgress("https://x/sign?token=SECRET", new Blob(["a"]), "image/jpeg");
    FakeXHR.last.status = 403;
    FakeXHR.last.onload?.();
    const err = await p.catch((e) => e);
    expect(err).toBeInstanceOf(ApiClientError);
    expect(err.error).toBe(UPLOAD_MESSAGES.expired);
    expect(JSON.stringify(err) + String(err.message)).not.toMatch(/SECRET/);

    const p2 = putWithProgress("https://x/sign?token=SECRET", new Blob(["a"]), "image/jpeg");
    FakeXHR.last.onerror?.();
    await expect(p2).rejects.toMatchObject({ status: 0, error: UPLOAD_MESSAGES.failed });
  });

  it("aborts via AbortSignal", async () => {
    const ctrl = new AbortController();
    const p = putWithProgress("https://x", new Blob(["a"]), "image/jpeg", undefined, ctrl.signal);
    ctrl.abort();
    await expect(p).rejects.toMatchObject({ name: "AbortError" });
  });
});
