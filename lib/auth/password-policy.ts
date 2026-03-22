const SPECIAL = new Set(["!", "@", "#", "$", "%", "^", "&", "*"]);

export type PasswordCheck = {
  ok: boolean;
  minLen: boolean;
  upper: boolean;
  lower: boolean;
  digit: boolean;
  special: boolean;
};

export function checkPasswordPolicy(password: string): PasswordCheck {
  const minLen = password.length >= 12;
  let upper = false;
  let lower = false;
  let digit = false;
  let special = false;
  for (const ch of password) {
    if (ch >= "A" && ch <= "Z") upper = true;
    else if (ch >= "a" && ch <= "z") lower = true;
    else if (ch >= "0" && ch <= "9") digit = true;
    else if (SPECIAL.has(ch)) special = true;
  }
  const ok = minLen && upper && lower && digit && special;
  return { ok, minLen, upper, lower, digit, special };
}

export function passwordPolicyError(): string {
  return "Password must be at least 12 characters and include uppercase, lowercase, a number, and one of !@#$%^&*";
}

export const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

export function isValidUsername(u: string): boolean {
  return USERNAME_RE.test(u);
}
