import { elevenlabsTextToSpeech } from "../../mcp/video-generator/server";
import { callResendApi, callTwilioWhatsAppApi } from "../../mcp/delivery-coordinator/server";

function log(expected: unknown, actual: unknown) {
  globalThis.qaLogExpectedActual?.({ expected, actual });
}

describe("Integration: Full delivery flow", () => {
  beforeEach(() => {
    process.env.ELEVENLABS_API_KEY = "fake";
    process.env.RESEND_API_KEY = "fake";
    process.env.RESEND_FROM_EMAIL = "reports@vantagestack.com";
    process.env.TWILIO_ACCOUNT_SID = "AC123";
    process.env.TWILIO_AUTH_TOKEN = "tok";
    process.env.TWILIO_WHATSAPP_FROM = "whatsapp:+14155238886";
  });

  test("report generated → Eleven Labs audio → email sent → WhatsApp sent", async () => {
    const fetchSpy = jest.spyOn(globalThis, "fetch" as any).mockImplementation(async (url: any, init: any) => {
      const u = String(url);
      if (u.includes("api.elevenlabs.io")) {
        return new Response(new Uint8Array([1, 2, 3, 4]), { status: 200 });
      }
      if (u.includes("api.resend.com/emails/send")) {
        return new Response(JSON.stringify({ id: "msg_123" }), { status: 200 });
      }
      if (u.includes("api.twilio.com/2010-04-01/Accounts/")) {
        return new Response(JSON.stringify({ sid: "SM123", status: "queued" }), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: true, url: u, init }), { status: 200 });
    });

    const audio = await elevenlabsTextToSpeech({
      client_id: "client_123",
      report_id: "report_123",
      script: "Hello from VantageStack.",
      voice_id: "Adam",
      model_id: "eleven_monolingual_v1",
      output_format: "mp3_44100_128",
      retries: 0,
      retry_delay_ms: 0,
    } as any);

    const email = await callResendApi({
      to: "jane@acme.example",
      subject: "Your report",
      html: "<b>Report</b>",
    } as any);

    const wa = await callTwilioWhatsAppApi({
      to_e164: "+27821234567",
      body: "Your report is ready.",
    } as any);

    log({ emailMessageId: "msg_123", waSid: "SM123" }, { emailMessageId: email.message_id, waSid: wa.message_sid, audioUrl: audio.audio_url });
    expect(audio.audio_url).toMatch(/\/reports\//);
    expect(email.message_id).toBe("msg_123");
    expect(wa.message_sid).toBe("SM123");
    expect(fetchSpy).toHaveBeenCalled();
  });
});

