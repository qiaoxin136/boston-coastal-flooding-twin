import { Amplify } from 'aws-amplify';
import {
  confirmResetPassword,
  confirmSignIn,
  confirmSignUp,
  fetchAuthSession,
  fetchUserAttributes,
  getCurrentUser,
  resendSignUpCode,
  resetPassword,
  signIn,
  signOut,
  signUp,
} from 'aws-amplify/auth';

export interface CognitoSpaConfig {
  userPoolId: string;
  userPoolClientId: string;
  region: string;
  source: 'env' | 'storage' | 'none';
}

export interface AuthUserSession {
  mode: 'cognito' | 'local-preview';
  email: string;
  username: string;
  sub?: string;
}

export type SignInOutcome =
  | { status: 'SIGNED_IN'; session: AuthUserSession }
  | { status: 'CONFIRM_SIGN_UP'; email: string }
  | { status: 'NEW_PASSWORD_REQUIRED' }
  | { status: 'MFA_CODE_REQUIRED'; deliveryMedium?: string }
  | { status: 'RESET_PASSWORD_REQUIRED'; email: string };

const STORAGE_CONFIG_KEY = 'boston_flood_cognito_spa_config_v1';

const USER_POOL_ID_REGEX = /^[a-z]{2}-[a-z0-9-]+-\d_[A-Za-z0-9]+$/;
const CLIENT_ID_REGEX = /^[A-Za-z0-9_-]{10,128}$/;

function isPlaceholder(value: string | undefined): boolean {
  if (!value) return true;
  const trimmed = value.trim();
  if (!trimmed) return true;
  return /^your_/i.test(trimmed) || /^<.*>$/.test(trimmed);
}

export function deriveRegionFromPoolId(userPoolId: string): string {
  const trimmed = userPoolId.trim();
  const idx = trimmed.indexOf('_');
  return idx > 0 ? trimmed.slice(0, idx) : 'us-east-1';
}

export function maskPoolId(userPoolId: string): string {
  const trimmed = userPoolId.trim();
  const idx = trimmed.indexOf('_');
  if (idx < 0 || trimmed.length <= idx + 5) return trimmed;
  const region = trimmed.slice(0, idx);
  const tail = trimmed.slice(-4);
  return `${region}_••••${tail}`;
}

export function validateCognitoInputs(
  userPoolId: string,
  userPoolClientId: string
): string | null {
  const pool = userPoolId.trim();
  const client = userPoolClientId.trim();
  if (!USER_POOL_ID_REGEX.test(pool)) {
    return 'Enter a valid Cognito User Pool ID (for example: us-east-1_AbCdEf123).';
  }
  if (!CLIENT_ID_REGEX.test(client)) {
    return 'Enter a valid Cognito SPA App Client ID (public client without a client secret).';
  }
  return null;
}

export function hasStoredCognitoOverride(): boolean {
  try {
    return Boolean(window.localStorage.getItem(STORAGE_CONFIG_KEY));
  } catch {
    return false;
  }
}

export function loadCognitoConfig(): CognitoSpaConfig {
  try {
    const raw = window.localStorage.getItem(STORAGE_CONFIG_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<CognitoSpaConfig>;
      if (
        parsed.userPoolId &&
        parsed.userPoolClientId &&
        !validateCognitoInputs(parsed.userPoolId, parsed.userPoolClientId)
      ) {
        const pool = parsed.userPoolId.trim();
        return {
          userPoolId: pool,
          userPoolClientId: parsed.userPoolClientId.trim(),
          region: parsed.region?.trim() || deriveRegionFromPoolId(pool),
          source: 'storage',
        };
      }
    }
  } catch {
    // Ignore malformed storage data and fall back to env
  }

  const envPool = import.meta.env.VITE_COGNITO_USER_POOL_ID;
  const envClient = import.meta.env.VITE_COGNITO_CLIENT_ID;
  const envRegion = import.meta.env.VITE_COGNITO_REGION;

  if (
    !isPlaceholder(envPool) &&
    !isPlaceholder(envClient) &&
    envPool &&
    envClient &&
    !validateCognitoInputs(envPool, envClient)
  ) {
    const pool = envPool.trim();
    return {
      userPoolId: pool,
      userPoolClientId: envClient.trim(),
      region:
        !isPlaceholder(envRegion) && envRegion
          ? envRegion.trim()
          : deriveRegionFromPoolId(pool),
      source: 'env',
    };
  }

  return {
    userPoolId: '',
    userPoolClientId: '',
    region:
      !isPlaceholder(envRegion) && envRegion ? envRegion.trim() : 'us-east-1',
    source: 'none',
  };
}

