import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import githubWebhook from './github-webhook.js';
import discordInteractions from './discord-interactions.js';

const { commitSummary, validSignature } = githubWebhook._private;
const { validDiscordSignature } = discordInteractions._private;

describe('Discord approval integration helpers', () => {
  it('aggregates described commits and changed files', () => {
    const summary = commitSummary({
      ref: 'refs/heads/main',
      repository: { full_name: 'aj-gman/cyberpunk' },
      commits: [
        { id: 'a', message: '', added: ['ignored.txt'] },
        { id: 'b', message: 'Update sheet\n\nDetails', modified: ['src/site/img/NCO-sheet.html'], removed: ['old.txt'] }
      ],
      head_commit: { id: 'b', message: 'Update sheet\n\nDetails', url: 'https://github.com/commit/b', author: { name: 'AJ' } }
    });

    expect(summary.title).toBe('Update sheet');
    expect(summary.files).toEqual(['old.txt', 'src/site/img/NCO-sheet.html']);
    expect(summary.url).toBe('https://github.com/commit/b');
  });

  it('validates GitHub webhook HMAC signatures', () => {
    const body = Buffer.from('{"ref":"refs/heads/main"}');
    const secret = 'test-secret';
    const signature = `sha256=${crypto.createHmac('sha256', secret).update(body).digest('hex')}`;
    expect(validSignature(body, signature, secret)).toBe(true);
    expect(validSignature(body, `${signature}0`, secret)).toBe(false);
  });

  it('validates Discord Ed25519 signatures', () => {
    const keyPair = crypto.generateKeyPairSync('ed25519');
    const rawPublicKey = keyPair.publicKey.export({ type: 'spki', format: 'der' }).subarray(-32).toString('hex');
    const body = Buffer.from('{"type":1}');
    const timestamp = '1700000000';
    const signature = crypto.sign(null, Buffer.from(timestamp + body.toString('utf8')), keyPair.privateKey).toString('hex');
    expect(validDiscordSignature(body, timestamp, signature, rawPublicKey)).toBe(true);
    expect(validDiscordSignature(body, `${timestamp}1`, signature, rawPublicKey)).toBe(false);
  });
});