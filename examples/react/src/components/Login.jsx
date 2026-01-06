import { useState } from 'react';
import styles from './Login.module.css';
import { CONFIG } from '../constants/config';

export function Login({ onLogin, onRegister, isLoading, error }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [validationError, setValidationError] = useState('');

  // Validation functions
  const validateEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const validatePassword = (password) => {
    return password.length >= CONFIG.MIN_PASSWORD_LENGTH;
  };

  const validateForm = () => {
    setValidationError('');

    if (!email.trim()) {
      setValidationError('Email is required');
      return false;
    }

    if (!validateEmail(email)) {
      setValidationError('Please enter a valid email address');
      return false;
    }

    if (!password) {
      setValidationError('Password is required');
      return false;
    }

    if (!validatePassword(password)) {
      setValidationError(`Password must be at least ${CONFIG.MIN_PASSWORD_LENGTH} characters`);
      return false;
    }

    return true;
  };

  const handleLogin = async (e) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    try {
      await onLogin(email, password);
    } catch (err) {
      // Error is handled by parent component
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    try {
      await onRegister(email, password);
    } catch (err) {
      // Error is handled by parent component
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <h1 className={styles.title}>WebVox Client</h1>

        <form className={styles.form}>
          <div className={styles.formGroup}>
            <label className={styles.label}>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setValidationError(''); // Clear validation error on input
              }}
              placeholder="Enter your email"
              className={styles.input}
              required
              disabled={isLoading}
            />
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label}>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setValidationError(''); // Clear validation error on input
              }}
              placeholder={`Enter your password (min ${CONFIG.MIN_PASSWORD_LENGTH} characters)`}
              className={styles.input}
              required
              disabled={isLoading}
            />
          </div>

          <div className={styles.buttonGroup}>
            <button
              type="submit"
              onClick={handleLogin}
              className={`${styles.button} ${styles.buttonPrimary}`}
              disabled={isLoading}
            >
              {isLoading ? 'Loading...' : 'Login'}
            </button>
            <button
              type="button"
              onClick={handleRegister}
              className={`${styles.button} ${styles.buttonSecondary}`}
              disabled={isLoading}
            >
              Register
            </button>
          </div>

          {validationError && (
            <div className={styles.error}>
              {validationError}
            </div>
          )}

          {error && !validationError && (
            <div className={styles.error}>
              {error.message}
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