export function isCognitoConfigured(config: CognitoSpaConfig): boolean {
  return (
    config.source !== 'none' &&
    validateCognitoInputs(config.userPoolId, config.userPoolClientId) === null
  );
}

export function saveCognitoConfigOverride(
  userPoolId: string,
  userPoolClientId: string
): CognitoSpaConfig {
  const validationError = validateCognitoInputs(userPoolId, userPoolClientId);
  if (validationError) {
    throw new Error(validationError);
  }
  const pool = userPoolId.trim();
  const client = userPoolClientId.trim();
  const next: CognitoSpaConfig = {
    userPoolId: pool,
    userPoolClientId: client,
    region: deriveRegionFromPoolId(pool),
    source: 'storage',
  };
  window.localStorage.setItem(
    STORAGE_CONFIG_KEY,
    JSON.stringify({
      userPoolId: next.userPoolId,
      userPoolClientId: next.userPoolClientId,
      region: next.region,
    })
  );
  configureAmplifyCognito(next);
  return next;
}

export function clearCognitoConfigOverride(): CognitoSpaConfig {
  try {
    window.localStorage.removeItem(STORAGE_CONFIG_KEY);
  } catch {
    // Ignore storage removal errors
  }
  const fallback = loadCognitoConfig();
  if (isCognitoConfigured(fallback)) {
    configureAmplifyCognito(fallback);
  }
  return fallback;
}

let configuredKey = '';

export function configureAmplifyCognito(config: CognitoSpaConfig): void {
  if (!isCognitoConfigured(config)) return;
  const nextKey = `${config.userPoolId}:${config.userPoolClientId}`;
  if (configuredKey === nextKey) return;

  Amplify.configure({
    Auth: {
      Cognito: {
        userPoolId: config.userPoolId,
        userPoolClientId: config.userPoolClientId,
        loginWith: {
          email: true,
        },
      },
    },
  });
  configuredKey = nextKey;
}

async function buildSignedInSession(
  fallbackEmail?: string
): Promise<AuthUserSession> {
  const currentUser = await getCurrentUser();
  const authSession = await fetchAuthSession();

  const idTokenPayload = authSession.tokens?.idToken?.payload;
  const tokenEmail =
    typeof idTokenPayload?.email === 'string'
      ? idTokenPayload.email
      : undefined;
  const tokenSub =
    typeof idTokenPayload?.sub === 'string' ? idTokenPayload.sub : undefined;

  let attrEmail: string | undefined;
  if (!tokenEmail && !currentUser.signInDetails?.loginId) {
    try {
      const attrs = await fetchUserAttributes();
      attrEmail = attrs.email;
    } catch {
      // App client may not include aws.cognito.signin.user.admin scope
    }
  }

  const resolvedEmail =
    tokenEmail ||
    currentUser.signInDetails?.loginId ||
    attrEmail ||
    fallbackEmail ||
    currentUser.username;

  return {
    mode: 'cognito',
    email: resolvedEmail,
    username: currentUser.username,
    sub: tokenSub || currentUser.userId,
  };
}

export async function restoreCognitoSession(
  config: CognitoSpaConfig
): Promise<AuthUserSession | null> {
  if (!isCognitoConfigured(config)) return null;
  configureAmplifyCognito(config);
  try {
    return await buildSignedInSession();
  } catch {
    return null;
  }
}

export async function signInWithCognito(
  config: CognitoSpaConfig,
  email: string,
  password: string
): Promise<SignInOutcome> {
  configureAmplifyCognito(config);
  const cleanEmail = email.trim();

  try {
    await signOut();
  } catch {
    // Ignore when not signed in
  }

  const result = await signIn({
    username: cleanEmail,
    password,
  });

  if (result.isSignedIn || result.nextStep.signInStep === 'DONE') {
    const session = await buildSignedInSession(cleanEmail);
    return { status: 'SIGNED_IN', session };
  }

  switch (result.nextStep.signInStep) {
    case 'CONFIRM_SIGN_UP':
      return { status: 'CONFIRM_SIGN_UP', email: cleanEmail };
    case 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED':
      return { status: 'NEW_PASSWORD_REQUIRED' };
    case 'RESET_PASSWORD':
      return { status: 'RESET_PASSWORD_REQUIRED', email: cleanEmail };
    case 'CONFIRM_SIGN_IN_WITH_TOTP_CODE':
      return { status: 'MFA_CODE_REQUIRED', deliveryMedium: 'Authenticator app' };
    case 'CONFIRM_SIGN_IN_WITH_SMS_CODE':
    case 'CONFIRM_SIGN_IN_WITH_EMAIL_CODE':
      return {
        status: 'MFA_CODE_REQUIRED',
        deliveryMedium: result.nextStep.codeDeliveryDetails?.destination,
      };
    default:
      throw new Error(
        `Unsupported sign-in challenge (${result.nextStep.signInStep}).`
      );
  }
}

