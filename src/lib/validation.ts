/**
 * Shared phone and customer validation rules for SuppPOS.
 *
 * Rules:
 * - Empty phone = allowed when customer phone is optional.
 * - Non-empty phone = exactly 10 numeric digits.
 * - Reject alphabets, spaces, special characters, and numbers with fewer/more than 10 digits.
 * - If phone is non-empty, name is required.
 */

/**
 * Checks whether the phone string is exactly 10 numeric digits.
 */
export function isValidIndianPhone(phone: string | null | undefined): boolean {
  if (!phone) return false;
  return /^\d{10}$/.test(phone.trim());
}

/**
 * Validates a customer phone input.
 * Returns an inline error string, or null if valid.
 *
 * @param phone The raw phone string from input
 * @param required Whether the phone field itself is mandatory
 */
export function getPhoneValidationError(
  phone: string | null | undefined,
  required = false,
): string | null {
  const val = phone ?? "";
  if (!val) {
    return required ? "Phone number is required" : null;
  }
  // Reject spaces, alphabets, and special characters
  if (!/^\d+$/.test(val)) {
    return "Phone number must contain numeric digits only";
  }
  if (val.length !== 10) {
    return "Phone number must be exactly 10 digits";
  }
  return null;
}

/**
 * Validates customer name in relation to phone number.
 * When a phone number is entered, customer name is mandatory.
 */
export function getCustomerNameValidationError(
  name: string | null | undefined,
  phone: string | null | undefined,
): string | null {
  const hasPhone = !!phone && phone.trim().length > 0;
  const hasName = !!name && name.trim().length > 0;

  if (hasPhone && !hasName) {
    return "Customer name is required when phone number is entered";
  }

  return null;
}
