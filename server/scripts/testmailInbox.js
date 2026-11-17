import 'dotenv/config';

/**
 * Reads captured mail from testmail.app.
 *
 *   npm run email:inbox            # whole namespace, newest first
 *   npm run email:inbox -- <tag>   # only one tag
 *
 * Requires TESTMAIL_API_KEY and TESTMAIL_NAMESPACE in server/.env.
 */

const apiKey = process.env.TESTMAIL_API_KEY;
const namespace = process.env.TESTMAIL_NAMESPACE;
const tag = process.argv[2] || process.env.TESTMAIL_TAG;

if (!apiKey || !namespace) {
  console.error('✗ TESTMAIL_API_KEY and TESTMAIL_NAMESPACE must be set in server/.env.');
  console.error('  Copy both from https://testmail.app/console/');
  process.exit(1);
}

const url = new URL('https://api.testmail.app/api/json');
url.searchParams.set('apikey', apiKey);
url.searchParams.set('namespace', namespace);
url.searchParams.set('limit', '10');
url.searchParams.set('pretty', 'true');
if (tag) url.searchParams.set('tag', tag);

const extractUrls = (email) => {
  const source = `${email.html || ''}\n${email.text || ''}`;
  const urls = [];
  for (const match of source.matchAll(/https?:\/\/[^\s"'<>)]+/g)) {
    const cleaned = match[0].replace(/&amp;/g, '&');
    if (!urls.includes(cleaned)) urls.push(cleaned);
  }
  return urls.filter((href) => !/^(https:\/\/fonts|https:\/\/www\.openstreetmap)/.test(href));
};

console.log(`\nFetching mail for namespace "${namespace}"${tag ? ` (tag: ${tag})` : ''}…\n`);

try {
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  const data = await res.json();

  if (data.result !== 'success') {
    console.error('✗ testmail API error:', data.message || res.status);
    if (res.status === 429) console.error('  → Rate limited. Wait a minute and retry.');
    process.exit(1);
  }

  if (!data.emails?.length) {
    console.log('No email captured yet.');
    console.log('Send one with:  npm run email:test');
    console.log('Or trigger a flow in the app (register, invite a guardian, trigger SOS).\n');
    process.exit(0);
  }

  console.log(`${data.count} matching email(s), showing ${data.emails.length}:\n`);

  data.emails.forEach((email, index) => {
    console.log(`${index + 1}. ${email.subject}`);
    console.log(`   from : ${email.from}`);
    console.log(`   to   : ${email.to}`);
    console.log(`   sent : ${new Date(email.timestamp).toLocaleString()}`);
    if (typeof email.spam_score === 'number') console.log(`   spam : ${email.spam_score}`);

    const urls = extractUrls(email);
    if (urls.length) {
      console.log('   links:');
      urls.slice(0, 4).forEach((href) => console.log(`     ${href}`));
    }
    console.log('');
  });
} catch (err) {
  console.error('✗ Could not reach testmail.app:', err.message);
  process.exitCode = 1;
}
