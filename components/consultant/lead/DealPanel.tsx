"use client";

import { useId, useRef, useState, type ReactNode } from "react";
import { BadgeCheck, FileText, Paperclip } from "lucide-react";
import { api } from "../../../lib/consultant/client/api";
import { formatSastDate, formatZar } from "../../../lib/consultant/client/format";
import { PaymentConfirmInput, type Deal, type DealStatus, type Lead } from "../../../lib/consultant/types";
import { useMe } from "../MeProvider";
import { INPUT_CLASS } from "../MicField";
import { Sheet } from "../Sheet";
import { Button, SURFACE } from "../ui";
import { cx, describeError, FOCUS } from "../utils";
import { useUpload } from "../../../hooks/consultant/useUpload";
import { invalidateQueries, UPLOAD_TYPES } from "../wave2/data";
import { can, Chip, pct, type ChipTone } from "../wave2/parts";
import { SastDateTimeField, sastDateKey, sastToIso, type SastParts } from "../wave2/SastDateTime";

const STATUS: Record<DealStatus, { label: string; tone: ChipTone }> = {
  draft: { label: "Draft", tone: "neutral" },
  sent: { label: "Proposal sent", tone: "neutral" },
  accepted: { label: "Won — awaiting payment", tone: "info" },
  paid: { label: "Paid", tone: "progress" },
  lost: { label: "Lost", tone: "neutral" },
};

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <dt className="text-sm text-[--cp-muted]">{label}</dt>
      <dd className="text-right text-sm tabular-nums text-[--cp-text]">{children}</dd>
    </div>
  );
}

/**
 * The deal: value, won, payment status and commission. A sale only counts when
 * it is PAID; a manager with `confirm_payments` confirms it with proof.
 */
export function DealPanel({ lead }: { lead: Lead }) {
  const { me } = useMe();
  const [open, setOpen] = useState(false);
  const deal = lead.deal;
  if (deal === undefined) return null; // the API didn't include deal data

  const mayConfirm = can(me, "confirm_payments") && !!deal && deal.status !== "paid" && deal.status !== "lost";

  return (
    <section aria-labelledby="deal-h" className={cx(SURFACE, "p-4")}>
      <div className="flex items-center justify-between gap-3">
        <h2 id="deal-h" className="text-xs font-medium uppercase tracking-[0.12em] text-[--cp-muted]">
          Deal
        </h2>
        {deal && <Chip tone={STATUS[deal.status].tone}>{STATUS[deal.status].label}</Chip>}
      </div>

      {!deal ? (
        <p className="mt-2 text-sm text-[--cp-muted]">No deal yet. Set the monthly value when you send the proposal.</p>
      ) : (
        <>
          <dl className="mt-2 divide-y divide-[--cp-border]">
            <Row label="Sale value">{deal.saleValue != null ? formatZar(deal.saleValue) : "—"}</Row>
            {deal.wonAt && <Row label="Won">{formatSastDate(deal.wonAt)}</Row>}
            {deal.status === "paid" && (
              <>
                <Row label="Paid">
                  {deal.paymentAmount != null ? formatZar(deal.paymentAmount) : "—"}
                  {deal.paidAt ? ` · ${formatSastDate(deal.paidAt)}` : ""}
                </Row>
                {deal.paymentReference && <Row label="Reference">{deal.paymentReference}</Row>}
                {deal.confirmedByName && <Row label="Confirmed by">{deal.confirmedByName}</Row>}
                <Row label="Commission">
                  <span className="text-[--cp-progress]">{deal.commissionAmount != null ? formatZar(deal.commissionAmount) : "—"}</span>
                  {deal.commissionRate != null && <span className="text-[--cp-muted]"> ({pct(deal.commissionRate)})</span>}
                </Row>
              </>
            )}
          </dl>
          {deal.hasProof && (
            <a
              href={api.deals.proofUrl(lead.id)}
              target="_blank"
              rel="noopener noreferrer"
              className={cx("mt-2 inline-flex min-h-11 items-center gap-1.5 text-sm text-[--cp-accent-text] underline-offset-2 hover:underline", FOCUS)}
            >
              <FileText size={15} aria-hidden /> View proof of payment
            </a>
          )}
          {deal.status === "accepted" && !mayConfirm && (
            <p className="mt-2 text-xs text-[--cp-muted]">A manager confirms payment once the clinic has paid — then it counts toward your numbers.</p>
          )}
          {mayConfirm && (
            <Button variant="primary" className="mt-3 w-full" onClick={() => setOpen(true)}>
              <BadgeCheck size={16} aria-hidden /> Confirm payment
            </Button>
          )}
        </>
      )}

      {deal && mayConfirm && (
        <ConfirmPaymentSheet open={open} lead={lead} deal={deal} onClose={() => setOpen(false)} />
      )}
    </section>
  );
}

