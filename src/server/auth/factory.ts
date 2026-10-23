import "server-only";
import { randomUUID } from "node:crypto";
import { createEmailVerificationToken } from "better-auth/api";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "@better-auth/prisma-adapter";
import type { PrismaClient } from "../db/generated/client";
import { createAuthMailer, type AuthMailer } from "../mail/outbox";
import type { AuthConfig } from "./config";

export function createAuthentication(db: PrismaClient, config: AuthConfig, mailer?: AuthMailer) {
  const email = config.emailEnabled ? (mailer ?? createAuthMailer(db, config.baseURL)) : undefined;
  return betterAuth({
    appName: "Mory", secret: config.secret, baseURL: config.baseURL,
    trustedOrigins: [config.baseURL], logger: { disabled: true },
    database: prismaAdapter(db, { provider: "postgresql", transaction: true }),
    user: { modelName: "User", fields: { name: "displayName" }, changeEmail: { enabled: false }, deleteUser: { enabled: false } },
    session: { modelName: "AuthSession", expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24, cookieCache: { enabled: false } },
    account: { modelName: "AuthAccount", accountLinking: { enabled: false } },
    verification: { modelName: "AuthVerification", storeIdentifier: "hashed" },
    emailVerification: email ? { sendOnSignUp: true, sendOnSignIn: false, autoSignInAfterVerification: false, expiresIn: 3600,
      sendVerificationEmail: async ({ user }) => {
        const token = await createEmailVerificationToken(config.secret, user.email, undefined, 3600, { moryUserId: user.id, jti: randomUUID() });
        await email.enqueue("VERIFY", { email: user.email, token, userId: user.id });
      } } : undefined,
    emailAndPassword: { enabled: true, minPasswordLength: 12, maxPasswordLength: 128, disableSignUp: !config.allowSignup, autoSignIn: !email, requireEmailVerification: !!email, revokeSessionsOnPasswordReset: true, resetPasswordTokenExpiresIn: 900,
      sendResetPassword: email ? async ({ user, token }) => { await email.enqueue("RESET", { email: user.email, token, userId: user.id }); } : undefined },
    rateLimit: { enabled: true, storage: "database", modelName: "AuthRateLimit", window: 60, max: 60,
      customRules: { "/sign-in/email": { window: 60, max: 5 }, "/sign-up/email": { window: 60, max: 3 },
        "/request-password-reset": { window: 60, max: 3 }, "/send-verification-email": { window: 60, max: 3 },
        "/reset-password": { window: 60, max: 5 }, "/verify-email": { window: 60, max: 5 } } },
    advanced: { database: { generateId: "uuid" }, cookiePrefix: "mory", useSecureCookies: config.secure,
      defaultCookieAttributes: { httpOnly: true, sameSite: "lax", path: "/" },
      // Public handler strips this synthetic header and only recreates it after authenticated edge validation.
      ipAddress: { ipAddressHeaders: ["x-mory-verified-ip"] },
    },
  });
}
