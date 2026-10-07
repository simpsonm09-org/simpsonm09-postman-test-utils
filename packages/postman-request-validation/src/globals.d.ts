/**
 * The Postman sandbox and the newman prelude both expose a global `pm`. The
 * suite reads it only when a scenario executes, so the declaration is the sole
 * module-scope reference and it is erased before `validationHelpers` serializes
 * the suite.
 */
declare const pm: any;
