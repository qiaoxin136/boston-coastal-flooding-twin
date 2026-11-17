import React, { useState } from 'react';
import {
  completeCognitoChallenge,
  confirmCognitoPasswordReset,
  confirmCognitoSignUpCode,
  formatCognitoError,
  isCognitoConfigured,
  requestCognitoPasswordReset,
  resendCognitoVerificationCode,
  signInWithCognito,
  signUpWithCognito,
} from '../auth/cognitoAuth';
import type { AuthUserSession, CognitoSpaConfig } from '../auth/cognitoAuth';
import { SURGE_500YR_BANDS } from '../config/floodConfig';

type AuthStep =
  | 'sign-in'
  | 'sign-up'
  | 'verify-signup'
  | 'new-password'
  | 'mfa-code'
  | 'forgot-request'
  | 'forgot-confirm';

interface CognitoAuthGateProps {
  config: CognitoSpaConfig;
  onAuthenticated: (session: AuthUserSession) => void;
}

export const CognitoAuthGate: React.FC<CognitoAuthGateProps> = ({
  config,
  onAuthenticated,
}) => {
  const configured = isCognitoConfigured(config);

  const [step, setStep] = useState<AuthStep>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [code, setCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);
  const [deliveryHint, setDeliveryHint] = useState<string | undefined>(
    undefined
  );

  const resetMessages = () => {
    setErrorMsg(null);
    setInfoMsg(null);
  };

  const switchPrimaryTab = (target: 'sign-in' | 'sign-up') => {
    resetMessages();
    setCode('');
    setConfirmPassword('');
    setStep(target);
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    resetMessages();

    if (!configured) {
      setErrorMsg(
        'Sign-in service is not configured. Continue in Local Preview below.'
      );
      return;
    }

    setBusy(true);
    try {
      const outcome = await signInWithCognito(config, email, password);
      if (outcome.status === 'SIGNED_IN') {
        onAuthenticated(outcome.session);
        return;
      }
      if (outcome.status === 'CONFIRM_SIGN_UP') {
        setStep('verify-signup');
        setInfoMsg(
          'Your account needs email verification. Enter the 6-digit code sent to your email.'
        );
        return;
      }
      if (outcome.status === 'NEW_PASSWORD_REQUIRED') {
        setPassword('');
        setConfirmPassword('');
        setStep('new-password');
        setInfoMsg(
          'Temporary password accepted. Choose a new permanent password to finish signing in.'
        );
        return;
      }
      if (outcome.status === 'MFA_CODE_REQUIRED') {
        setCode('');
        setDeliveryHint(outcome.deliveryMedium);
        setStep('mfa-code');
        return;
      }
      if (outcome.status === 'RESET_PASSWORD_REQUIRED') {
        const dest = await requestCognitoPasswordReset(config, outcome.email);
        setDeliveryHint(dest);
        setPassword('');
        setConfirmPassword('');
        setCode('');
        setStep('forgot-confirm');
        setInfoMsg('A password reset is required for your account.');
      }
    } catch (err) {
      setErrorMsg(formatCognitoError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    resetMessages();

    if (!configured) {
      setErrorMsg(
        'Sign-in service is not configured in this environment.'
      );
      return;
    }

    if (password !== confirmPassword) {
      setErrorMsg('Passwords do not match.');
      return;
    }

    setBusy(true);
    try {
      const { isSignUpComplete, destination } = await signUpWithCognito(
        config,
        email,
        password
      );
      if (isSignUpComplete) {
        const outcome = await signInWithCognito(config, email, password);
        if (outcome.status === 'SIGNED_IN') {
          onAuthenticated(outcome.session);
          return;
        }
        setStep('sign-in');
        setInfoMsg('Account created. Sign in with your email and password.');
      } else {
        setDeliveryHint(destination);
        setCode('');
        setStep('verify-signup');
        setInfoMsg(
          `Enter the 6-digit verification code sent to ${destination || email.trim()}.`
        );
      }
    } catch (err) {
      setErrorMsg(formatCognitoError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleVerifySignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    resetMessages();
    setBusy(true);
    try {
      await confirmCognitoSignUpCode(config, email, code);
      if (password) {
        const outcome = await signInWithCognito(config, email, password);
        if (outcome.status === 'SIGNED_IN') {
          onAuthenticated(outcome.session);
          return;
        }
      }
      setCode('');
      setStep('sign-in');
      setInfoMsg('Email verified. Sign in to open the 3D flood twin.');
    } catch (err) {
      setErrorMsg(formatCognitoError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleResendCode = async () => {
    resetMessages();
    setBusy(true);
    try {
      const dest = await resendCognitoVerificationCode(config, email);
      setInfoMsg(
        `Sent a new 6-digit verification code${dest ? ` to ${dest}` : ''}.`
      );
    } catch (err) {
      setErrorMsg(formatCognitoError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleCompleteNewPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    resetMessages();
    if (password !== confirmPassword) {
      setErrorMsg('Passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      const outcome = await completeCognitoChallenge(password, email);
      if (outcome.status === 'SIGNED_IN') {
        onAuthenticated(outcome.session);
        return;
      }
      if (outcome.status === 'MFA_CODE_REQUIRED') {
        setDeliveryHint(outcome.deliveryMedium);
        setCode('');
        setStep('mfa-code');
      }
    } catch (err) {
      setErrorMsg(formatCognitoError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleCompleteMfa = async (e: React.FormEvent) => {
    e.preventDefault();
    resetMessages();
    setBusy(true);
    try {
      const outcome = await completeCognitoChallenge(code.trim(), email);
      if (outcome.status === 'SIGNED_IN') {
        onAuthenticated(outcome.session);
      }
    } catch (err) {
      setErrorMsg(formatCognitoError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleStartForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    resetMessages();
    if (!configured) {
      setErrorMsg('Sign-in service is not configured in this environment.');
      return;
    }
    setBusy(true);
    try {
      const dest = await requestCognitoPasswordReset(config, email);
      setDeliveryHint(dest);
      setCode('');
      setPassword('');
      setConfirmPassword('');
      setStep('forgot-confirm');
      setInfoMsg(
        `Enter the reset code sent${dest ? ` to ${dest}` : ''} and choose a new password.`
      );
    } catch (err) {
      setErrorMsg(formatCognitoError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    resetMessages();
    if (password !== confirmPassword) {
      setErrorMsg('Passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      await confirmCognitoPasswordReset(config, email, code, password);
      setCode('');
      setConfirmPassword('');
      setStep('sign-in');
      setInfoMsg('Password updated. Sign in with your new password.');
    } catch (err) {
      setErrorMsg(formatCognitoError(err));
    } finally {
      setBusy(false);
    }
  };

  const isPrimaryTabStep = step === 'sign-in' || step === 'sign-up';

  return (
    <main className="auth-stage" aria-label="Sign in">
      <div className="auth-graticule" aria-hidden="true" />

      <div className="auth-corner-datum auth-corner-tl" aria-hidden="true">
        42.3601°N · 71.0510°W · BOSTON HARBOR
      </div>
      <div className="auth-corner-datum auth-corner-br" aria-hidden="true">
        NAVD88 SURGE DATUM · 500-YR MESH
      </div>

      <section className="auth-card">
        {/* Signature 5-band 500-yr coastal surge spectrum bar */}
        <div className="auth-surge-bar" aria-hidden="true">
          {SURGE_500YR_BANDS.map((band) => (
            <span
              key={band.id}
              style={{ backgroundColor: band.hex }}
              title={`${band.label} (${band.rangeText})`}
            />
          ))}
        </div>

        <header className="auth-header">
          <div className="masthead-eyebrow">
            <span
              className={`status-dot ${configured ? 'is-live' : ''}`}
              aria-hidden="true"
            />
            <span>Boston Coastal Flooding Twin</span>
          </div>

          <h1 className="auth-title">Sign in</h1>
        </header>

        <div className="auth-body">
          {isPrimaryTabStep && (
            <div className="auth-tabs" role="tablist" aria-label="Authentication mode">
              <button
                type="button"
                role="tab"
                aria-selected={step === 'sign-in'}
                className={step === 'sign-in' ? 'is-active' : ''}
                onClick={() => switchPrimaryTab('sign-in')}
              >
                Sign in
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={step === 'sign-up'}
                className={step === 'sign-up' ? 'is-active' : ''}
                onClick={() => switchPrimaryTab('sign-up')}
              >
                Create account
              </button>
            </div>
          )}

          {errorMsg && (
            <div className="auth-alert is-error" role="alert">
              {errorMsg}
            </div>
          )}

          {infoMsg && (
            <div className="auth-alert is-info" role="status">
              {infoMsg}
            </div>
          )}

          {step === 'sign-in' && (
            <form className="auth-form" onSubmit={handleSignIn}>
              <div className="field-group">
                <label htmlFor="cognito-signin-email">Email address</label>
                <input
                  id="cognito-signin-email"
                  type="email"
                  autoComplete="email"
                  required
                  placeholder="engineer@agency.gov"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              <div className="field-group">
                <div className="auth-label-row">
                  <label htmlFor="cognito-signin-password">Password</label>
                  <button
                    type="button"
                    className="auth-link-btn"
                    onClick={() => {
                      resetMessages();
                      setStep('forgot-request');
                    }}
                  >
                    Forgot password?
                  </button>
                </div>
                <div className="password-input-wrap">
                  <input
                    id="cognito-signin-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    required
                    placeholder="••••••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    className="password-toggle-btn"
                    onClick={() => setShowPassword((prev) => !prev)}
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                className="primary-btn auth-submit-btn"
                disabled={busy}
              >
                {busy ? 'Signing in…' : 'Sign in'}
              </button>
            </form>
          )}

          {step === 'sign-up' && (
            <form className="auth-form" onSubmit={handleSignUp}>
              <div className="field-group">
                <label htmlFor="cognito-signup-email">Work email</label>
                <input
                  id="cognito-signup-email"
                  type="email"
                  autoComplete="email"
                  required
                  placeholder="engineer@agency.gov"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              <div className="field-group">
                <label htmlFor="cognito-signup-password">Password</label>
                <div className="password-input-wrap">
                  <input
                    id="cognito-signup-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    required
                    minLength={8}
                    placeholder="8+ chars, upper/lower, number & symbol"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    className="password-toggle-btn"
                    onClick={() => setShowPassword((prev) => !prev)}
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>

              <div className="field-group">
                <label htmlFor="cognito-signup-confirm">Confirm password</label>
                <input
                  id="cognito-signup-confirm"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  minLength={8}
                  placeholder="Re-enter password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>

              <button
                type="submit"
                className="primary-btn auth-submit-btn"
                disabled={busy}
              >
                {busy ? 'Creating account…' : 'Create account'}
              </button>
            </form>
          )}

          {step === 'verify-signup' && (
            <form className="auth-form" onSubmit={handleVerifySignUp}>
              <div className="auth-step-header">
                <span className="dock-kicker">VERIFY EMAIL</span>
                <p className="auth-step-copy">
                  Enter the 6-digit verification code sent to{' '}
                  <strong>{deliveryHint || email}</strong>.
                </p>
              </div>

              <div className="field-group">
                <label htmlFor="cognito-verify-code">Verification code</label>
                <input
                  id="cognito-verify-code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                  className="auth-code-input"
                  placeholder="123456"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                />
              </div>

              <button
                type="submit"
                className="primary-btn auth-submit-btn"
                disabled={busy}
              >
                {busy ? 'Verifying…' : 'Verify & sign in'}
              </button>

              <div className="auth-secondary-row">
                <button
                  type="button"
                  className="auth-link-btn"
                  disabled={busy}
                  onClick={handleResendCode}
                >
                  Resend code
                </button>
                <button
                  type="button"
                  className="auth-link-btn"
                  onClick={() => switchPrimaryTab('sign-in')}
                >
                  Back to sign in
                </button>
              </div>
            </form>
          )}

          {step === 'new-password' && (
            <form className="auth-form" onSubmit={handleCompleteNewPassword}>
              <div className="auth-step-header">
                <span className="dock-kicker">SET NEW PASSWORD</span>
                <p className="auth-step-copy">
                  Choose a permanent password for <strong>{email}</strong>.
                </p>
              </div>

              <div className="field-group">
                <label htmlFor="cognito-new-password">New password</label>
                <input
                  id="cognito-new-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  minLength={8}
                  placeholder="8+ chars, upper/lower, number & symbol"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              <div className="field-group">
                <label htmlFor="cognito-new-confirm">Confirm new password</label>
                <input
                  id="cognito-new-confirm"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  minLength={8}
                  placeholder="Re-enter new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>

              <button
                type="submit"
                className="primary-btn auth-submit-btn"
                disabled={busy}
              >
                {busy ? 'Saving password…' : 'Save password & sign in'}
              </button>

              <button
                type="button"
                className="auth-link-btn"
                onClick={() => switchPrimaryTab('sign-in')}
              >
                Back to sign in
              </button>
            </form>
          )}

          {step === 'mfa-code' && (
            <form className="auth-form" onSubmit={handleCompleteMfa}>
              <div className="auth-step-header">
                <span className="dock-kicker">MULTI-FACTOR VERIFICATION</span>
                <p className="auth-step-copy">
                  Enter the security code from{' '}
                  <strong>{deliveryHint || 'your authenticator'}</strong>.
                </p>
              </div>

              <div className="field-group">
                <label htmlFor="cognito-mfa-code">Security code</label>
                <input
                  id="cognito-mfa-code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                  className="auth-code-input"
                  placeholder="123456"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                />
              </div>

              <button
                type="submit"
                className="primary-btn auth-submit-btn"
                disabled={busy}
              >
                {busy ? 'Verifying…' : 'Verify code'}
              </button>

              <button
                type="button"
                className="auth-link-btn"
                onClick={() => switchPrimaryTab('sign-in')}
              >
                Cancel
              </button>
            </form>
          )}

          {step === 'forgot-request' && (
            <form className="auth-form" onSubmit={handleStartForgotPassword}>
              <div className="auth-step-header">
                <span className="dock-kicker">RESET PASSWORD</span>
                <p className="auth-step-copy">
                  Enter your account email to receive a 6-digit reset code.
                </p>
              </div>

              <div className="field-group">
                <label htmlFor="cognito-reset-email">Email address</label>
                <input
                  id="cognito-reset-email"
                  type="email"
                  autoComplete="email"
                  required
                  placeholder="engineer@agency.gov"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              <button
                type="submit"
                className="primary-btn auth-submit-btn"
                disabled={busy}
              >
                {busy ? 'Sending code…' : 'Send reset code'}
              </button>

              <div className="auth-secondary-row">
                <button
                  type="button"
                  className="auth-link-btn"
                  onClick={() => switchPrimaryTab('sign-in')}
                >
                  Back to sign in
                </button>
              </div>
            </form>
          )}

          {step === 'forgot-confirm' && (
            <form className="auth-form" onSubmit={handleConfirmForgotPassword}>
              <div className="auth-step-header">
                <span className="dock-kicker">CONFIRM NEW PASSWORD</span>
                <p className="auth-step-copy">
                  Enter the code sent
                  {deliveryHint ? ` to ${deliveryHint}` : ''} and choose a new
                  password.
                </p>
              </div>

              <div className="field-group">
                <label htmlFor="cognito-reset-code">Reset code</label>
                <input
                  id="cognito-reset-code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                  className="auth-code-input"
                  placeholder="123456"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                />
              </div>

              <div className="field-group">
                <label htmlFor="cognito-reset-new-pw">New password</label>
                <input
                  id="cognito-reset-new-pw"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  minLength={8}
                  placeholder="8+ chars, upper/lower, number & symbol"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              <div className="field-group">
                <label htmlFor="cognito-reset-confirm-pw">
                  Confirm new password
                </label>
                <input
                  id="cognito-reset-confirm-pw"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  minLength={8}
                  placeholder="Re-enter new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>

              <button
                type="submit"
                className="primary-btn auth-submit-btn"
                disabled={busy}
              >
                {busy ? 'Updating password…' : 'Update password'}
              </button>

              <div className="auth-secondary-row">
                <button
                  type="button"
                  className="auth-link-btn"
                  onClick={() => switchPrimaryTab('sign-in')}
                >
                  Back to sign in
                </button>
              </div>
            </form>
          )}

          {!configured && (
            <div className="auth-preview-callout">
              <button
                type="button"
                className="utility-btn auth-preview-btn"
                onClick={() =>
                  onAuthenticated({
                    mode: 'local-preview',
                    email: 'Local Preview',
                    username: 'local-preview',
                  })
                }
              >
                Continue in Local Preview
              </button>
            </div>
          )}
        </div>
      </section>
    </main>
  );
};
