// Roles a person can choose for themselves at signup.
//
// platform_admin is absent on purpose, and the database enforces the same
// whitelist twice — in handle_new_user() and in claim_account_type(). Offering
// it here would let anyone grant themselves the admin back office from a public
// form.
//
// Kept in its own module rather than in AppState because signupIntent.js needs
// it too, and importing AppState from there would be a cycle.
export const SELF_SERVICE_ACCOUNT_TYPES = [
  { id: "consumer", label: "I'm planning or arranging a funeral" },
  { id: "provider", label: "I work for a funeral home or provider" },
];
