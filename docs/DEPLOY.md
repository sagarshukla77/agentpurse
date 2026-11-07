# Deploying on Render

1. Push the repo to GitHub (public).
2. Claim the hackathon's Render credits (link on the hackathon's Render sponsor page) and add them to your Render account.
3. In Render: **New → Blueprint**, pick the repo. Render reads `render.yaml` and asks for the values marked `sync: false`:
   - `ENCRYPTION_KEY`: run `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
   - `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`: from your **sandbox** app (US business account)
   - `DEMO_VENDOR_EMAIL_*`: the sandbox **personal** account emails. They are read once, when the database is first seeded
   - `GEMINI_API_KEY`: from aistudio.google.com/apikey
   - `PAYPAL_WEBHOOK_ID`: leave empty for now
4. Wait for the first deploy. The first start seeds the database and prints the demo logins to the service **Logs**.
5. Open `https://<your-service>.onrender.com`, sign in with a demo role button, run the Playground.
6. Create the PayPal webhook: developer dashboard, your app, Webhooks, add `https://<your-service>.onrender.com/api/webhooks/paypal`, subscribe to the `PAYMENT.PAYOUTS-ITEM.*` events, copy the **Webhook ID** into `PAYPAL_WEBHOOK_ID` on Render, and let it redeploy.
7. Check `https://<your-service>.onrender.com/api/health` returns `{"ok":true}`.

If you change the vendor emails later, the seed will not overwrite them ("Already seeded"). Reset by deleting and recreating the database.
