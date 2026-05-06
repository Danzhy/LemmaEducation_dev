'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { authClient } from '@/lib/auth/client'
import { AUTH_PASSWORD_MIN_LENGTH } from '@/lib/auth/password-policy'

type AuthMode = 'sign-in' | 'sign-up'
type FormField = 'name' | 'email' | 'password'
type FieldErrors = Partial<Record<FormField, string>>

const TUTOR_PATH = '/tutor'
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type AuthResponseError = {
  code?: string
  message?: string
  status?: number
  statusText?: string
} | null

type AuthResponse<T> =
  | {
      data: T
      error: null
    }
  | {
      data: null
      error: NonNullable<AuthResponseError>
    }

function validateSignIn(values: { email: string; password: string }): FieldErrors {
  const errors: FieldErrors = {}

  if (!values.email.trim()) {
    errors.email = 'Enter your email.'
  } else if (!EMAIL_PATTERN.test(values.email.trim())) {
    errors.email = 'Enter a valid email address.'
  }

  if (!values.password) {
    errors.password = 'Enter your password.'
  }

  return errors
}

function validateSignUp(values: { name: string; email: string; password: string }): FieldErrors {
  const errors = validateSignIn(values)
  const trimmedName = values.name.trim()

  if (!trimmedName) {
    errors.name = 'Enter your name.'
  } else if (trimmedName.length < 2) {
    errors.name = 'Use at least 2 characters.'
  } else if (trimmedName.length > 80) {
    errors.name = 'Keep your name under 80 characters.'
  }

  if (!values.password) {
    errors.password = 'Create a password.'
  } else if (values.password.length < AUTH_PASSWORD_MIN_LENGTH) {
    errors.password = `Use at least ${AUTH_PASSWORD_MIN_LENGTH} characters.`
  }

  return errors
}

function mapAuthError(error: AuthResponseError, mode: AuthMode): string {
  if (!error) {
    return mode === 'sign-up'
      ? 'We could not create your account. Please try again.'
      : 'We could not sign you in. Please try again.'
  }

  if (error.status === 429) {
    return 'Too many attempts. Please wait a moment and try again.'
  }

  const normalizedMessage = error.message?.toLowerCase() ?? ''

  switch (error.code) {
    case 'INVALID_EMAIL_OR_PASSWORD':
      return 'Email or password is incorrect.'
    case 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL':
      return 'An account with this email already exists. Sign in instead.'
    case 'VALIDATION_ERROR':
      return error.message ?? 'Please check your details and try again.'
    default:
      break
  }

  if (normalizedMessage.includes('invalid email or password')) {
    return 'Email or password is incorrect.'
  }

  if (normalizedMessage.includes('user already exists')) {
    return 'An account with this email already exists. Sign in instead.'
  }

  if (normalizedMessage.includes('invalid email address')) {
    return 'Enter a valid email address.'
  }

  return error.message ??
    (mode === 'sign-up'
      ? 'We could not create your account. Please try again.'
      : 'We could not sign you in. Please try again.')
}

function getFieldError(
  field: FormField,
  errors: FieldErrors,
  touched: Partial<Record<FormField, boolean>>,
  hasSubmitted: boolean
) {
  if (!hasSubmitted && !touched[field]) {
    return ''
  }

  return errors[field] ?? ''
}

async function postAuthRequest<T>(
  path: string,
  payload: Record<string, string>
): Promise<AuthResponse<T>> {
  try {
    const response = await fetch(path, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      credentials: 'same-origin',
      body: JSON.stringify(payload),
    })

    const body = (await response.json().catch(() => null)) as
      | {
          code?: string
          message?: string
        }
      | null

    if (!response.ok) {
      return {
        data: null,
        error: {
          code: body?.code,
          message: body?.message,
          status: response.status,
          statusText: response.statusText,
        },
      }
    }

    return {
      data: (body ?? {}) as T,
      error: null,
    }
  } catch (error) {
    return {
      data: null,
      error: {
        message: error instanceof Error ? error.message : 'Network error',
      },
    }
  }
}

