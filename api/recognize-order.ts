// Vercel discovers root-level /api functions when this repository is deployed
// as the Next.js frontend project. The implementation remains shared with the
// standalone vercel-api folder for deployments that use that folder as root.
export { default } from "../vercel-api/api/recognize-order";
