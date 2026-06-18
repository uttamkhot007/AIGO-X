/** Canonical production URL for the AIGO-X GRC Platform.
 *  Use this wherever a static, shareable link to the platform is needed.
 *  Runtime code that builds portal/OAuth/webhook URLs should prefer
 *  window.location.origin (so dev environments still work), but can fall
 *  back to APP_URL when generating canonical links for email/docs/config. */
export const APP_URL = "https://grc.aigosek.com";
export const APP_DOMAIN = "grc.aigosek.com";
export const APP_NAME = "AIGO-X GRC";
