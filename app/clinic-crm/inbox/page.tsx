import { Suspense } from "react";
import { InboxView } from "@/components/clinic-crm/views/InboxView";

// InboxView reads ?patient=, which needs a Suspense boundary under the App Router.
export default function InboxPage() {
  return (
    <Suspense>
      <InboxView />
    </Suspense>
  );
}
