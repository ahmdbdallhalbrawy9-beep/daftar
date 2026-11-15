// @ts-check
// Port shapes (JSDoc typedefs only — no runtime code) that `application` use
// cases depend on. `infrastructure` implements these; `application` never
// imports a concrete adapter, only ever these shapes. See docs/ARCHITECTURE.md.

/**
 * @typedef {object} DbDocSnap
 * @property {string} id
 * @property {boolean} exists
 * @property {() => any} data
 */

/**
 * @typedef {object} DbDoc
 * @property {() => Promise<DbDocSnap>} get
 * @property {(data: object) => Promise<void>} set
 * @property {(data: object) => Promise<void>} update
 * @property {() => Promise<void>} delete
 */

/**
 * @typedef {object} DbSnapshot
 * @property {DbDocSnap[]} docs
 * @property {number} size
 * @property {boolean} empty
 * @property {{fromCache?: boolean, hasPendingWrites?: boolean}} [metadata]
 */

/**
 * @typedef {object} DbCollection
 * @property {(id: string) => DbDoc} doc
 * @property {(next: (snap: DbSnapshot) => void, err?: (e: any) => void) => (() => void)} onSnapshot
 */

/**
 * @typedef {object} DbPort
 * @property {(name: string) => DbCollection} collection
 */

/**
 * @typedef {object} AuthUser
 * @property {string} uid
 * @property {string} [email]
 */

/**
 * @typedef {object} AuthPort
 * @property {(email: string, pw: string) => Promise<void>} signIn
 * @property {(email: string, pw: string) => Promise<void>} signUp
 * @property {(email: string) => Promise<void>} sendPasswordReset
 * @property {() => Promise<void>} signOut
 * @property {(cb: (user: AuthUser|null) => void) => void} onChange
 */

/**
 * @typedef {object} SmsMessage
 * @property {string} [address]
 * @property {string} body
 * @property {number} date
 */

/**
 * @typedef {object} SmsPort
 * @property {() => Promise<{sms: string}>} checkPermissions
 * @property {() => Promise<{sms: string}>} requestPermissions
 * @property {(opts: {since: number, limit: number}) => Promise<{messages: SmsMessage[]}>} getSms
 */

/**
 * @typedef {object} ClockPort
 * @property {() => number} now
 */

export {};
