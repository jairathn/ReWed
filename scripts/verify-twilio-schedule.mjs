#!/usr/bin/env node
// Throwaway diagnostic: proves the Twilio scheduling contract our app uses
// actually works against YOUR account, without touching the app/DB. It mirrors
// scheduleSms() + cancelScheduledSms() in lib/messaging/twilio-client.ts.
//
// Your secrets stay on your machine. Get them into the environment with:
//   vercel env pull .env.local
// then run (Node 18+):
//   node --env-file=.env.local scripts/verify-twilio-schedule.mjs +1XXXXXXXXXX
//
// where +1XXXXXXXXXX is a number you can watch (your own phone, E.164).
// It schedules a test text ~20 min out, prints the result, then immediately
// cancels it — so nothing is actually delivered.

const to = process.argv[2];
const { TWILIO_ACCOUNT_SID: SID, TWILIO_AUTH_TOKEN: TOKEN, TWILIO_MESSAGING_SERVICE_SID: MG } =
  process.env;

if (!to) {
  console.error('Usage: node verify-twilio-schedule.mjs +1XXXXXXXXXX');
  process.exit(1);
}
for (const [name, val] of [
  ['TWILIO_ACCOUNT_SID', SID],
  ['TWILIO_AUTH_TOKEN', TOKEN],
  ['TWILIO_MESSAGING_SERVICE_SID', MG],
]) {
  if (!val) {
    console.error(`Missing ${name} in the environment.`);
    process.exit(1);
  }
}

const auth = 'Basic ' + Buffer.from(`${SID}:${TOKEN}`).toString('base64');
const base = `https://api.twilio.com/2010-04-01/Accounts/${SID}/Messages.json`;
const sendAt = new Date(Date.now() + 20 * 60 * 1000).toISOString();

console.log(`Scheduling a test text to ${to} for ${sendAt} via ${MG}…`);

const res = await fetch(base, {
  method: 'POST',
  headers: { Authorization: auth, 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    To: to,
    Body: 'ReWed scheduling self-test — this will be canceled immediately.',
    MessagingServiceSid: MG,
    ScheduleType: 'fixed',
    SendAt: sendAt,
  }).toString(),
});
const data = await res.json();

if (!res.ok) {
  console.error(`\n❌ Twilio rejected the schedule (HTTP ${res.status}, code ${data.code}):`);
  console.error(`   ${data.message}`);
  if (data.more_info) console.error(`   ${data.more_info}`);
  console.error('\nIf this is a trial-account or sender limitation, that explains it.');
  process.exit(1);
}

console.log(`\n✅ Scheduled. SID=${data.sid}  status=${data.status}`);
console.log('   (status should be "scheduled")');

console.log('\nCanceling it…');
const cancel = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${SID}/Messages/${data.sid}.json`, {
  method: 'POST',
  headers: { Authorization: auth, 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ Status: 'canceled' }).toString(),
});
const cancelData = await cancel.json();

if (!cancel.ok) {
  console.error(`⚠️  Cancel failed (HTTP ${cancel.status}): ${cancelData.message}`);
  console.error(`   Cancel it manually in the Twilio console (SID ${data.sid}) so it doesn't send.`);
  process.exit(1);
}

console.log(`✅ Canceled. status=${cancelData.status}  (should be "canceled")`);
console.log('\nBoth halves of the Twilio scheduling contract work on your account.');
