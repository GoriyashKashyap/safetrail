import 'dotenv/config';
import { getSmtpConfig, verifySmtp, sendTestEmail } from '../utils/email.js';

const config = getSmtpConfig();
const mask = (value) =>
  value ? `${value.slice(0, 3)}${'•'.repeat(Math.max(0, Math.min(12, value.length - 3)))}` : '(unset)';

const recipient = process.env.EMAIL_TEST_TO || process.env.SMTP_USER || '(unset)';

console.log('\nSafeTrail email check\n');
console.log('  host        :', config.host || '(unset)');
console.log('  port        :', config.port, config.secure ? '(TLS)' : '(STARTTLS if offered)');
console.log('  user        :', mask(config.user));
console.log('  from        :', process.env.EMAIL_FROM || '(unset)');
console.log('  delivering  :', process.env.EMAIL_TEST_TO ? `redirected to ${process.env.EMAIL_TEST_TO}` : 'real recipients');
console.log('  this message:', recipient, '\n');

if (!config.host || !config.user || !config.pass) {
  console.error('✗ SMTP is not configured yet.');
  console.error('  Fill SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS and EMAIL_FROM in server/.env.');
  console.error('  See README → "Testing email flows with testmail.app".');
  process.exit(1);
}

try {
  const verified = await verifySmtp();
  console.log(`✓ SMTP connection accepted (${verified.host}:${verified.port})`);

  const info = await sendTestEmail(recipient);
  console.log('✓ Test email accepted for delivery');
  console.log('  messageId :', info.messageId);
  console.log('  envelope  :', JSON.stringify(info.envelope));
  console.log('\nIf you use testmail.app, read it with:  npm run email:inbox\n');
} catch (err) {
  console.error('✗', err.message);
  const hints = {
    EAUTH: 'Check SMTP_USER / SMTP_PASS. Brevo needs your SMTP login (not your account password) plus a generated SMTP key; Gmail needs a 16-character app password.',
    ETIMEDOUT: 'The SMTP port may be blocked by your network. Try port 587 or 2525.',
    ESOCKET: 'Could not reach the SMTP host. Verify SMTP_HOST and SMTP_PORT.',
    ESECURITY: 'TLS mismatch. Use SMTP_PORT=465 with SMTP_SECURE=true, or 587 with STARTTLS.',
  };
  const hint = hints[err.code];
  if (hint) console.error('  →', hint);
  if (/self.signed|self signed/i.test(err.message)) {
    console.error('  → The server uses an untrusted certificate; check the provider settings.');
  }
  process.exitCode = 1;
}