export function AuthEmailForm({ mode }: { mode: AuthMode }) {
  const session = authClient.useSession?.()

  const [values, setValues] = useState({
    name: '',
    email: '',
    password: '',
  })
  const [touched, setTouched] = useState<Partial<Record<FormField, boolean>>>({})
  const [hasSubmitted, setHasSubmitted] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formError, setFormError] = useState('')

  const validationErrors = useMemo(
    () =>
      mode === 'sign-up'
        ? validateSignUp(values)
        : validateSignIn({ email: values.email, password: values.password }),
    [mode, values]
  )

  const navigateToTutor = () => {
    // Use a hard navigation so route-scoped auth assets/styles fully unload
    // before the tutor workspace renders.
    window.location.replace(TUTOR_PATH)
  }

  useEffect(() => {
    if (session?.data) {
      navigateToTutor()
    }
  }, [session?.data])

  const setFieldValue = (field: FormField, value: string) => {
    setValues((current) => ({ ...current, [field]: value }))
    setFormError('')
  }

  const handleBlur = (field: FormField) => {
    setTouched((current) => ({ ...current, [field]: true }))
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setHasSubmitted(true)

    if (Object.keys(validationErrors).length > 0) {
      return
    }

    setIsSubmitting(true)
    setFormError('')

    try {
      if (mode === 'sign-up') {
        const response = await postAuthRequest<{ token?: string; user: { id: string } }>(
          '/api/auth/sign-up/email',
          {
          name: values.name.trim(),
          email: values.email.trim(),
          password: values.password,
          }
        )

        if (response.error) {
          setFormError(mapAuthError(response.error, mode))
          return
        }
      } else {
        const response = await postAuthRequest<{ token?: string; user: { id: string } }>(
          '/api/auth/sign-in/email',
          {
          email: values.email.trim(),
          password: values.password,
          }
        )

        if (response.error) {
          setFormError(mapAuthError(response.error, mode))
          return
        }
      }

      navigateToTutor()
    } catch (error) {
      const message = error instanceof Error ? error.message : null
      setFormError(
        message && message.trim()
          ? message
          : mode === 'sign-up'
            ? 'We could not create your account. Please try again.'
            : 'We could not sign you in. Please try again.'
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form className="lemma-auth-form" noValidate onSubmit={handleSubmit}>
      {mode === 'sign-up' ? (
        <div className="lemma-auth-field">
          <label className="lemma-auth-label" htmlFor="auth-name">
            Name
          </label>
          <input
            id="auth-name"
            autoComplete="name"
            className="lemma-auth-input"
            maxLength={80}
            name="name"
            onBlur={() => handleBlur('name')}
            onChange={(event) => setFieldValue('name', event.target.value)}
            type="text"
            value={values.name}
          />
          {getFieldError('name', validationErrors, touched, hasSubmitted) ? (
            <p className="lemma-auth-error" role="alert">
              {getFieldError('name', validationErrors, touched, hasSubmitted)}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="lemma-auth-field">
        <label className="lemma-auth-label" htmlFor="auth-email">
          Email
        </label>
        <input
          id="auth-email"
          autoCapitalize="none"
          autoComplete="email"
          className="lemma-auth-input"
          inputMode="email"
          name="email"
          onBlur={() => handleBlur('email')}
          onChange={(event) => setFieldValue('email', event.target.value)}
          placeholder="m@example.com"
          spellCheck={false}
          type="email"
          value={values.email}
        />
        {getFieldError('email', validationErrors, touched, hasSubmitted) ? (
          <p className="lemma-auth-error" role="alert">
            {getFieldError('email', validationErrors, touched, hasSubmitted)}
          </p>
        ) : null}
      </div>

      <div className="lemma-auth-field">
        <div className="flex items-center justify-between gap-4">
          <label className="lemma-auth-label" htmlFor="auth-password">
            Password
          </label>
          {mode === 'sign-in' ? (
            <Link className="lemma-auth-inline-link" href="/auth/forgot-password">
              Forgot your password?
            </Link>
          ) : null}
        </div>
        <input
          id="auth-password"
          autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
          className="lemma-auth-input"
          name="password"
          onBlur={() => handleBlur('password')}
          onChange={(event) => setFieldValue('password', event.target.value)}
          type="password"
          value={values.password}
        />
        {getFieldError('password', validationErrors, touched, hasSubmitted) ? (
          <p className="lemma-auth-error" role="alert">
            {getFieldError('password', validationErrors, touched, hasSubmitted)}
          </p>
        ) : null}
      </div>

      {formError ? (
        <div className="lemma-auth-form-alert" role="alert">
          {formError}
        </div>
      ) : null}

      <button className="lemma-auth-submit" disabled={isSubmitting} type="submit">
        {isSubmitting
          ? mode === 'sign-up'
            ? 'Creating account...'
            : 'Signing in...'
          : mode === 'sign-up'
            ? 'Create account'
            : 'Sign in'}
      </button>

      <p className="lemma-auth-footer">
        {mode === 'sign-up' ? 'Already have an account?' : "Don't have an account?"}{' '}
        <Link className="lemma-auth-inline-link" href={mode === 'sign-up' ? '/auth/sign-in' : '/auth/sign-up'}>
          {mode === 'sign-up' ? 'Sign in' : 'Create account'}
        </Link>
      </p>
    </form>
  )
}
