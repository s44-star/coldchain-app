# Launch checklist

## Domain (`coldchain.lexconv.com`)
1. Vercel → project → Settings → Domains → add `coldchain.lexconv.com`.
2. Namecheap → lexconv.com → Advanced DNS → add `CNAME` record, host `coldchain`, value as Vercel shows
   (usually `cname.vercel-dns.com`).
3. Vercel env `NEXT_PUBLIC_SITE_URL` = `https://coldchain.lexconv.com`, redeploy.
4. Supabase → Authentication → URL configuration: Site URL `https://coldchain.lexconv.com`;
   redirect URLs `https://coldchain.lexconv.com/**` (keep the vercel.app entry until switched).
5. Database: `update public.app_settings set value = to_jsonb('https://coldchain.lexconv.com/api/cron/deliver'::text) where key = 'delivery_worker_url';`
6. Razorpay webhook URL: `https://coldchain.lexconv.com/api/webhooks/razorpay`.

## Before the first paying customer
- [ ] Razorpay international approved; live keys and webhook secret in Vercel; one real $1 test
      order paid and refunded.
- [ ] Invoice tax wording confirmed with the CA (GST/VAT, reverse charge for EU B2B).
- [ ] Terms, privacy and refund pages reviewed by a lawyer.
- [ ] Supabase on a paid plan (daily backups, no pausing); Vercel Pro if the team grows past one.
- [ ] Supabase Auth: custom SMTP (Resend) so sign-up and reset e-mails come from lexconv.com.
- [ ] `/admin/settings` shows every connection as Set.
- [ ] Test companies deleted from `/admin`.

## Built-in protections (verified by CI)
RLS on every table with tenant-scoped policies · composite tenant foreign keys · server-side role
checks · zod validation on every input · rate limits on auth, ingestion and payments · hashed
device keys and invitation tokens · HMAC-verified payments and webhooks · nonce-based CSP, HSTS,
frame denial · insert-only audit log with secret redaction · private storage with signed URLs ·
generic errors to clients, details in server logs.
