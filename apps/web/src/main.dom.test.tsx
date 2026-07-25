/** @file Web host bootstrap tests / Web host bootstrap tests. */

import { cleanup, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

afterEach((): void => {
  cleanup()
  vi.restoreAllMocks()
  vi.resetModules()
  vi.unstubAllEnvs()
})

beforeEach((): void => {
  document.body.innerHTML = '<div id="root"></div>'
  window.history.replaceState(null, '', '/')
  vi.spyOn(console, 'error').mockImplementation((): void => {})
  vi.spyOn(console, 'info').mockImplementation((): void => {})
  vi.spyOn(console, 'log').mockImplementation((): void => {})
})

describe('Web bootstrap', (): void => {
  it('renders the real OAuth entry screen for valid local development configuration', async (): Promise<void> => {
    vi.stubEnv('VITE_OAUTH_CLIENT_ID', 'aiws-web-local')

    await import('./main')

    expect(
      await screen.findByRole('heading', { name: 'Continue to your job workspace' })
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument()
    expect(screen.queryByText('The application cannot start')).not.toBeInTheDocument()
  })

  it('renders an actionable startup error when the public client ID is missing', async (): Promise<void> => {
    await import('./main')

    expect(
      await screen.findByRole('heading', { name: 'The application cannot start' })
    ).toBeInTheDocument()
    expect(screen.getByText(/Create apps\/web\/\.env/u)).toBeInTheDocument()
  })
})