function ConfirmPaymentSheet({ open, lead, deal, onClose }: { open: boolean; lead: Lead; deal: Deal; onClose: () => void }) {
  const ids = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const up = useUpload();
  const [amount, setAmount] = useState(deal.saleValue != null ? String(deal.saleValue) : "");
  const [reference, setReference] = useState("");
  const [paidOn, setPaidOn] = useState<SastParts>({ date: sastDateKey(0), time: "12:00" });
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  const submit = async () => {
    setError(null);
    const paidAt = sastToIso(paidOn);
    const draft = {
      amount: Number(amount),
      reference,
      paidAt: paidAt ?? "",
      note: note.trim() || undefined,
    };
    const check = PaymentConfirmInput.safeParse(draft);
    if (!check.success) {
      const f: Record<string, string> = {};
      for (const i of check.error.issues) f[String(i.path[0])] ??= i.message;
      if (f.amount) f.amount = "Enter the amount received in rand.";
      if (f.reference) f.reference = "Enter the payment reference.";
      if (f.paidAt) f.paidAt = "Pick the date it was paid.";
      setFields(f);
      return;
    }
    setFields({});
    setSaving(true);
    try {
      let proofPath: string | undefined;
      if (file) {
        const path = await up.upload(file, "payment_proof");
        if (!path) return; // cancelled
        proofPath = path;
      }
      await api.deals.confirmPayment(lead.id, { ...check.data, proofPath });
      void invalidateQueries(`lead:${lead.id}`);
      void invalidateQueries("leads:");
      void invalidateQueries("metrics:");
      void invalidateQueries("rewards:");
      onClose();
    } catch (e) {
      setError(describeError(e, "save"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      open={open}
      title="Confirm payment"
      onClose={onClose}
      footer={
        <div className="space-y-2">
          <div aria-live="assertive">
            {error && (
              <p role="alert" className="text-sm text-[--cp-risk]">
                {error}
              </p>
            )}
          </div>
          <Button variant="primary" size="lg" className="w-full" disabled={saving} onClick={() => void submit()}>
            {up.uploading ? `Uploading proof… ${Math.round(up.progress * 100)}%` : saving ? "Confirming…" : "Confirm payment received"}
          </Button>
        </div>
      }
    >
      <p className="mb-4 text-sm text-[--cp-muted]">
        {lead.clinicName}. Commission is calculated on the amount received and fixed once confirmed. The lead moves to Paid.
      </p>
      <div className="space-y-4">
        <div>
          <label htmlFor={`${ids}-amt`} className="mb-1.5 block text-sm font-medium text-[--cp-text]">
            Amount received (R)
          </label>
          <input
            id={`${ids}-amt`}
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ""))}
            aria-invalid={!!fields.amount}
            aria-describedby={fields.amount ? `${ids}-amt-e` : `${ids}-amt-h`}
            className={cx(INPUT_CLASS, fields.amount ? "border-[--cp-risk]" : "border-[--cp-border]")}
          />
          {fields.amount ? (
            <p id={`${ids}-amt-e`} className="mt-1 text-sm text-[--cp-risk]">
              {fields.amount}
            </p>
          ) : (
            <p id={`${ids}-amt-h`} className="mt-1 text-xs text-[--cp-muted]">
              {amount ? formatZar(Number(amount)) : "Whole rand"}
            </p>
          )}
        </div>
        <div>
          <label htmlFor={`${ids}-ref`} className="mb-1.5 block text-sm font-medium text-[--cp-text]">
            Payment reference
          </label>
          <input
            id={`${ids}-ref`}
            value={reference}
            maxLength={120}
            onChange={(e) => setReference(e.target.value)}
            aria-invalid={!!fields.reference}
            className={cx(INPUT_CLASS, fields.reference ? "border-[--cp-risk]" : "border-[--cp-border]")}
          />
          {fields.reference && <p className="mt-1 text-sm text-[--cp-risk]">{fields.reference}</p>}
        </div>
        <SastDateTimeField label="Paid on" value={paidOn} onChange={setPaidOn} showTime={false} error={fields.paidAt} />
        <div>
          <p className="mb-1.5 text-sm font-medium text-[--cp-text]">Proof of payment (optional)</p>
          <input
            ref={fileRef}
            id={`${ids}-file`}
            type="file"
            accept={UPLOAD_TYPES.join(",")}
            className="sr-only"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <label
            htmlFor={`${ids}-file`}
            className={cx(
              "flex min-h-12 cursor-pointer items-center gap-2 rounded-xl border border-dashed border-[--cp-border-strong] px-3 text-sm",
              file ? "text-[--cp-text]" : "text-[--cp-muted]",
            )}
          >
            <Paperclip size={16} aria-hidden />
            <span className="min-w-0 flex-1 truncate">{file ? file.name : "Attach a PDF or photo (max 5 MB)"}</span>
          </label>
          {file && (
            <button type="button" className={cx("mt-1 min-h-11 text-sm text-[--cp-muted] hover:text-[--cp-text]", FOCUS)} onClick={() => { setFile(null); if (fileRef.current) fileRef.current.value = ""; }}>
              Remove file
            </button>
          )}
        </div>
        <div>
          <label htmlFor={`${ids}-note`} className="mb-1.5 block text-sm font-medium text-[--cp-text]">
            Note (optional)
          </label>
          <input id={`${ids}-note`} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} className={cx(INPUT_CLASS, "border-[--cp-border]")} />
        </div>
      </div>
    </Sheet>
  );
}
