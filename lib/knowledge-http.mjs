import http from 'node:http';
import https from 'node:https';
import { lookup } from 'node:dns/promises';
import { allowedAddress } from './webhooks.mjs';
import { fail } from './core.mjs';

export async function knowledgeRequest(url, { token = '', allowPrivate = false } = {}, deps = {}) {
  const u = new URL(url),
    hostname = u.hostname.replace(/^\[|\]$/g, '');
  if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password || u.hash)
    fail(400, 'Nieprawidłowy adres bazy wiedzy.');
  let timer;
  const answers = await Promise.race([
    (deps.lookup || lookup)(hostname, { all: true }),
    new Promise((_, reject) => {
      timer = setTimeout(
        () => reject(Object.assign(new Error('Baza wiedzy: przekroczono czas DNS.'), { status: 502 })),
        8000,
      );
    }),
  ]).finally(() => clearTimeout(timer));
  if (
    !answers.length ||
    answers.some((a) => /^::ffff:/i.test(a.address) || !allowedAddress(a.address, allowPrivate))
  )
    fail(400, 'Adres bazy wiedzy prowadzi do niedozwolonej sieci.');
  if (u.protocol === 'http:' && (!allowPrivate || answers.some((a) => allowedAddress(a.address, false))))
    fail(400, 'HTTP jest dozwolone wyłącznie dla jawnie włączonej sieci prywatnej.');
  const selected = answers[0];
  return new Promise((resolve, reject) => {
    const request = deps.request || (u.protocol === 'https:' ? https.request : http.request);
    const req = request(
      u,
      {
        method: 'GET',
        agent: false,
        headers: { Accept: 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
        lookup: (_hostname, opts, cb) =>
          opts.all ? cb(null, [selected]) : cb(null, selected.address, selected.family),
      },
      (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          const err = Object.assign(
            new Error(
              res.statusCode === 401
                ? 'Baza wiedzy odrzuciła token lub jego uprawnienia.'
                : res.statusCode === 404
                  ? 'Artykuł jest niedostępny.'
                  : 'Baza wiedzy zwróciła nieprawidłową odpowiedź.',
            ),
            { status: 502, upstreamStatus: res.statusCode },
          );
          reject(err);
          return;
        }
        if (!/^application\/json\b/i.test(res.headers['content-type'] || '')) {
          res.resume();
          reject(Object.assign(new Error('Baza wiedzy nie zwróciła JSON.'), { status: 502 }));
          return;
        }
        const chunks = [];
        let bytes = 0;
        res.on('data', (chunk) => {
          bytes += chunk.length;
          if (bytes > 2 * 1024 * 1024) {
            req.destroy(Object.assign(new Error('Odpowiedź bazy wiedzy jest za duża.'), { status: 502 }));
            return;
          }
          chunks.push(chunk);
        });
        res.on('end', () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
          } catch {
            reject(Object.assign(new Error('Nieprawidłowy JSON bazy wiedzy.'), { status: 502 }));
          }
        });
        res.on('error', () =>
          reject(Object.assign(new Error('Przerwano odpowiedź bazy wiedzy.'), { status: 502 })),
        );
      },
    );
    const timeout = setTimeout(
      () =>
        req.destroy(Object.assign(new Error('Przekroczono czas połączenia z bazą wiedzy.'), { status: 502 })),
      8000,
    );
    req.on('error', (err) =>
      reject(
        err.status ? err : Object.assign(new Error('Nie udało się połączyć z bazą wiedzy.'), { status: 502 }),
      ),
    );
    req.on('close', () => clearTimeout(timeout));
    req.end();
  });
}
