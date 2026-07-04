# Quote Request Form — Google Setup Instructions

The Request-a-Quote form on `contact.html` is already built and styled to match the site.
It just needs a Google endpoint so submissions email **contact@tootagroup.com**.

**Until this is set up, the form still works** — it opens the visitor's email app with
everything pre-filled. So there's no rush, but Option A below takes about 10 minutes.

---

## Option A (recommended): Google Apps Script webhook

This keeps the site's own styled form and emails every submission to the Toota inbox.
No third-party services, no monthly cost — it runs on the Google account you choose.

1. Log into the Google account that should receive/send the notifications
   (e.g. the tootagroup Google Workspace account).
2. Go to **https://script.google.com** → **New project**.
3. Delete the placeholder code and paste this:

   ```javascript
   function doPost(e) {
     var p = e.parameter;
     MailApp.sendEmail({
       to: "contact@tootagroup.com",
       replyTo: p.email || "",
       subject: "Website Quote Request — " + (p.name || "Unknown"),
       body:
         "Name:         " + (p.name || "") + "\n" +
         "Organization: " + (p.organization || "") + "\n" +
         "Email:        " + (p.email || "") + "\n" +
         "Phone:        " + (p.phone || "") + "\n" +
         "Interest:     " + (p.interest || "") + "\n\n" +
         "Details:\n" + (p.message || "")
     });
     return ContentService.createTextOutput("OK");
   }
   ```

4. Click **Deploy → New deployment**.
5. Click the gear icon next to "Select type" → choose **Web app**.
6. Settings:
   - **Execute as:** Me
   - **Who has access:** Anyone  ← required so the website can POST to it
7. Click **Deploy**, authorize the permissions prompt, and **copy the Web app URL**
   (looks like `https://script.google.com/macros/s/AKfycb.../exec`).
8. In `contact.html`, find this line and paste the URL into `data-endpoint`:

   ```html
   <form class="quote" id="quote-form" data-endpoint="">
   ```

   becomes:

   ```html
   <form class="quote" id="quote-form" data-endpoint="https://script.google.com/macros/s/AKfycb.../exec">
   ```

9. Push/redeploy the site. Test by submitting the form — the email arrives in
   contact@tootagroup.com within seconds. (Free Gmail allows ~100 emails/day,
   Google Workspace ~1,500/day — far more than enough.)

**Optional:** to also log every request in a spreadsheet, create a Google Sheet,
then add this line inside `doPost` before `return` (replace SHEET_ID):

```javascript
SpreadsheetApp.openById("SHEET_ID").getSheets()[0]
  .appendRow([new Date(), p.name, p.organization, p.email, p.phone, p.interest, p.message]);
```

## Option B: embed a classic Google Form

If you'd rather manage everything in Google Forms:

1. Create the form at **https://forms.google.com** with fields:
   Name, Organization, Email, Phone, What do you need? (dropdown), Details (paragraph).
2. In the form's **Responses** tab, click the ⋮ menu → **Get email notifications
   for new responses** (sends to the form owner's inbox).
3. Click **Send → < > (embed)** and copy the iframe code.
4. In `contact.html`, replace the entire `<form class="quote" ...>...</form>` block
   with the iframe, wrapped like this so it fits the design:

   ```html
   <div style="background:#fff;border-radius:10px;overflow:hidden;">
     <iframe src="https://docs.google.com/forms/d/e/FORM_ID/viewform?embedded=true"
       width="100%" height="1100" frameborder="0">Loading…</iframe>
   </div>
   ```

Trade-off: Option B is zero-code but the embedded form shows Google's white styling
inside the dark site and adds a Google banner. Option A looks native. Both email you.
