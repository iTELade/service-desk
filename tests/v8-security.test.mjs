import test from 'node:test';
import assert from 'node:assert/strict';
import {qrSvg} from '../lib/qr.mjs';

test('TOTP QR is generated locally as an SVG matrix',()=>{
  const uri='otpauth://totp/Service%20Desk:test@example.test?secret=JBSWY3DPEHPK3PXP&issuer=Service%20Desk&algorithm=SHA1&digits=6&period=30';
  const svg=qrSvg(uri);
  assert.match(svg,/^<svg /);
  assert.match(svg,/aria-label="QR code for authenticator setup"/);
  assert.ok((svg.match(/<rect /g)||[]).length>300);
  assert.ok(!svg.includes('otpauth://'));
  assert.ok(!svg.includes('test@example.test'));
  assert.ok(!svg.includes('JBSWY3DPEHPK3PXP'));
});
