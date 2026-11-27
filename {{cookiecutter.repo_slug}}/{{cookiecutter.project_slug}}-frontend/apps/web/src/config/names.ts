import { CONFIG, NAME_REQUIREMENTS, type NameRequirement } from './public'

export { NAME_REQUIREMENTS, type NameRequirement }

/** The backend's ACCOUNTS__NAME_REQUIREMENT, read when asked, as the public config is per request. */
export function nameRequirement(): NameRequirement {
  return CONFIG.ACCOUNTS.NAME_REQUIREMENT
}
