/** One import path for the Clinic CRM client hooks. */
export { useQuery, useMutation, invalidate, setQueryData, clearQueryCache } from "../../lib/clinic-crm/client/query";
export type { QueryOptions, QueryResult, MutationResult } from "../../lib/clinic-crm/client/query";
export { useContinuity } from "../../lib/clinic-crm/client/continuity";
export { useSpeechInput } from "../../lib/clinic-crm/client/speech";
export { useSession } from "../../components/clinic-crm/providers/SessionProvider";
export { useTheme } from "../../components/clinic-crm/providers/ThemeProvider";
export { useToast } from "../../components/clinic-crm/providers/ToastProvider";
