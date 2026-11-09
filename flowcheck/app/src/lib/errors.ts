import { UsgsError } from "../usgs/client";

/** A message for an error that's fine to show on screen. */
export function errorMessage(error: unknown): string {
  if (error instanceof UsgsError) return error.message;
  console.error(error);
  return "Something went wrong. Try again.";
}
