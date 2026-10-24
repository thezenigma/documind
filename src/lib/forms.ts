/** Shared return shape for auth form server actions. */
export type FormState = {
  ok?: boolean;
  message?: string;
  fieldErrors?: { email?: string; password?: string };
} | undefined;
