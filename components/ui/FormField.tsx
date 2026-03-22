"use client";

import { useId } from "react";

type CommonProps = {
  label: string;
  required?: boolean;
  hint?: string | null;
  error?: string | null;
  touched?: boolean;
  className?: string;
};

type InputFieldProps = CommonProps & {
  kind: "input";
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  type?: "text" | "email" | "tel" | "url";
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  autoComplete?: string;
};

type TextareaFieldProps = CommonProps & {
  kind: "textarea";
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  rows?: number;
};

type FormFieldProps = InputFieldProps | TextareaFieldProps;

export function FormField(props: FormFieldProps) {
  const id = useId();
  const showErr = Boolean(props.error) && Boolean(props.touched);
  const describedBy = `${id}-hint ${id}-error`.trim();

  return (
    <div className={props.className ?? "space-y-2"}>
      <label htmlFor={id} className="block text-sm text-textPrimary/90">
        {props.label}
        {props.required ? <span className="text-accent"> *</span> : null}
      </label>

      {props.kind === "textarea" ? (
        <textarea
          id={id}
          className="vs-input min-h-[110px] resize-y"
          value={props.value}
          onChange={(e) => props.onChange(e.target.value)}
          onBlur={props.onBlur}
          placeholder={props.placeholder}
          aria-invalid={showErr ? true : undefined}
          aria-describedby={props.hint || showErr ? describedBy : undefined}
        />
      ) : (
        <input
          id={id}
          className="vs-input"
          value={props.value}
          onChange={(e) => props.onChange(e.target.value)}
          onBlur={props.onBlur}
          placeholder={props.placeholder}
          type={props.type ?? "text"}
          inputMode={props.inputMode}
          autoComplete={props.autoComplete}
          aria-invalid={showErr ? true : undefined}
          aria-describedby={props.hint || showErr ? describedBy : undefined}
        />
      )}

      <div className="flex items-start justify-between gap-4">
        <p id={`${id}-hint`} className="text-[11px] text-textMuted/80">
          {props.hint ?? ""}
        </p>
        <p id={`${id}-error`} className="text-[11px] text-red-300">
          {showErr ? props.error : ""}
        </p>
      </div>
    </div>
  );
}