export async function completeCognitoChallenge(
  responseValue: string,
  fallbackEmail?: string
): Promise<SignInOutcome> {
  const result = await confirmSignIn({
    challengeResponse: responseValue,
  });

  if (result.isSignedIn || result.nextStep.signInStep === 'DONE') {
    const session = await buildSignedInSession(fallbackEmail);
    return { status: 'SIGNED_IN', session };
  }

  if (result.nextStep.signInStep === 'CONFIRM_SIGN_IN_WITH_TOTP_CODE') {
    return { status: 'MFA_CODE_REQUIRED', deliveryMedium: 'Authenticator app' };
  }
  if (
    result.nextStep.signInStep === 'CONFIRM_SIGN_IN_WITH_SMS_CODE' ||
    result.nextStep.signInStep === 'CONFIRM_SIGN_IN_WITH_EMAIL_CODE'
  ) {
    return {
      status: 'MFA_CODE_REQUIRED',
      deliveryMedium: result.nextStep.codeDeliveryDetails?.destination,
    };
  }

  throw new Error(
    `Additional verification step required: ${result.nextStep.signInStep}`
  );
}

export async function signUpWithCognito(
  config: CognitoSpaConfig,
  email: string,
  password: string
): Promise<{ isSignUpComplete: boolean; destination?: string }> {
  configureAmplifyCognito(config);
  const cleanEmail = email.trim();
  const result = await signUp({
    username: cleanEmail,
    password,
    options: {
      userAttributes: {
        email: cleanEmail,
      },
    },
  });

  const destination =
    result.nextStep.signUpStep === 'CONFIRM_SIGN_UP'
      ? result.nextStep.codeDeliveryDetails?.destination
      : undefined;

  return {
    isSignUpComplete: result.isSignUpComplete,
    destination,
  };
}

export async function confirmCognitoSignUpCode(
  config: CognitoSpaConfig,
  email: string,
  code: string
): Promise<void> {
  configureAmplifyCognito(config);
  await confirmSignUp({
    username: email.trim(),
    confirmationCode: code.trim(),
  });
}

export async function resendCognitoVerificationCode(
  config: CognitoSpaConfig,
  email: string
): Promise<string | undefined> {
  configureAmplifyCognito(config);
  const details = await resendSignUpCode({
    username: email.trim(),
  });
  return details.destination;
}

export async function requestCognitoPasswordReset(
  config: CognitoSpaConfig,
  email: string
): Promise<string | undefined> {
  configureAmplifyCognito(config);
  const output = await resetPassword({
    username: email.trim(),
  });
  if (output.nextStep.resetPasswordStep === 'CONFIRM_RESET_PASSWORD_WITH_CODE') {
    return output.nextStep.codeDeliveryDetails.destination;
  }
  return undefined;
}

export async function confirmCognitoPasswordReset(
  config: CognitoSpaConfig,
  email: string,
  code: string,
  newPassword: string
): Promise<void> {
  configureAmplifyCognito(config);
  await confirmResetPassword({
    username: email.trim(),
    confirmationCode: code.trim(),
    newPassword,
  });
}

export async function signOutCognito(
  mode: 'cognito' | 'local-preview'
): Promise<void> {
  if (mode === 'cognito') {
    await signOut();
  }
}

export function formatCognitoError(err: unknown): string {
  if (!err || typeof err !== 'object') {
    return 'Sign in failed. Check your network connection and try again.';
  }

  const name = 'name' in err && typeof err.name === 'string' ? err.name : '';
  const message =
    'message' in err && typeof err.message === 'string' ? err.message : '';

  switch (name) {
    case 'NotAuthorizedException':
      if (message.toLowerCase().includes('secret hash')) {
        return 'Sign-in client configuration error: public client cannot require a client secret.';
      }
      return 'Incorrect email or password.';
    case 'UserNotFoundException':
      return 'No account found for that email address.';
    case 'UsernameExistsException':
      return 'An account with this email already exists. Sign in instead.';
    case 'CodeMismatchException':
      return 'Invalid verification code. Check the 6-digit code and try again.';
    case 'ExpiredCodeException':
      return 'That verification code has expired. Request a new code.';
    case 'InvalidPasswordException':
      return (
        message ||
        'Password does not meet security requirements (8+ characters, upper/lowercase, number, and symbol).'
      );
    case 'LimitExceededException':
    case 'TooManyRequestsException':
      return 'Too many attempts. Wait a moment before trying again.';
    case 'InvalidParameterException':
      return message || 'Check the email and password format and try again.';
    default:
      return (
        message ||
        'Sign in failed. Check your credentials and try again.'
      );
  }
}
