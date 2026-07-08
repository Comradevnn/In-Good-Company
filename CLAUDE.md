# In Good Company

This app matches volunteers with charity shifts. We're building it as:
- Frontend: React Native (via Expo)
- Backend: Node.js + Express
- Database: SQLite

There's a specs folder with the product design already written. Read the
relevant one before building anything:
- For the overall product and features: specs/volunteer-pairing-app-master-prompt.md
- For how matching between users works: specs/in-good-company-matching-prompt.md
- For ID verification and security: specs/identity-verification-encryption-spec.md
- For what to test before calling something done: specs/in-good-company-test-prompt.md
- For what the screens should look like: specs/plotline.html

Note: specs/plotline.html is a visual reference for what each screen should
look like, not literal code to reuse — it's plain HTML/CSS, not React Native.

Always read the relevant file above before building that part of the app.
Ask me before making any big decision that isn't already answered in these files.

## Ports for self-verification

The user runs their own long-lived copies of the backend on port 3000 and
Metro on port 8081. Never start a server on those ports — if you need to run
the backend or Metro yourself to verify a change, always use port 3050 for
the backend and port 8090 for Metro instead:
- Backend: `PORT=3050 node index.js` (from backend/)
- Metro: `npx expo start --port 8090` (from mobile/)
