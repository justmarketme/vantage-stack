"use client";

import { useState, type FormEvent } from "react";
import { Ban, Check, UserCheck, UserX } from "lucide-react";
import type { Appointment, AppointmentStatus, Patient } from "@/lib/clinic-crm/types";
import { api } from "@/lib/clinic-crm/client/api";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Disclosure } from "../ui/Disclosure";
import { Drawer } from "../ui/Drawer";
import { Input } from "../ui/Input";
import { Select } from "../ui/Select";
import { useToast } from "@/components/clinic-crm/providers/ToastProvider";
import { PatientPicker } from "./PatientPicker";
import { errorMessage, fieldErrors } from "./errors";
import { STATUS, fmtLongDay, fmtTime, toDateInput } from "./format";

const DURATIONS = [15, 20, 30, 45, 60, 90].map((m) => ({ value: String(m), label: `${m} minutes` }));

/** Local date + time inputs → ISO instant the API accepts. */
const toIso = (date: string, time: string) => new Date(`${date}T${time}`).toISOString();

export function NewAppointmentDrawer({
  open,
  onClose,
  onCreated,
  defaultDate,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  defaultDate: Date;
}) {
  const { show: toast } = useToast();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [date, setDate] = useState(toDateInput(defaultDate));
  const [time, setTime] = useState("09:00");
  const [duration, setDuration] = useState("30");
  const [practitioner, setPractitioner] = useState("");
  const [service, setService] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!patient) {
      setErrors({ patientId: "Choose a patient" });
      return;
    }
    setPending(true);
    setErrors({});
    try {
      await api.appointments.create({
        patientId: patient.id,
        startsAt: toIso(date, time),
        durationMin: Number(duration),
        practitioner,
        service,
      });
      toast("Booked — reminder scheduled", "success");
      setPatient(null);
      setPractitioner("");
      setService("");
      onCreated();
    } catch (err) {
      setErrors(fieldErrors(err));
      toast(errorMessage(err, "Couldn't book the appointment."), "error");
    } finally {
      setPending(false);
    }
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="New appointment"
      description="The patient gets an automatic reminder before their visit."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="cc-new-appt" loading={pending}>
            Book appointment
          </Button>
        </>
      }
    >
      <form id="cc-new-appt" onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <PatientPicker value={patient} onChange={setPatient} error={errors.patientId} />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          <Input label="Time" type="time" step={300} value={time} onChange={(e) => setTime(e.target.value)} required error={errors.startsAt} />
        </div>
        <Select label="Length" options={DURATIONS} value={duration} onChange={(e) => setDuration(e.target.value)} />
        <Disclosure>
          <Input label="Practitioner" value={practitioner} onChange={(e) => setPractitioner(e.target.value)} error={errors.practitioner} />
          <Input label="Service" placeholder="e.g. Check-up & clean" value={service} onChange={(e) => setService(e.target.value)} error={errors.service} />
        </Disclosure>
      </form>
    </Drawer>
  );
}

const ACTIONS: { status: AppointmentStatus; label: string; Icon: typeof Check }[] = [
  { status: "confirmed", label: "Confirmed", Icon: Check },
  { status: "attended", label: "Attended", Icon: UserCheck },
  { status: "no_show", label: "No-show", Icon: UserX },
  { status: "cancelled", label: "Cancel visit", Icon: Ban },
];

export function AppointmentDrawer({
  appt,
  onClose,
  onChanged,
}: {
  appt: Appointment | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  return (
    <Drawer open={appt !== null} onClose={onClose} title={appt?.patientName ?? "Appointment"} description={appt ? `${fmtLongDay(new Date(appt.startsAt))} · ${fmtTime(appt.startsAt)}` : undefined}>
      {appt && <AppointmentDetail key={appt.id} appt={appt} onChanged={onChanged} />}
    </Drawer>
  );
}

function AppointmentDetail({ appt, onChanged }: { appt: Appointment; onChanged: () => void }) {
  const { show: toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const start = new Date(appt.startsAt);
  const [date, setDate] = useState(toDateInput(start));
  const [time, setTime] = useState(fmtTime(appt.startsAt));

  const patch = async (key: string, body: Parameters<typeof api.appointments.update>[1], done: string) => {
    setBusy(key);
    try {
      await api.appointments.update(appt.id, body);
      toast(done, "success");
      onChanged();
    } catch (e) {
      toast(errorMessage(e, "Couldn't update the appointment."), "error");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
        <dt className="cc-muted">Status</dt>
        <dd>
          <Badge tone={STATUS[appt.status].tone}>{STATUS[appt.status].label}</Badge>
        </dd>
        <dt className="cc-muted">Length</dt>
        <dd>{appt.durationMin} minutes</dd>
        {appt.service && (
          <>
            <dt className="cc-muted">Service</dt>
            <dd>{appt.service}</dd>
          </>
        )}
        {appt.practitioner && (
          <>
            <dt className="cc-muted">With</dt>
            <dd>{appt.practitioner}</dd>
          </>
        )}
      </dl>

      <div>
        <h3 className="mb-2 text-sm font-semibold">Update status</h3>
        <div className="grid grid-cols-2 gap-2">
          {ACTIONS.filter((a) => a.status !== appt.status).map(({ status, label, Icon }) => (
            <Button
              key={status}
              variant={status === "cancelled" ? "ghost" : "secondary"}
              loading={busy === status}
              disabled={busy !== null}
              icon={<Icon size={16} aria-hidden />}
              onClick={() =>
                patch(status, { status }, status === "no_show" ? "Marked no-show — follow-up scheduled" : `Marked ${STATUS[status].label.toLowerCase()}`)
              }
            >
              {label}
            </Button>
          ))}
        </div>
      </div>

      <Disclosure label="Reschedule">
        <div className="grid grid-cols-2 gap-3">
          <Input label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <Input label="Time" type="time" step={300} value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
        <div>
          <Button
            variant="primary"
            loading={busy === "move"}
            disabled={busy !== null}
            onClick={() => patch("move", { startsAt: toIso(date, time) }, "Rescheduled — reminder moved too")}
          >
            Save new time
          </Button>
        </div>
      </Disclosure>
    </div>
  );
}
