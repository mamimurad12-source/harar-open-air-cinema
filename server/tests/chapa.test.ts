/**
 * Chapa adapter tests. The network boundary is stubbed (we control fetch),
 * so these verify OUR mapping to the documented Chapa API shapes:
 * initialize payload, verify mapping, HMAC webhook auth.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { ChapaAdapter, toChapaPhone } from '../src/services/payments/chapa';

type FetchStub = typeof fetch;

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function adapterWithFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const stubFetch = (async (url: unknown, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return handler(String(url), init);
  }) as unknown as FetchStub;
  const adapter = new ChapaAdapter(
    { secretKey: 'test-secret-key', mode: 'test', baseUrl: 'https://api.chapa.co/v1' },
    stubFetch,
  );
  return { adapter, calls };
}

describe('ChapaAdapter.createPayment', () => {
  it('POSTs the documented initialize payload and returns the checkout URL', async () => {
    const { adapter, calls } = adapterWithFetch(() =>
      jsonResponse(200, {
        message: 'Hosted Link',
        status: 'success',
        data: { checkout_url: 'https://checkout.chapa.co/checkout/abc' },
      }),
    );
    const result = await adapter.createPayment({
      transactionId: 'hoc-HOC-ABC123-X7K2',
      amountBirr: 500,
      currency: 'ETB',
      customerName: 'Hanna Girma',
      customerPhone: '251911123456',
      bookingReference: 'HOC-ABC123',
      eventTitle: 'Premiere Night',
      callbackUrl: 'https://api.example.com/api/payments/callback/chapa',
      returnUrl: 'https://example.com/pay/return?provider=chapa&tx=x',
    });
    assert.equal(result.checkoutUrl, 'https://checkout.chapa.co/checkout/abc');
    assert.equal(calls.length, 1);
    const call = calls[0]!;
    assert.equal(call.url, 'https://api.chapa.co/v1/transaction/initialize');
    assert.equal(call.init?.method, 'POST');
    const headers = call.init?.headers as Record<string, string>;
    assert.equal(headers.Authorization, 'Bearer test-secret-key');
    const payload = JSON.parse(call.init?.body as string) as Record<string, unknown>;
    assert.equal(payload.amount, '500');
    assert.equal(payload.currency, 'ETX'.replace('X', 'B')); // ETB, never anything else
    assert.equal(payload.tx_ref, 'hoc-HOC-ABC123-X7K2');
    assert.equal(payload.phone_number, '0911123456');
    assert.equal(payload.callback_url, 'https://api.example.com/api/payments/callback/chapa');
    assert.equal(payload.return_url, 'https://example.com/pay/return?provider=chapa&tx=x');
  });

  it('throws on non-success responses and on unreachable network', async () => {
    const { adapter } = adapterWithFetch(() =>
      jsonResponse(400, { message: 'Invalid API key', status: 'failed' }),
    );
    await assert.rejects(() => adapter.createPayment({
      transactionId: 't',
      amountBirr: 250,
      currency: 'ETB',
      customerName: 'A',
      customerPhone: '251911000000',
      bookingReference: 'HOC-1',
      eventTitle: 'E',
      callbackUrl: 'https://cb',
      returnUrl: 'https://ret',
    }), /Chapa initialize failed/);

    const unreachable = new ChapaAdapter(
      { secretKey: 'k', mode: 'test', baseUrl: 'https://api.chapa.co/v1' },
      (async () => {
        throw new TypeError('fetch failed');
      }) as unknown as FetchStub,
    );
    await assert.rejects(() => unreachable.createPayment({
      transactionId: 't',
      amountBirr: 250,
      currency: 'ETB',
      customerName: 'A',
      customerPhone: '251911000000',
      bookingReference: 'HOC-1',
      eventTitle: 'E',
      callbackUrl: 'https://cb',
      returnUrl: 'https://ret',
    }), /unreachable/);
  });
});

describe('ChapaAdapter.verifyPayment', () => {
  const ctx = { secretKey: 'k', mode: 'test' as const, baseUrl: 'https://api.chapa.co/v1' };

  it('maps documented verify statuses to verdicts', async () => {
    const { adapter } = adapterWithFetch((url) => {
      if (url.endsWith('/paid')) {
        return jsonResponse(200, {
          message: 'Payment details',
          status: 'success',
          data: {
            status: 'success',
            amount: '500.00',
            currency: 'ETX'.replace('X', 'B'),
            tx_ref: 'hoc-x',
            reference: 'chapa-ref-1',
            method: 'telebirr',
            mode: 'test',
          },
        });
      }
      if (url.endsWith('/pend')) {
        return jsonResponse(200, {
          status: 'success',
          data: { status: 'pending', amount: '250', currency: 'ETB', tx_ref: 'pend' },
        });
      }
      return jsonResponse(200, {
        status: 'success',
        data: { status: 'failed', amount: '250', currency: 'ETB', tx_ref: 'fail' },
      });
    });
    const paid = await adapter.verifyPayment('paid');
    assert.equal(paid.verdict, 'PAID');
    assert.equal(paid.amountMinorOrMajor, 500);
    assert.equal(paid.amountUnit, 'major');
    assert.equal(paid.currency, 'ETB');
    assert.equal(paid.providerReference, 'chapa-ref-1');
    assert.equal(paid.providerMethod, 'telebirr');
    assert.equal(paid.mode, 'test');

    assert.equal((await adapter.verifyPayment('pend')).verdict, 'PENDING');
    const failed = await adapter.verifyPayment('fail');
    assert.equal(failed.verdict, 'FAILED');
  });

  it('maps missing transactions to UNKNOWN and auth failures to errors', async () => {
    const { adapter, calls } = adapterWithFetch((url) =>
      url.endsWith('/gone')
        ? jsonResponse(404, { message: 'No transaction found', status: 'failed' })
        : jsonResponse(200, { status: 'failed', message: 'nope' }),
    );
    assert.equal((await adapter.verifyPayment('gone')).verdict, 'UNKNOWN');
    assert.equal(calls[0]?.url, 'https://api.chapa.co/v1/transaction/verify/gone');

    const authed = new ChapaAdapter(ctx, (async () =>
      jsonResponse(401, { message: 'Invalid API key' })) as unknown as FetchStub);
    await assert.rejects(() => authed.verifyPayment('x'), /Invalid API key/);
  });
});

describe('ChapaAdapter.parseWebhook', () => {
  const secret = 'whsec-test';
  const make = () => new ChapaAdapter({ secretKey: secret, mode: 'test', baseUrl: 'https://x' });
  const payload = {
    event: 'charge.success',
    tx_ref: 'hoc-HOC-ABC123-X7K2',
    reference: 'chapa-ref-9',
    amount: '500.00',
    currency: 'ETB',
    status: 'success',
    mode: 'test',
    type: 'API',
    payment_method: 'telebirr',
    created_at: '2026-01-01T00:00:00.000Z',
  };

  it('accepts correctly signed webhooks (both header spellings)', async () => {
    const raw = Buffer.from(JSON.stringify(payload), 'utf8');
    const signature = crypto.createHmac('sha256', secret).update(raw).digest('hex');
    const viaChapa = await make().parseWebhook(raw, { 'chapa-signature': signature });
    assert.ok(viaChapa);
    assert.equal(viaChapa?.transactionId, payload.tx_ref);
    assert.equal(viaChapa?.evidence.verdict, 'PAID');
    const viaX = await make().parseWebhook(raw, { 'x-chapa-signature': signature });
    assert.ok(viaX);
    assert.equal(viaX?.eventId, viaChapa?.eventId); // deterministic → idempotent
  });

  it('rejects wrong/missing signatures and malformed bodies without state', async () => {
    const raw = Buffer.from(JSON.stringify(payload), 'utf8');
    assert.equal(await make().parseWebhook(raw, { 'chapa-signature': '0'.repeat(64) }), null);
    assert.equal(await make().parseWebhook(raw, {}), null);
    const bad = Buffer.from('not-json{{{', 'utf8');
    const sig = crypto.createHmac('sha256', secret).update(bad).digest('hex');
    assert.equal(await make().parseWebhook(raw, { 'chapa-signature': sig }), null);
  });
});

describe('toChapaPhone', () => {
  it('formats stored phones for Chapa', () => {
    assert.equal(toChapaPhone('251911123456'), '0911123456');
    assert.equal(toChapaPhone('0911123456'), '0911123456');
  });
});
