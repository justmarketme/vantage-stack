import { PatientDetailView } from "@/components/clinic-crm/views/PatientDetailView";

export default async function PatientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PatientDetailView id={id} />;
}
