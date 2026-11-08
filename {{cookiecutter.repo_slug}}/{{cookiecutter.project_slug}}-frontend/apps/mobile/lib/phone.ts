/** Only what a form should send: an empty optional number is no number. */
export function phoneOf(phone: string) {
  return phone ? { phone } : {}
}
