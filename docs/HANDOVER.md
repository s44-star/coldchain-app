# ColdChain OS — Handover (Subham ke liye)

Yeh file isliye hai ki bina kisi developer ke bhi tu app chala sake. Sab kaam phone se ho jayega.

## Links
- App: https://coldchain.lexconv.com
- Super admin: https://coldchain.lexconv.com/admin
- Code: https://github.com/s44-star/coldchain-app
- Hosting: Vercel → project `coldchain-app-z971`
- Database: Supabase → SQL Editor
- E-mail: resend.com
- Payments: Razorpay dashboard

## Secrets kahan hain (value kabhi kisi ko mat bhejna)
Vercel → Settings → Environment Variables:
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`,
`NEXT_PUBLIC_SITE_URL`, `CRON_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`,
`NEXT_PUBLIC_RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`.
Koi bhi variable badlo → **Redeploy** zaroor karo.
`/admin/settings` pe dikhta hai kaunsa Set hai, kaunsa Missing.

## Razorpay theek hone ke baad (8 Dec tak)
1. ₹1 test: `/admin/plans` → Starter (India, ₹) → Monthly `1`, Setup `0` → Save →
   `/app/billing` → Choose Starter → pay → "Payment received" + invoice dikhna chahiye.
   Turant wapas `4999` / `9999` karo. Razorpay → Payments → Refund.
2. Business type Sole Proprietorship ho gaya → `/admin/settings` → seller (India) ka naam `LexConv` karo.
3. International approve → kuch nahi karna, dollar payment apne aap chalega.
   Ek $1 test card se karke refund kar dena (Starter ($) ka price thodi der `1` karke).
4. PayPal Razorpay me link hai → videshi customer ko checkout me apne aap dikhega.
5. Agar Razorpay **naya account** banane ko bole: naye account ki Live keys aur webhook
   (URL `https://coldchain.lexconv.com/api/webhooks/razorpay`, events `payment.captured`,
   `payment.failed`, `order.paid`) → Vercel ke 3 Razorpay variables badlo → Redeploy.
   Website me `coldchain.lexconv.com` add karna mat bhoolna.

## Jab tak Razorpay nahi chalta: customer se paisa kaise lo
Customer bank transfer / UPI tere account me kare → `/admin` → company kholo →
**"Record a payment received outside Razorpay"** → plan, period, amount, UTR → Save.
Plan chalu, invoice ban jayega. Pehle bank me paisa aaya hai, check kar lena (yeh undo nahi hota).

## Roz ke kaam
- **Price badalna:** `/admin/plans`. Purane paid customers pe asar nahi.
- **Trial badhana / company band-chalu / demo:** `/admin` → company → Actions.
- **Company delete:** `/admin` → company → Delete (paid invoice wali delete nahi hoti).
- **Trial ke din, data kitne mahine:** `/admin/settings`.
- **Kisne kya badla:** `/admin/activity` (poora platform), company owner ke liye `/app/settings/activity`.
- **Users dhundhna:** `/admin/users`.
- **Kisi ko super admin banana** (Supabase SQL, email badal ke):
  ```sql
  insert into public.platform_admins (user_id, note)
  select id, 'admin' from public.profiles where email = 'naam@example.com';
  ```

## Pehle customer se pehle
- [ ] Supabase **Pro plan** ($25/month): daily backup, project kabhi pause nahi hoga.
- [ ] Signup / password-reset e-mail Resend se: Supabase → Authentication → **Emails → SMTP Settings**
      → Enable custom SMTP: Host `smtp.resend.com`, Port `465`, Username `resend`,
      Password = Resend me nayi API key (naam `supabase-auth`), Sender `no-reply@lexconv.com`,
      Sender name `ColdChain OS` → Save. Phir Authentication → **Rate Limits** → e-mails per hour `30`.
- [ ] Invoice pe tax wording CA se confirm (abhi "Not registered under GST").
- [ ] Terms / Privacy / Refund lawyer se ek baar padhwa lo.
- [ ] `/admin` se saari "CI smoke test company (delete me)" delete.

## Kuch toota to
- **Site nahi khul rahi:** Vercel → Deployments → pichhla "Ready" wala → ⋯ → **Promote to Production**
  (purana version wapas). Phir dekhna kya badla tha.
- **Error dekhna:** Vercel → project → Logs (filter: Error).
- **Alert e-mail nahi aa rahe:** `/admin/settings` me Resend + worker "Set" hai? Resend → Emails me status dekho.
- **Data galti se gaya:** Supabase Pro me Database → Backups → restore.

## Jo jaan-boojh ke nahi banaya (baad me chahiye to)
- Auto-renew aur renewal reminder e-mail (abhi har mahina/saal customer khud pay karta hai; period khatam hone pe app me 3 din ki warning dikhti hai, phir lock).
- SMS / WhatsApp alert (abhi e-mail + app).
- 24 mahine se purani readings ki report (data hourly summary me rakha hai).
