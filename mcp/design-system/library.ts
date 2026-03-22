export type ComponentSpec = {
  name: string;
  description?: string;
  props?: Record<string, string>;
  usage?: string;
};

// Minimal starter “library” so agents can query what exists.
// If you want this backed by real components, we can wire it to your `components/` directory.
export const COMPONENT_LIBRARY: ComponentSpec[] = [
  {
    name: "Button",
    description: "Primary/secondary button with consistent spacing, radius, and focus states.",
    props: { variant: '"primary" | "secondary" | "ghost"', size: '"sm" | "md" | "lg"', href: "string (optional)" },
  },
  {
    name: "Card",
    description: "Surface container with border/shadow tokens and padding scale.",
    props: { tone: '"default" | "muted"', padding: '"sm" | "md" | "lg"' },
  },
  {
    name: "Input",
    description: "Text input with label, hint, error, and accessible focus ring.",
    props: { label: "string", value: "string", onChange: "(value) => void", error: "string (optional)" },
  },
  {
    name: "ProgressBar",
    description: "Tokenized progress indicator with accessible ARIA attributes.",
    props: { value: "number (0-100)", label: "string (optional)" },
    usage: "import { ProgressBar } from '@/components/ui/ProgressBar';",
  },
  {
    name: "FormField",
    description: "Labeled input/textarea wrapper with hint+error, aria-describedby, and required indicator.",
    props: { kind: '"input" | "textarea"', label: "string", required: "boolean", error: "string (optional)", touched: "boolean (optional)" },
    usage: "import { FormField } from '@/components/ui/FormField';",
  },
];

