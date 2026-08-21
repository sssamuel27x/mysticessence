# Mystic Essence production setup

The application is ready for Firebase Authentication, Firestore, Storage,
Cloud Functions, transactional email and Ifthenpay Pay by Link. No secret is
stored in the browser bundle.

## Firebase console

1. Firebase project: `mystic-essence`.
2. Web app configuration is read from `.env.local` (which is ignored by Git).
3. Enable Authentication providers `Email/Password` and `Google`.
4. Firestore location: `europe-southwest1` (Madrid).
5. Firestore rules and indexes can be deployed on the Spark plan:

```bash
npx firebase-tools login
npx firebase-tools deploy --only firestore
```

The project is now on the Blaze free trial. The order notification functions
`notifyOwnerOfOrder` and `notifyCustomerOfPayment` are deployed in
`europe-west1`. Payment functions remain disabled until Ifthenpay credentials
are available:

```bash
npx firebase-tools deploy --only functions
```

The security rules make products publicly readable but writable only by the
authorised Mystic Essence administrator. Orders are created only by a Cloud
Function. Customers can read only their own orders. Product images will be
public, but only the administrator will be able to upload an image under 5 MB.

## Secrets

Set the backend secrets without adding them to any `.env` file:

```bash
npx firebase-tools functions:secrets:set IFTHENPAY_AUTH_TOKEN
npx firebase-tools functions:secrets:set IFTHENPAY_CALLBACK_KEY
npx firebase-tools functions:secrets:set OWNER_EMAIL
```

Set `PUBLIC_SITE_URL` as a Functions parameter during deployment when the CLI
asks for it. Configure the Ifthenpay callback URL as the deployed
`ifthenpayCallback` function URL and include the same anti-phishing key.

## Email

Install the official Firebase `firestore-send-email` extension. Configure its
collection as `mail` and provide the SMTP credentials of the sender account.
The Gmail account currently does not offer App Passwords, so the extension is
not installed yet. Use a transactional SMTP provider or enable a supported
Google authentication method before completing the installation.
The backend writes branded messages to that protected collection for:

- a new-order notification to the owner;
- a paid-order confirmation to the buyer;
- a tracking email when the admin confirms an order as shipped.

## Administrator

The Google account `mysticessenceweb@gmail.com` is already registered. Its
Firebase user identifier is the only identifier authorised as administrator
by the deployed Firestore rules and the local web configuration. The optional
`functions/set-admin.js` helper can replace this with a custom claim later,
once a trusted server environment is available.

## Catalogue

The 149 catalogue products are already stored in Firestore. Product editing,
deletion and image uploads now persist in Firebase. The default Storage bucket
uses the Firebase no-cost location and `VITE_STORAGE_ENABLED=true` enables the
image selector in the administrator panel.
