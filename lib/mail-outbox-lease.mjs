// An atomic SQLite lease prevents simultaneous senders on independent Desk workers.
// SMTP is an external side effect: a crash after delivery but before acknowledgment
// can still cause a retry (the message-id is stable across such retries).
export function claimPendingMail(db, at, limit = 20, leaseMs = 300000) {
  if(!Number.isSafeInteger(at)||!Number.isSafeInteger(leaseMs)||leaseMs<60000||leaseMs>3600000||!Number.isSafeInteger(limit)||limit<1||limit>100)throw new RangeError('Invalid mail lease.');
  const candidates=db.prepare("SELECT id FROM mail_outbox WHERE channel_id IS NOT NULL AND next_attempt<=? AND status IN ('queued','sending') ORDER BY next_attempt,id LIMIT ?").all(at,limit);
  const claim=db.prepare("UPDATE mail_outbox SET status='sending',next_attempt=? WHERE id=? AND next_attempt<=? AND status IN ('queued','sending')");
  const get=db.prepare('SELECT * FROM mail_outbox WHERE id=?');
  const result=[];
  for(const row of candidates) {
    if(claim.run(at+leaseMs,row.id,at).changes===1)result.push(get.get(row.id));
  }
  return result;
}
