const DEFAULT_STATE_PATH = '.github/discord-approval-state.json';

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Server missing ${name} env var.`);
  return value;
}

function getConfig() {
  return {
    githubOwner: process.env.GITHUB_OWNER || 'aj-gman',
    githubRepo: process.env.GITHUB_REPO || 'cyberpunk',
    githubBranch: process.env.GITHUB_BRANCH || 'main',
    githubToken: required('GITHUB_DISCORD_TOKEN'),
    githubWebhookSecret: required('GITHUB_WEBHOOK_SECRET'),
    discordApplicationId: required('DISCORD_APPLICATION_ID'),
    discordBotToken: required('DISCORD_BOT_TOKEN'),
    discordPublicKey: required('DISCORD_PUBLIC_KEY'),
    discordChannelId: required('DISCORD_CHANNEL_ID'),
    discordApproverRoleId: required('DISCORD_APPROVER_ROLE_ID'),
    statePath: process.env.DISCORD_STATE_PATH || DEFAULT_STATE_PATH
  };
}

module.exports = { getConfig };