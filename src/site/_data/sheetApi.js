// Base URL of the Vercel serverless API used by the character sheets for
// cloud saves. Override per deployment with the SHEET_API_BASE environment
// variable; the default is the current Vercel deployment. The Pages build
// verifies the sheets load the generated img/api-config.js.
module.exports = {
  base: process.env.SHEET_API_BASE || "https://gman-cyberpunk.vercel.app/api",
};
