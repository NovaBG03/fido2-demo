import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import type {
  AuthenticatorTransportFuture,
} from "@simplewebauthn/server";

const rpName = "FIDO2 Демо";
const rpID = "localhost";
const origin = "http://localhost:3000";

// In-memory storage
interface StoredCredential {
  credentialID: string;
  credentialPublicKey: Uint8Array;
  counter: number;
  transports?: AuthenticatorTransportFuture[];
}

interface User {
  id: string;
  username: string;
  credentials: StoredCredential[];
}

const users = new Map<string, User>();
const challenges = new Map<string, string>();

function getOrCreateUser(username: string): User {
  let user = users.get(username);
  if (!user) {
    const id = crypto.randomUUID();
    user = { id, username, credentials: [] };
    users.set(username, user);
  }
  return user;
}

function bufToHex(buf: Uint8Array): string {
  return Array.from(buf)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function bufToBase64url(buf: Uint8Array): string {
  const base64 = btoa(String.fromCharCode(...buf));
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const server = Bun.serve({
  port: 3000,
  async fetch(req) {
    const url = new URL(req.url);

    // API routes
    if (url.pathname.startsWith("/api/")) {
      const headers = { "Content-Type": "application/json" };

      // Registration: generate options
      if (url.pathname === "/api/register/options" && req.method === "POST") {
        const body = await req.json();
        const { username, mode } = body;
        const user = getOrCreateUser(username);

        const isPasskey = mode === "passkey";

        const options = await generateRegistrationOptions({
          rpName,
          rpID,
          userName: username,
          userDisplayName: username,
          userID: new TextEncoder().encode(user.id),
          attestationType: isPasskey ? "none" : "direct",
          authenticatorSelection: {
            residentKey: isPasskey ? "required" : "discouraged",
            userVerification: isPasskey ? "required" : "preferred",
            ...(isPasskey ? {} : { authenticatorAttachment: "cross-platform" }),
          },
          excludeCredentials: user.credentials.map((c) => ({
            id: c.credentialID,
            type: "public-key",
            transports: c.transports,
          })),
        });

        challenges.set(username, options.challenge);

        const challengeBytes = Uint8Array.from(atob(options.challenge.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));

        console.log(`\n===== РЕГИСТРАЦИЯ: Генериране на опции =====`);
        console.log(`Потребител: ${username}`);
        console.log(`Режим: ${isPasskey ? "Passkey" : "Хардуерен ключ"}`);
        console.log(`Challenge (base64url): ${options.challenge}`);
        console.log(`Challenge (hex): ${bufToHex(challengeBytes)}`);
        console.log(`RP ID: ${rpID}`);
        console.log(`RP Name: ${rpName}`);
        console.log(`Attestation: ${isPasskey ? "none" : "direct"}`);
        console.log(`Resident Key: ${isPasskey ? "required" : "discouraged"}`);

        return new Response(
          JSON.stringify({
            options,
            debug: {
              challengeBase64url: options.challenge,
              challengeHex: bufToHex(challengeBytes),
              rpID,
              rpName,
              attestationType: isPasskey ? "none" : "direct",
              residentKey: isPasskey ? "required" : "discouraged",
              userVerification: isPasskey ? "required" : "preferred",
              authenticatorAttachment: isPasskey ? "any" : "cross-platform",
            },
          }),
          { headers }
        );
      }

      // Registration: verify
      if (url.pathname === "/api/register/verify" && req.method === "POST") {
        const body = await req.json();
        const { username, response: attResponse } = body;
        const expectedChallenge = challenges.get(username);

        if (!expectedChallenge) {
          return new Response(JSON.stringify({ error: "No challenge found" }), {
            status: 400,
            headers,
          });
        }

        try {
          const verification = await verifyRegistrationResponse({
            response: attResponse,
            expectedChallenge,
            expectedOrigin: origin,
            expectedRPID: rpID,
          });

          console.log(`\n===== РЕГИСТРАЦИЯ: Верификация =====`);
          console.log(`Verified: ${verification.verified}`);
          if (verification.registrationInfo) {
            const info = verification.registrationInfo;
            console.log(`Credential ID: ${info.credential.id}`);
            console.log(`Public Key (hex): ${bufToHex(info.credential.publicKey)}`);
            console.log(`Counter: ${info.credential.counter}`);
            console.log(`Credential Type: ${info.credentialType}`);
            console.log(`Attestation type: ${info.attestationObject ? "present" : "none"}`);
          }

          if (verification.verified && verification.registrationInfo) {
            const { credential } = verification.registrationInfo;
            const user = getOrCreateUser(username);
            user.credentials.push({
              credentialID: credential.id,
              credentialPublicKey: credential.publicKey,
              counter: credential.counter,
              transports: attResponse.response.transports,
            });

            return new Response(
              JSON.stringify({
                verified: true,
                debug: {
                  credentialId: credential.id,
                  publicKeyHex: bufToHex(credential.publicKey),
                  publicKeyBase64url: bufToBase64url(credential.publicKey),
                  counter: credential.counter,
                  credentialType: verification.registrationInfo.credentialType,
                  aaguid: verification.registrationInfo.aaguid,
                },
              }),
              { headers }
            );
          }

          return new Response(JSON.stringify({ verified: false }), { headers });
        } catch (err: any) {
          console.error("Registration verification error:", err);
          return new Response(
            JSON.stringify({ error: err.message }),
            { status: 400, headers }
          );
        }
      }

      // Authentication: generate options
      if (url.pathname === "/api/login/options" && req.method === "POST") {
        const body = await req.json();
        const { username, mode } = body;
        const isPasskey = mode === "passkey";

        let allowCredentials: any[] | undefined;
        if (!isPasskey && username) {
          const user = users.get(username);
          if (user) {
            allowCredentials = user.credentials.map((c) => ({
              id: c.credentialID,
              type: "public-key",
              transports: c.transports,
            }));
          }
        }

        const options = await generateAuthenticationOptions({
          rpID,
          userVerification: isPasskey ? "required" : "preferred",
          allowCredentials: isPasskey ? [] : allowCredentials,
        });

        // Store challenge by username or a generic key for passkey mode
        const challengeKey = username || "__passkey__";
        challenges.set(challengeKey, options.challenge);

        const challengeBytes = Uint8Array.from(atob(options.challenge.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));

        console.log(`\n===== АВТЕНТИКАЦИЯ: Генериране на опции =====`);
        console.log(`Режим: ${isPasskey ? "Passkey" : "Хардуерен ключ"}`);
        console.log(`Challenge (base64url): ${options.challenge}`);
        console.log(`Challenge (hex): ${bufToHex(challengeBytes)}`);
        console.log(`Allow Credentials: ${isPasskey ? "празен (discoverable)" : JSON.stringify(allowCredentials)}`);

        return new Response(
          JSON.stringify({
            options,
            debug: {
              challengeBase64url: options.challenge,
              challengeHex: bufToHex(challengeBytes),
              allowCredentials: isPasskey ? "[] (discoverable)" : allowCredentials,
              userVerification: isPasskey ? "required" : "preferred",
            },
          }),
          { headers }
        );
      }

      // Authentication: verify
      if (url.pathname === "/api/login/verify" && req.method === "POST") {
        const body = await req.json();
        const { username, response: authResponse, mode } = body;
        const isPasskey = mode === "passkey";
        const challengeKey = username || "__passkey__";
        const expectedChallenge = challenges.get(challengeKey);

        if (!expectedChallenge) {
          return new Response(JSON.stringify({ error: "No challenge found" }), {
            status: 400,
            headers,
          });
        }

        // Find the credential
        let credential: StoredCredential | undefined;
        let foundUsername: string | undefined;

        if (isPasskey) {
          // Search all users for the credential
          for (const [uname, user] of users) {
            const found = user.credentials.find(
              (c) => c.credentialID === authResponse.id
            );
            if (found) {
              credential = found;
              foundUsername = uname;
              break;
            }
          }
        } else {
          const user = users.get(username);
          if (user) {
            credential = user.credentials.find(
              (c) => c.credentialID === authResponse.id
            );
            foundUsername = username;
          }
        }

        if (!credential) {
          return new Response(
            JSON.stringify({ error: "Credential not found" }),
            { status: 400, headers }
          );
        }

        try {
          const verification = await verifyAuthenticationResponse({
            response: authResponse,
            expectedChallenge,
            expectedOrigin: origin,
            expectedRPID: rpID,
            credential: {
              id: credential.credentialID,
              publicKey: credential.credentialPublicKey,
              counter: credential.counter,
            },
          });

          console.log(`\n===== АВТЕНТИКАЦИЯ: Верификация =====`);
          console.log(`Verified: ${verification.verified}`);
          console.log(`Username: ${foundUsername}`);
          console.log(`New counter: ${verification.authenticationInfo.newCounter}`);

          if (verification.verified) {
            credential.counter = verification.authenticationInfo.newCounter;
          }

          return new Response(
            JSON.stringify({
              verified: verification.verified,
              username: foundUsername,
              debug: {
                credentialId: credential.credentialID,
                publicKeyHex: bufToHex(credential.credentialPublicKey),
                oldCounter: credential.counter,
                newCounter: verification.authenticationInfo.newCounter,
                credentialBackedUp: verification.authenticationInfo.credentialBackedUp,
              },
            }),
            { headers }
          );
        } catch (err: any) {
          console.error("Authentication verification error:", err);
          return new Response(
            JSON.stringify({ error: err.message }),
            { status: 400, headers }
          );
        }
      }

      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
        headers,
      });
    }

    // Serve static files from build output
    const filePath = url.pathname === "/" ? "/index.html" : url.pathname;
    const file = Bun.file(`./dist${filePath}`);
    if (await file.exists()) {
      return new Response(file);
    }

    // Fallback to index.html for SPA routing
    return new Response(Bun.file("./dist/index.html"));
  },
});

console.log(`🔐 FIDO2 Demo сървърът работи на http://localhost:${server.port}`);
